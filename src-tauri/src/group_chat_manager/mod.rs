//! Group Chat Manager
//!
//! This module handles group chat functionality including:
//! - Dynamic character selection based on context (via LLM tool calling)
//! - @mention parsing to force specific characters
//! - Building selection prompts with participation stats
//! - Coordinating with the chat_manager for actual response generation
//! - Full dynamic memory system support (decay, hot/cold, summarization, tool updates)

mod selection;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::api::{api_request, ApiRequest};
use crate::models::get_model_pricing;
use crate::usage::add_usage_record;
use crate::usage::tracking::{RequestUsage, UsageFinishReason, UsageOperationType};

use crate::chat_manager::dynamic_memory::{
    context_enrichment_enabled, dynamic_cold_threshold, dynamic_decay_rate,
    dynamic_hot_memory_token_budget, dynamic_max_entries, dynamic_min_similarity,
    dynamic_window_size, generate_memory_id, is_dynamic_memory_enabled,
};
use crate::chat_manager::prompts::{
    self, APP_DYNAMIC_MEMORY_TEMPLATE_ID, APP_DYNAMIC_SUMMARY_TEMPLATE_ID,
};
use crate::chat_manager::request::{extract_error_message, extract_text, extract_usage};
use crate::chat_manager::request_builder;
use crate::chat_manager::service::resolve_api_key;
use crate::chat_manager::storage::{load_personas, load_settings, select_model};
use crate::chat_manager::tooling::{
    parse_tool_calls, ToolCall, ToolChoice, ToolConfig, ToolDefinition,
};
use crate::chat_manager::types::{Character, Model, Persona, ProviderCredential, Settings};
use crate::embedding_model;
use crate::models::calculate_request_cost;
use crate::storage_manager::db::{now_ms, SwappablePool};
use crate::storage_manager::group_sessions::{
    self, group_session_update_memories_internal, GroupMessage, GroupParticipation, GroupSession,
    MemoryEmbedding, UsageSummary,
};
use crate::utils::{log_error, log_info, log_warn, now_millis};

pub use selection::parse_mentions;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupChatResponse {
    pub message: GroupMessage,
    pub character_id: String,
    pub character_name: String,
    pub reasoning: Option<String>,
    pub selection_reasoning: Option<String>,
    pub was_mentioned: bool,
    pub participation_stats: Vec<GroupParticipation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub personality_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupChatContext {
    pub session: GroupSession,
    pub characters: Vec<CharacterInfo>,
    pub participation_stats: Vec<GroupParticipation>,
    pub recent_messages: Vec<GroupMessage>,
    pub user_message: String,
}

// ============================================================================
// Usage Tracking Helper
// ============================================================================

/// Record usage for group chat operations
async fn record_group_usage(
    app: &AppHandle,
    usage: &Option<crate::chat_manager::types::UsageSummary>,
    session: &GroupSession,
    character: &Character,
    model: &Model,
    provider_cred: &ProviderCredential,
    api_key: &str,
    operation_type: UsageOperationType,
    log_scope: &str,
) {
    let Some(usage_info) = usage else {
        return;
    };

    let mut request_usage = RequestUsage {
        id: Uuid::new_v4().to_string(),
        timestamp: now_millis().unwrap_or(0),
        session_id: session.id.clone(),
        character_id: character.id.clone(),
        character_name: character.name.clone(),
        model_id: model.id.clone(),
        model_name: model.name.clone(),
        provider_id: provider_cred.provider_id.clone(),
        provider_label: provider_cred.provider_id.clone(),
        operation_type,
        finish_reason: usage_info
            .finish_reason
            .as_ref()
            .and_then(|s| UsageFinishReason::from_str(s)),
        prompt_tokens: usage_info.prompt_tokens,
        completion_tokens: usage_info.completion_tokens,
        total_tokens: usage_info.total_tokens,
        memory_tokens: None,
        summary_tokens: None,
        reasoning_tokens: usage_info.reasoning_tokens,
        image_tokens: usage_info.image_tokens,
        cost: None,
        success: true,
        error_message: None,
        metadata: Default::default(),
    };

    // Calculate memory and summary token counts from group session
    let memory_token_count: u64 = session
        .memory_embeddings
        .iter()
        .map(|m| m.token_count as u64)
        .sum();

    let summary_token_count = session.memory_summary_token_count as u64;

    if memory_token_count > 0 {
        request_usage.memory_tokens = Some(memory_token_count);
    }

    if summary_token_count > 0 {
        request_usage.summary_tokens = Some(summary_token_count);
    }

    // Calculate cost for OpenRouter
    if provider_cred.provider_id.eq_ignore_ascii_case("openrouter") {
        match get_model_pricing(
            app.clone(),
            &provider_cred.provider_id,
            &model.name,
            Some(api_key),
        )
        .await
        {
            Ok(Some(pricing)) => {
                if let Some(cost) = calculate_request_cost(
                    usage_info.prompt_tokens.map(|v| v as u64).unwrap_or(0),
                    usage_info.completion_tokens.map(|v| v as u64).unwrap_or(0),
                    &pricing,
                ) {
                    request_usage.cost = Some(cost.clone());
                    log_info(
                        app,
                        log_scope,
                        format!(
                            "calculated cost for group chat request: ${:.6}",
                            cost.total_cost
                        ),
                    );
                }
            }
            Ok(None) => {
                log_warn(
                    app,
                    log_scope,
                    "no pricing found for model (might be free)".to_string(),
                );
            }
            Err(err) => {
                log_error(app, log_scope, format!("failed to fetch pricing: {}", err));
            }
        }
    }

    if let Err(e) = add_usage_record(app, request_usage) {
        log_error(
            app,
            log_scope,
            format!("failed to record group chat usage: {}", e),
        );
    }
}

/// Record usage for decision maker (speaker selection) operations
async fn record_decision_maker_usage(
    app: &AppHandle,
    usage: &Option<crate::chat_manager::types::UsageSummary>,
    session: &GroupSession,
    model: &Model,
    provider_cred: &ProviderCredential,
    api_key: &str,
    log_scope: &str,
) {
    let Some(usage_info) = usage else {
        return;
    };

    let mut request_usage = RequestUsage {
        id: Uuid::new_v4().to_string(),
        timestamp: now_millis().unwrap_or(0),
        session_id: session.id.clone(),
        character_id: "decision_maker".to_string(),
        character_name: "Decision Maker".to_string(),
        model_id: model.id.clone(),
        model_name: model.name.clone(),
        provider_id: provider_cred.provider_id.clone(),
        provider_label: provider_cred.provider_id.clone(),
        operation_type: UsageOperationType::GroupChatDecisionMaker,
        finish_reason: usage_info
            .finish_reason
            .as_ref()
            .and_then(|s| UsageFinishReason::from_str(s)),
        prompt_tokens: usage_info.prompt_tokens,
        completion_tokens: usage_info.completion_tokens,
        total_tokens: usage_info.total_tokens,
        memory_tokens: None,
        summary_tokens: None,
        reasoning_tokens: usage_info.reasoning_tokens,
        image_tokens: usage_info.image_tokens,
        cost: None,
        success: true,
        error_message: None,
        metadata: Default::default(),
    };

    // Calculate cost for OpenRouter
    if provider_cred.provider_id.eq_ignore_ascii_case("openrouter") {
        match get_model_pricing(
            app.clone(),
            &provider_cred.provider_id,
            &model.name,
            Some(api_key),
        )
        .await
        {
            Ok(Some(pricing)) => {
                if let Some(cost) = calculate_request_cost(
                    usage_info.prompt_tokens.map(|v| v as u64).unwrap_or(0),
                    usage_info.completion_tokens.map(|v| v as u64).unwrap_or(0),
                    &pricing,
                ) {
                    request_usage.cost = Some(cost.clone());
                    log_info(
                        app,
                        log_scope,
                        format!(
                            "calculated cost for decision maker: ${:.6}",
                            cost.total_cost
                        ),
                    );
                }
            }
            Ok(None) => {}
            Err(_) => {}
        }
    }

    if let Err(e) = add_usage_record(app, request_usage) {
        log_error(
            app,
            log_scope,
            format!("failed to record decision maker usage: {}", e),
        );
    }
}

// ============================================================================
// Memory Management Functions
// ============================================================================

/// Calculate total tokens used by hot (non-cold) memories
fn calculate_hot_memory_tokens(session: &GroupSession) -> u32 {
    session
        .memory_embeddings
        .iter()
        .filter(|m| !m.is_cold)
        .map(|m| m.token_count as u32)
        .sum()
}

/// Enforce the hot memory token budget by demoting oldest memories to cold storage.
fn enforce_hot_memory_budget(app: &AppHandle, session: &mut GroupSession, budget: u32) -> usize {
    let mut current_tokens = calculate_hot_memory_tokens(session);

    if current_tokens <= budget {
        return 0;
    }

    // Sort hot memories by last_accessed_at (oldest first) for demotion
    let mut hot_indices: Vec<(usize, i64)> = session
        .memory_embeddings
        .iter()
        .enumerate()
        .filter(|(_, m)| !m.is_cold && !m.is_pinned)
        .map(|(i, m)| (i, m.last_accessed_at))
        .collect();

    hot_indices.sort_by_key(|(_, accessed)| *accessed);

    let mut demoted_count = 0;

    for (idx, _) in hot_indices {
        if current_tokens <= budget {
            break;
        }

        let memory = &mut session.memory_embeddings[idx];
        let tokens_freed = memory.token_count as u32;
        memory.is_cold = true;
        current_tokens = current_tokens.saturating_sub(tokens_freed);
        demoted_count += 1;

        log_info(
            app,
            "group_dynamic_memory",
            format!(
                "Demoted memory {} to cold storage (freed {} tokens)",
                memory.id, tokens_freed
            ),
        );
    }

    demoted_count
}

/// Apply importance decay to all hot, unpinned memories.
/// Memories that fall below cold_threshold are demoted to cold storage.
fn apply_memory_decay(
    app: &AppHandle,
    session: &mut GroupSession,
    decay_rate: f32,
    cold_threshold: f32,
) -> (usize, usize) {
    let mut decayed = 0;
    let mut demoted = 0;

    for mem in session.memory_embeddings.iter_mut() {
        if mem.is_cold || mem.is_pinned {
            continue;
        }

        mem.importance_score = (mem.importance_score - decay_rate).max(0.0);
        decayed += 1;

        if mem.importance_score < cold_threshold {
            mem.is_cold = true;
            demoted += 1;
            log_info(
                app,
                "group_dynamic_memory",
                format!(
                    "Memory {} demoted to cold (score: {:.2} < threshold: {:.2})",
                    mem.id, mem.importance_score, cold_threshold
                ),
            );
        }
    }

    (decayed, demoted)
}

/// Promote cold memories to hot (called when they match a keyword search)
fn promote_cold_memories(app: &AppHandle, session: &mut GroupSession, memory_ids: &[String]) {
    let now = now_millis().unwrap_or_default();
    for mem in session.memory_embeddings.iter_mut() {
        if memory_ids.contains(&mem.id) && mem.is_cold {
            mem.is_cold = false;
            mem.importance_score = 0.7;
            mem.last_accessed_at = now as i64;
            mem.access_count += 1;
            log_info(
                app,
                "group_dynamic_memory",
                format!("Promoted cold memory {} to hot", mem.id),
            );
        }
    }
}

/// Update last_accessed_at and boost importance_score for retrieved memories
fn mark_memories_accessed(session: &mut GroupSession, memory_ids: &[String]) {
    let now = now_millis().unwrap_or_default();
    for mem in session.memory_embeddings.iter_mut() {
        if memory_ids.contains(&mem.id) {
            mem.last_accessed_at = now as i64;
            mem.access_count += 1;
            mem.importance_score = 1.0;
        }
    }
}

fn format_memories_with_ids(session: &GroupSession) -> Vec<String> {
    session
        .memory_embeddings
        .iter()
        .map(|m| format!("[{}] {}", m.id, m.text))
        .collect()
}

/// Build an enriched query from the last 2 messages for better memory retrieval.
fn build_enriched_query(messages: &[GroupMessage]) -> String {
    let convo: Vec<&GroupMessage> = messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .collect();

    match convo.len() {
        0 => String::new(),
        1 => convo[0].content.clone(),
        _ => {
            let last = &convo[convo.len() - 1];
            let second_last = &convo[convo.len() - 2];
            format!("{}\n{}", second_last.content, last.content)
        }
    }
}

fn conversation_count(messages: &[GroupMessage]) -> usize {
    messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .count()
}

fn conversation_window(messages: &[GroupMessage], limit: usize) -> Vec<GroupMessage> {
    let mut convo: Vec<GroupMessage> = messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .cloned()
        .collect();
    if convo.len() > limit {
        convo.drain(0..(convo.len() - limit));
    }
    convo
}

// ============================================================================
// Memory Retrieval
// ============================================================================

/// Compute cosine similarity between two embedding vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    let denom = norm_a * norm_b;
    if denom == 0.0 {
        return 0.0;
    }
    dot / denom
}

/// Select relevant memories from a group session using semantic search
async fn select_relevant_memories(
    app: &AppHandle,
    session: &GroupSession,
    query: &str,
    limit: usize,
    min_similarity: f32,
) -> Vec<MemoryEmbedding> {
    if query.is_empty() || session.memory_embeddings.is_empty() {
        return Vec::new();
    }

    let query_embedding =
        match embedding_model::compute_embedding(app.clone(), query.to_string()).await {
            Ok(vec) => vec,
            Err(err) => {
                log_warn(
                    app,
                    "group_memory_retrieval",
                    format!("embedding failed: {}", err),
                );
                return Vec::new();
            }
        };

    // Only search hot (non-cold) memories
    let mut scored: Vec<(f32, &MemoryEmbedding)> = session
        .memory_embeddings
        .iter()
        .filter(|m| !m.embedding.is_empty() && !m.is_cold)
        .map(|m| (cosine_similarity(&query_embedding, &m.embedding), m))
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let hot_results: Vec<MemoryEmbedding> = scored
        .into_iter()
        .take(limit)
        .filter(|(score, _)| *score >= min_similarity)
        .map(|(_, m)| m.clone())
        .collect();

    // If hot results are empty, try keyword search on cold memories
    if hot_results.is_empty() {
        let matches = search_memories_by_keyword(session, query, limit);
        if !matches.is_empty() {
            log_info(
                app,
                "group_memory_retrieval",
                format!("Found {} memories via keyword search", matches.len()),
            );
        }
        return matches;
    }

    hot_results
}

/// Search memories using simple keyword matching (fallback for cold memories)
fn search_memories_by_keyword(
    session: &GroupSession,
    query: &str,
    limit: usize,
) -> Vec<MemoryEmbedding> {
    let query_lower = query.to_lowercase();
    // Extract keywords (words 3+ chars)
    let keywords: Vec<&str> = query_lower
        .split_whitespace()
        .filter(|w| w.len() >= 3)
        .collect();

    if keywords.is_empty() {
        return Vec::new();
    }

    let mut matches: Vec<(usize, MemoryEmbedding)> = session
        .memory_embeddings
        .iter()
        .filter_map(|m| {
            let text_lower = m.text.to_lowercase();
            let match_count = keywords
                .iter()
                .filter(|kw| text_lower.contains(*kw))
                .count();
            if match_count > 0 {
                Some((match_count, m.clone()))
            } else {
                None
            }
        })
        .collect();

    matches.sort_by(|a, b| b.0.cmp(&a.0));
    matches.into_iter().take(limit).map(|(_, m)| m).collect()
}

/// Format memories as a string block for injection into prompts

// ============================================================================
// Dynamic Memory Cycle
// ============================================================================

/// Process dynamic memory cycle for group chat after a response
async fn process_group_dynamic_memory_cycle(
    app: &AppHandle,
    session: &mut GroupSession,
    settings: &Settings,
    pool: &State<'_, SwappablePool>,
) -> Result<(), String> {
    if !is_dynamic_memory_enabled(settings) {
        log_info(
            app,
            "group_dynamic_memory",
            "dynamic memory disabled globally; skipping",
        );
        return Ok(());
    }

    let window_size = dynamic_window_size(settings);
    let conn = pool.get_connection()?;

    // Load recent messages
    let messages_json =
        group_sessions::group_messages_list_internal(&conn, &session.id, 100, None, None)?;
    let messages: Vec<GroupMessage> = serde_json::from_str(&messages_json).unwrap_or_default();

    let total_convo = conversation_count(&messages);
    let convo_window = conversation_window(&messages, window_size);

    log_info(
        app,
        "group_dynamic_memory",
        format!(
            "snapshot: window_size={} total_convo={} convo_window_count={}",
            window_size,
            total_convo,
            convo_window.len()
        ),
    );

    if convo_window.is_empty() {
        log_warn(
            app,
            "group_dynamic_memory",
            "no messages in window; skipping",
        );
        return Ok(());
    }

    // Check if enough new messages since last run (match normal chat behavior)
    // Use last_window_end from memory_tool_events to track progress
    let last_window_end = session
        .memory_tool_events
        .last()
        .and_then(|e| e.get("windowEnd").and_then(|v| v.as_u64()))
        .unwrap_or(0) as usize;

    log_info(
        app,
        "group_dynamic_memory",
        format!(
            "considering dynamic memory: total_convo={} window_size={} last_window_end={}",
            total_convo, window_size, last_window_end
        ),
    );

    if total_convo <= last_window_end {
        log_info(
            app,
            "group_dynamic_memory",
            "no new messages since last run; skipping",
        );
        return Ok(());
    }

    if total_convo - last_window_end < window_size {
        log_info(
            app,
            "group_dynamic_memory",
            format!(
                "not enough new messages since last run (needed {}, got {})",
                window_size,
                total_convo - last_window_end
            ),
        );
        return Ok(());
    }

    // Apply importance decay
    let decay_rate = dynamic_decay_rate(settings);
    let cold_threshold = dynamic_cold_threshold(settings);
    let (decayed, demoted) = apply_memory_decay(app, session, decay_rate, cold_threshold);
    if decayed > 0 || demoted > 0 {
        log_info(
            app,
            "group_dynamic_memory",
            format!(
                "Memory decay applied: {} decayed, {} demoted to cold",
                decayed, demoted
            ),
        );
    }

    // Get summarisation model
    let Some(advanced) = settings.advanced_settings.as_ref() else {
        log_info(
            app,
            "group_dynamic_memory",
            "no advanced settings; skipping",
        );
        return Ok(());
    };

    let summarisation_model_id = match advanced.summarisation_model_id.as_ref() {
        Some(id) => id.clone(),
        None => {
            log_warn(
                app,
                "group_dynamic_memory",
                "summarisation model not configured",
            );
            return Ok(());
        }
    };

    let (summary_model, summary_provider) =
        find_model_and_credential(settings, &summarisation_model_id).ok_or_else(|| {
            log_error(
                app,
                "group_dynamic_memory",
                "summarisation model unavailable",
            );
            "Summarisation model unavailable".to_string()
        })?;

    let api_key = resolve_api_key(app, summary_provider, "group_dynamic_memory")?;

    let _ = app.emit(
        "group-dynamic-memory:processing",
        json!({ "sessionId": session.id }),
    );

    // Summarize messages
    let summary = match summarize_group_messages(
        app,
        summary_provider,
        summary_model,
        &api_key,
        &convo_window,
        if session.memory_summary.is_empty() {
            None
        } else {
            Some(session.memory_summary.as_str())
        },
        settings,
    )
    .await
    {
        Ok(s) => s,
        Err(err) => {
            log_error(
                app,
                "group_dynamic_memory",
                format!("summarization failed: {}", err),
            );
            let _ = app.emit(
                "group-dynamic-memory:error",
                json!({ "sessionId": session.id, "error": err }),
            );
            return Err(err);
        }
    };

    log_info(
        app,
        "group_dynamic_memory",
        format!(
            "summary length={} chars; invoking memory tools",
            summary.len()
        ),
    );

    // Run memory tool update
    let _actions = match run_group_memory_tool_update(
        app,
        summary_provider,
        summary_model,
        &api_key,
        session,
        settings,
        &summary,
        &convo_window,
    )
    .await
    {
        Ok(actions) => actions,
        Err(err) => {
            log_error(
                app,
                "group_dynamic_memory",
                format!("memory tool update failed: {}", err),
            );
            session.memory_summary = summary;
            session.memory_summary_token_count =
                crate::tokenizer::count_tokens(app, &session.memory_summary).unwrap_or(0) as i32;
            let _ = save_group_session_memories(app, session, pool);
            let _ = app.emit(
                "group-dynamic-memory:error",
                json!({ "sessionId": session.id, "error": err }),
            );
            return Ok(());
        }
    };

    // Update summary
    session.memory_summary = summary;
    session.memory_summary_token_count =
        crate::tokenizer::count_tokens(app, &session.memory_summary).unwrap_or(0) as i32;

    // Enforce token budget
    let token_budget = dynamic_hot_memory_token_budget(settings);
    let demoted = enforce_hot_memory_budget(app, session, token_budget);
    if demoted > 0 {
        log_info(
            app,
            "group_dynamic_memory",
            format!(
                "Demoted {} memories to cold storage (budget: {} tokens)",
                demoted, token_budget
            ),
        );
    }

    // Enforce max entries
    let max_entries = dynamic_max_entries(settings);
    if session.memory_embeddings.len() > max_entries {
        let excess = session.memory_embeddings.len() - max_entries;
        session.memory_embeddings.drain(0..excess);
    }

    // Record this memory cycle with windowEnd tracking (like normal chat)
    let memory_event = json!({
        "type": "memory_cycle",
        "windowEnd": total_convo,
        "timestamp": crate::utils::now_millis().unwrap_or(0),
        "memoriesCount": session.memory_embeddings.len(),
    });
    session.memory_tool_events.push(memory_event);

    // Save session memories
    save_group_session_memories(app, session, pool)?;

    let _ = app.emit(
        "group-dynamic-memory:success",
        json!({ "sessionId": session.id }),
    );

    log_info(
        app,
        "group_dynamic_memory",
        format!(
            "dynamic memory cycle complete: memories={}, windowEnd={}",
            session.memory_embeddings.len(),
            total_convo
        ),
    );

    Ok(())
}

/// Summarize group messages using LLM
async fn summarize_group_messages(
    app: &AppHandle,
    provider_cred: &ProviderCredential,
    model: &Model,
    api_key: &str,
    convo_window: &[GroupMessage],
    prior_summary: Option<&str>,
    settings: &Settings,
) -> Result<String, String> {
    let mut messages_for_api = Vec::new();
    let system_role = request_builder::system_role_for(provider_cred);

    let summary_template = prompts::get_template(app, APP_DYNAMIC_SUMMARY_TEMPLATE_ID)
        .ok()
        .flatten()
        .map(|t| t.content)
        .unwrap_or_else(|| {
            "Summarize the recent group conversation into a concise paragraph capturing key facts, decisions, and character interactions. Note which characters said what when relevant.".to_string()
        });

    let prev_text = prior_summary
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("No previous summary provided.");
    let rendered = summary_template.replace("{{prev_summary}}", prev_text);

    crate::chat_manager::messages::push_system_message(
        &mut messages_for_api,
        &system_role,
        Some(rendered),
    );

    // Add conversation messages with speaker labels
    for msg in convo_window {
        let speaker = msg
            .speaker_character_id
            .as_ref()
            .map(|_| "Character")
            .unwrap_or(if msg.role == "user" {
                "User"
            } else {
                "Character"
            });
        messages_for_api.push(json!({
            "role": msg.role,
            "content": format!("[{}]: {}", speaker, msg.content)
        }));
    }

    messages_for_api.push(json!({
        "role": "user",
        "content": "Return only the concise summary for the above group conversation. Use the write_summary tool."
    }));

    let max_tokens = settings
        .advanced_model_settings
        .max_output_tokens
        .unwrap_or(2048);

    let built = request_builder::build_chat_request(
        provider_cred,
        api_key,
        &model.name,
        &messages_for_api,
        None,
        0.2,
        1.0,
        max_tokens,
        false,
        None,
        None,
        None,
        None,
        Some(&summarization_tool_config()),
        false,
        None,
        None,
    );

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(60_000),
        stream: Some(false),
        request_id: built.request_id.clone(),
        provider_id: Some(provider_cred.provider_id.clone()),
    };

    let api_response = api_request(app.clone(), api_request_payload).await?;

    if !api_response.ok {
        let fallback = format!("Provider returned status {}", api_response.status);
        let err_message = extract_error_message(api_response.data()).unwrap_or(fallback.clone());
        return Err(err_message);
    }

    let calls = parse_tool_calls(&provider_cred.provider_id, api_response.data());
    for call in calls {
        if call.name == "write_summary" {
            if let Some(summary) = call
                .arguments
                .get("summary")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
            {
                if !summary.is_empty() {
                    return Ok(summary);
                }
            }
        }
    }

    extract_text(api_response.data())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Failed to summarize group messages".to_string())
}

/// Run memory tool update for group chat
async fn run_group_memory_tool_update(
    app: &AppHandle,
    provider_cred: &ProviderCredential,
    model: &Model,
    api_key: &str,
    session: &mut GroupSession,
    settings: &Settings,
    summary: &str,
    convo_window: &[GroupMessage],
) -> Result<Vec<Value>, String> {
    let tool_config = build_memory_tool_config();
    let max_entries = dynamic_max_entries(settings);

    let mut messages_for_api = Vec::new();
    let system_role = request_builder::system_role_for(provider_cred);

    let base_template = prompts::get_template(app, APP_DYNAMIC_MEMORY_TEMPLATE_ID)
        .ok()
        .flatten()
        .map(|t| t.content)
        .unwrap_or_else(|| {
            "You maintain long-term memories for this group chat. Use tools to add or delete concise factual memories about the conversation and characters. Keep the list tidy and capped at {{max_entries}} entries. When finished, call the done tool.".to_string()
        });

    let current_tokens = calculate_hot_memory_tokens(session);
    let token_budget = dynamic_hot_memory_token_budget(settings);

    let rendered = base_template
        .replace("{{max_entries}}", &max_entries.to_string())
        .replace("{{current_memory_tokens}}", &current_tokens.to_string())
        .replace("{{hot_token_budget}}", &token_budget.to_string());

    crate::chat_manager::messages::push_system_message(
        &mut messages_for_api,
        &system_role,
        Some(rendered),
    );

    let memory_lines = format_memories_with_ids(session);
    let convo_text: Vec<String> = convo_window
        .iter()
        .map(|m| format!("{}: {}", m.role, m.content))
        .collect();

    messages_for_api.push(json!({
        "role": "user",
        "content": format!(
            "Group conversation summary:\n{}\n\nRecent messages:\n{}\n\nCurrent memories (with IDs):\n{}",
            summary,
            convo_text.join("\n"),
            if memory_lines.is_empty() { "none".to_string() } else { memory_lines.join("\n") }
        )
    }));

    let max_tokens = settings
        .advanced_model_settings
        .max_output_tokens
        .unwrap_or(2048);

    let built = request_builder::build_chat_request(
        provider_cred,
        api_key,
        &model.name,
        &messages_for_api,
        None,
        0.2,
        1.0,
        max_tokens,
        false,
        None,
        None,
        None,
        None,
        Some(&tool_config),
        false,
        None,
        None,
    );

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(60_000),
        stream: Some(false),
        request_id: built.request_id.clone(),
        provider_id: Some(provider_cred.provider_id.clone()),
    };

    let api_response = api_request(app.clone(), api_request_payload).await?;

    if !api_response.ok {
        let fallback = format!("Provider returned status {}", api_response.status);
        let err_message = extract_error_message(api_response.data()).unwrap_or(fallback.clone());
        return Err(err_message);
    }

    let calls = parse_tool_calls(&provider_cred.provider_id, api_response.data());
    if calls.is_empty() {
        log_warn(
            app,
            "group_dynamic_memory",
            "memory tool call returned no tool usage",
        );
        return Ok(Vec::new());
    }

    let mut actions_log: Vec<Value> = Vec::new();
    for call in calls {
        match call.name.as_str() {
            "create_memory" => {
                if let Some(text) = extract_text_argument(&call) {
                    let mem_id = generate_memory_id();
                    let embedding =
                        match embedding_model::compute_embedding(app.clone(), text.clone()).await {
                            Ok(vec) => Some(vec),
                            Err(err) => {
                                log_error(
                                    app,
                                    "group_dynamic_memory",
                                    format!("failed to embed memory: {}", err),
                                );
                                None
                            }
                        };
                    let token_count = crate::tokenizer::count_tokens(app, &text).unwrap_or(0);
                    let is_pinned = call
                        .arguments
                        .get("important")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    session.memories.push(text.clone());
                    session.memory_embeddings.push(MemoryEmbedding {
                        id: mem_id.clone(),
                        text,
                        embedding: embedding.unwrap_or_default(),
                        created_at: now_millis().unwrap_or_default() as i64,
                        token_count: token_count as i32,
                        is_cold: false,
                        last_accessed_at: now_millis().unwrap_or_default() as i64,
                        importance_score: 1.0,
                        is_pinned,
                        access_count: 0,
                    });

                    actions_log.push(json!({
                        "name": "create_memory",
                        "arguments": call.arguments,
                        "memoryId": mem_id,
                        "timestamp": now_millis().unwrap_or_default(),
                    }));

                    log_info(
                        app,
                        "group_dynamic_memory",
                        format!("Created memory {}", mem_id),
                    );
                }
            }
            "delete_memory" => {
                if let Some(text) = call.arguments.get("text").and_then(|v| v.as_str()) {
                    let sanitized = sanitize_memory_id(text);
                    let target_idx =
                        if sanitized.len() == 6 && sanitized.chars().all(char::is_numeric) {
                            session
                                .memory_embeddings
                                .iter()
                                .position(|m| m.id == sanitized)
                        } else {
                            session.memories.iter().position(|m| m == text).or_else(|| {
                                session
                                    .memory_embeddings
                                    .iter()
                                    .position(|m| m.text == text)
                            })
                        };

                    if let Some(idx) = target_idx {
                        if idx < session.memories.len() {
                            session.memories.remove(idx);
                        }
                        if idx < session.memory_embeddings.len() {
                            let removed = session.memory_embeddings.remove(idx);
                            log_info(
                                app,
                                "group_dynamic_memory",
                                format!("Deleted memory {}", removed.id),
                            );
                        }
                        actions_log.push(json!({
                            "name": "delete_memory",
                            "arguments": call.arguments,
                            "timestamp": now_millis().unwrap_or_default(),
                        }));
                    } else {
                        log_warn(
                            app,
                            "group_dynamic_memory",
                            format!("delete_memory could not find: {}", text),
                        );
                    }
                }
            }
            "pin_memory" => {
                if let Some(raw_id) = call.arguments.get("id").and_then(|v| v.as_str()) {
                    let id = sanitize_memory_id(raw_id);
                    if let Some(mem) = session.memory_embeddings.iter_mut().find(|m| m.id == id) {
                        mem.is_pinned = true;
                        mem.importance_score = 1.0;
                        actions_log.push(json!({
                            "name": "pin_memory",
                            "arguments": call.arguments,
                            "timestamp": now_millis().unwrap_or_default(),
                        }));
                        log_info(app, "group_dynamic_memory", format!("Pinned memory {}", id));
                    }
                }
            }
            "unpin_memory" => {
                if let Some(raw_id) = call.arguments.get("id").and_then(|v| v.as_str()) {
                    let id = sanitize_memory_id(raw_id);
                    if let Some(mem) = session.memory_embeddings.iter_mut().find(|m| m.id == id) {
                        mem.is_pinned = false;
                        actions_log.push(json!({
                            "name": "unpin_memory",
                            "arguments": call.arguments,
                            "timestamp": now_millis().unwrap_or_default(),
                        }));
                        log_info(
                            app,
                            "group_dynamic_memory",
                            format!("Unpinned memory {}", id),
                        );
                    }
                }
            }
            "done" => {
                actions_log.push(json!({
                    "name": "done",
                    "arguments": call.arguments,
                    "timestamp": now_millis().unwrap_or_default(),
                }));
                break;
            }
            _ => {}
        }
    }

    Ok(actions_log)
}

fn extract_text_argument(call: &ToolCall) -> Option<String> {
    if let Some(text) = call
        .arguments
        .get("text")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
    {
        return Some(text);
    }
    call.raw_arguments.clone()
}

fn sanitize_memory_id(id: &str) -> String {
    id.trim()
        .trim_matches(|c| {
            c == '#'
                || c == '*'
                || c == '"'
                || c == '\''
                || c == '['
                || c == ']'
                || c == '('
                || c == ')'
        })
        .to_string()
}

fn build_memory_tool_config() -> ToolConfig {
    ToolConfig {
        tools: vec![
            ToolDefinition {
                name: "create_memory".to_string(),
                description: Some(
                    "Create a concise memory entry capturing important facts from the group chat."
                        .to_string(),
                ),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "text": { "type": "string", "description": "Concise memory to store" },
                        "important": { "type": "boolean", "description": "If true, memory will be pinned (never decays)" }
                    },
                    "required": ["text"]
                }),
            },
            ToolDefinition {
                name: "delete_memory".to_string(),
                description: Some("Delete an outdated or redundant memory.".to_string()),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "text": { "type": "string", "description": "Memory ID (6-digit) or exact text to remove" }
                    },
                    "required": ["text"]
                }),
            },
            ToolDefinition {
                name: "pin_memory".to_string(),
                description: Some("Pin a critical memory so it never decays.".to_string()),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "6-digit memory ID to pin" }
                    },
                    "required": ["id"]
                }),
            },
            ToolDefinition {
                name: "unpin_memory".to_string(),
                description: Some("Unpin a memory, allowing it to decay normally.".to_string()),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "6-digit memory ID to unpin" }
                    },
                    "required": ["id"]
                }),
            },
            ToolDefinition {
                name: "done".to_string(),
                description: Some(
                    "Call this when you have finished adding or deleting memories.".to_string(),
                ),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "summary": { "type": "string", "description": "Optional short note of changes made" }
                    },
                    "required": []
                }),
            },
        ],
        choice: Some(ToolChoice::Any),
    }
}

fn summarization_tool_config() -> ToolConfig {
    ToolConfig {
        tools: vec![ToolDefinition {
            name: "write_summary".to_string(),
            description: Some("Write the conversation summary.".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "summary": { "type": "string", "description": "The conversation summary" }
                },
                "required": ["summary"]
            }),
        }],
        choice: Some(ToolChoice::Required),
    }
}

fn find_model_and_credential<'a>(
    settings: &'a Settings,
    model_id: &str,
) -> Option<(&'a Model, &'a ProviderCredential)> {
    let model = settings.models.iter().find(|m| m.id == model_id)?;
    let provider_cred = settings
        .provider_credentials
        .iter()
        .find(|c| c.provider_id == model.provider_id)?;
    Some((model, provider_cred))
}

fn save_group_session_memories(
    app: &AppHandle,
    session: &GroupSession,
    pool: &State<'_, SwappablePool>,
) -> Result<(), String> {
    let conn = pool.get_connection()?;
    group_session_update_memories_internal(
        &conn,
        &session.id,
        &session.memory_embeddings,
        Some(&session.memory_summary),
        session.memory_summary_token_count,
        &session.memory_tool_events,
    )?;
    log_info(
        app,
        "group_dynamic_memory",
        format!(
            "Saved {} memories for session {}",
            session.memory_embeddings.len(),
            session.id
        ),
    );
    Ok(())
}

// ============================================================================
// Character & Data Loading
// ============================================================================

/// Load full Character struct from database
fn load_character(conn: &rusqlite::Connection, character_id: &str) -> Result<Character, String> {
    // Load character JSON for full data
    let char_json: Option<String> = conn
        .query_row(
            "SELECT json_data FROM characters WHERE id = ?1",
            rusqlite::params![character_id],
            |row| row.get(0),
        )
        .ok();

    if let Some(json_str) = char_json {
        if let Ok(character) = serde_json::from_str::<Character>(&json_str) {
            return Ok(character);
        }
    }

    // Fallback: construct from basic columns
    let row: (String, String, Option<String>, i64, i64, Option<String>) = conn
        .query_row(
            "SELECT id, name, description, created_at, updated_at, default_model_id
             FROM characters WHERE id = ?1",
            rusqlite::params![character_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .map_err(|e| format!("Failed to load character {}: {}", character_id, e))?;

    Ok(Character {
        id: row.0,
        name: row.1,
        description: row.2,
        created_at: row.3 as u64,
        updated_at: row.4 as u64,
        default_model_id: row.5,
        avatar_path: None,
        background_image_path: None,
        rules: Vec::new(),
        scenes: Vec::new(),
        default_scene_id: None,
        memory_type: "manual".to_string(),
        prompt_template_id: None,
        system_prompt: None,
    })
}

/// Load character info for all characters in a group session
fn load_characters_info(
    conn: &rusqlite::Connection,
    character_ids: &[String],
) -> Result<Vec<CharacterInfo>, String> {
    let mut characters = Vec::new();

    for character_id in character_ids {
        let result: Result<(String, Option<String>, Option<String>), _> = conn.query_row(
            "SELECT name, description, system_prompt FROM characters WHERE id = ?1",
            rusqlite::params![character_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );

        if let Ok((name, description, system_prompt)) = result {
            let personality_summary = description.as_ref().or(system_prompt.as_ref()).map(|s| {
                if s.len() > 200 {
                    format!("{}...", &s[..200])
                } else {
                    s.clone()
                }
            });

            characters.push(CharacterInfo {
                id: character_id.clone(),
                name,
                description,
                personality_summary,
            });
        }
    }

    Ok(characters)
}

/// Load recent messages from a group session
fn load_recent_group_messages(
    conn: &rusqlite::Connection,
    session_id: &str,
    limit: i32,
) -> Result<Vec<GroupMessage>, String> {
    let messages_json =
        group_sessions::group_messages_list_internal(conn, session_id, limit, None, None)?;
    let messages: Vec<GroupMessage> =
        serde_json::from_str(&messages_json).map_err(|e| e.to_string())?;
    Ok(messages)
}

/// Build the full context for character selection
fn build_selection_context(
    conn: &rusqlite::Connection,
    session_id: &str,
    user_message: &str,
) -> Result<GroupChatContext, String> {
    let session_json = group_sessions::group_session_get_internal(conn, session_id)?;
    let session: GroupSession = serde_json::from_str(&session_json)
        .map_err(|e| format!("Failed to parse session: {}", e))?;

    let characters = load_characters_info(conn, &session.character_ids)?;

    let stats_json = group_sessions::group_participation_stats_internal(conn, session_id)?;
    let participation_stats: Vec<GroupParticipation> =
        serde_json::from_str(&stats_json).map_err(|e| e.to_string())?;

    // Load more messages for selection context (selection needs good context for fair decisions)
    let recent_messages = load_recent_group_messages(conn, session_id, 30)?;

    Ok(GroupChatContext {
        session,
        characters,
        participation_stats,
        recent_messages,
        user_message: user_message.to_string(),
    })
}

/// Update participation stats after a character speaks
fn update_participation(
    conn: &rusqlite::Connection,
    session_id: &str,
    character_id: &str,
    turn_number: i32,
) -> Result<(), String> {
    let now = now_ms();

    conn.execute(
        "UPDATE group_participation
         SET speak_count = speak_count + 1, last_spoke_turn = ?1, last_spoke_at = ?2
         WHERE session_id = ?3 AND character_id = ?4",
        rusqlite::params![turn_number, now, session_id, character_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Save a user message to the group chat
fn save_user_message(
    conn: &rusqlite::Connection,
    session_id: &str,
    content: &str,
) -> Result<GroupMessage, String> {
    let now = now_ms();
    let id = Uuid::new_v4().to_string();

    let max_turn: Option<i32> = conn
        .query_row(
            "SELECT MAX(turn_number) FROM group_messages WHERE session_id = ?1",
            rusqlite::params![session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let turn_number = max_turn.unwrap_or(0) + 1;

    conn.execute(
        "INSERT INTO group_messages (id, session_id, role, content, speaker_character_id, turn_number,
         created_at, is_pinned, attachments)
         VALUES (?1, ?2, 'user', ?3, NULL, ?4, ?5, 0, '[]')",
        rusqlite::params![id, session_id, content, turn_number, now],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE group_sessions SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, session_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(GroupMessage {
        id,
        session_id: session_id.to_string(),
        role: "user".to_string(),
        content: content.to_string(),
        speaker_character_id: None,
        turn_number,
        created_at: now as i64,
        usage: None,
        variants: None,
        selected_variant_id: None,
        is_pinned: false,
        attachments: vec![],
        reasoning: None,
        selection_reasoning: None,
    })
}

/// Save an assistant message to the group chat
fn save_assistant_message(
    conn: &rusqlite::Connection,
    session_id: &str,
    character_id: &str,
    content: &str,
    reasoning: Option<&str>,
    selection_reasoning: Option<&str>,
    usage: Option<&UsageSummary>,
) -> Result<GroupMessage, String> {
    let now = now_ms();
    let id = Uuid::new_v4().to_string();
    let variant_id = Uuid::new_v4().to_string();

    let max_turn: Option<i32> = conn
        .query_row(
            "SELECT MAX(turn_number) FROM group_messages WHERE session_id = ?1",
            rusqlite::params![session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let turn_number = max_turn.unwrap_or(0) + 1;

    let (prompt_tokens, completion_tokens, total_tokens) = match usage {
        Some(u) => (u.prompt_tokens, u.completion_tokens, u.total_tokens),
        None => (None, None, None),
    };

    conn.execute(
        "INSERT INTO group_messages (id, session_id, role, content, speaker_character_id, turn_number,
         created_at, prompt_tokens, completion_tokens, total_tokens, is_pinned, attachments, reasoning, selection_reasoning, selected_variant_id)
         VALUES (?1, ?2, 'assistant', ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, '[]', ?10, ?11, ?12)",
        rusqlite::params![
            id,
            session_id,
            content,
            character_id,
            turn_number,
            now,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            reasoning,
            selection_reasoning,
            variant_id
        ],
    )
    .map_err(|e| e.to_string())?;

    // Insert the first variant
    conn.execute(
        "INSERT INTO group_message_variants (id, message_id, content, speaker_character_id, created_at, reasoning, selection_reasoning)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            variant_id,
            id,
            content,
            character_id,
            now,
            reasoning,
            selection_reasoning
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE group_sessions SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, session_id],
    )
    .map_err(|e| e.to_string())?;

    update_participation(conn, session_id, character_id, turn_number)?;

    Ok(GroupMessage {
        id,
        session_id: session_id.to_string(),
        role: "assistant".to_string(),
        content: content.to_string(),
        speaker_character_id: Some(character_id.to_string()),
        turn_number,
        created_at: now as i64,
        usage: usage.cloned(),
        variants: None,
        selected_variant_id: Some(variant_id),
        is_pinned: false,
        attachments: vec![],
        reasoning: reasoning.map(|s| s.to_string()),
        selection_reasoning: selection_reasoning.map(|s| s.to_string()),
    })
}

/// Convert group messages to API message format for the character response
fn build_messages_for_api(
    group_messages: &[GroupMessage],
    characters: &[CharacterInfo],
    selected_character: &CharacterInfo,
    persona: Option<&Persona>,
    include_speaker_prefix: bool,
) -> Vec<serde_json::Value> {
    let mut messages = Vec::new();
    let _char_name = &selected_character.name;
    let persona_name = persona.map(|p| p.title.as_str()).unwrap_or("User");

    for msg in group_messages {
        if msg.role == "user" {
            let content = if include_speaker_prefix {
                format!("[{}]: {}", persona_name, msg.content)
            } else {
                msg.content.clone()
            };
            messages.push(json!({
                "role": "user",
                "content": content
            }));
        } else if msg.role == "assistant" {
            if let Some(ref speaker_id) = msg.speaker_character_id {
                let speaker_name = characters
                    .iter()
                    .find(|c| &c.id == speaker_id)
                    .map(|c| c.name.as_str())
                    .unwrap_or("Unknown");

                // If this message is from the selected character, it's their turn
                // Otherwise, format as observation from another character
                let content = if speaker_id == &selected_character.id {
                    msg.content.clone()
                } else if include_speaker_prefix {
                    format!("[{}]: {}", speaker_name, msg.content)
                } else {
                    msg.content.clone()
                };

                // Messages from the selected character are "assistant", others are "user" (as observations)
                let role = if speaker_id == &selected_character.id {
                    "assistant"
                } else {
                    "user"
                };

                messages.push(json!({
                    "role": role,
                    "content": content
                }));
            }
        }
    }

    messages
}

/// Build group chat system prompt for a specific character
fn build_group_system_prompt(
    app: &AppHandle,
    character: &Character,
    persona: Option<&Persona>,
    session: &GroupSession,
    other_characters: &[CharacterInfo],
    settings: &Settings,
    retrieved_memories: &[MemoryEmbedding],
) -> String {
    use crate::chat_manager::prompts::get_group_chat_prompt;

    let template = get_group_chat_prompt(app);

    // Character and persona descriptions are passed RAW to the LLM without any
    // translation or processing. The LLM receives the full description text as-is.
    let char_name = &character.name;
    let char_desc = character.description.as_deref().unwrap_or("");

    let persona_name = persona.map(|p| p.title.as_str()).unwrap_or("User");
    let persona_desc = persona
        .map(|p| p.description.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("");

    // Build group characters string with full descriptions
    let mut group_chars = String::new();
    for other in other_characters {
        if other.id != character.id {
            // Use full description if available, otherwise fall back to personality_summary
            if let Some(desc) = &other.description {
                if !desc.is_empty() {
                    group_chars.push_str(&format!("- {}: {}\n", other.name, desc));
                } else if let Some(summary) = &other.personality_summary {
                    group_chars.push_str(&format!("- {}: {}\n", other.name, summary));
                } else {
                    group_chars.push_str(&format!("- {}\n", other.name));
                }
            } else if let Some(summary) = &other.personality_summary {
                group_chars.push_str(&format!("- {}: {}\n", other.name, summary));
            } else {
                group_chars.push_str(&format!("- {}\n", other.name));
            }
        }
    }

    // Get context summary from session
    let context_summary_text = session.memory_summary.trim().to_string();

    // Format key memories like normal chat does - include both manual and retrieved dynamic memories
    let key_memories_text = if session.memories.is_empty() && retrieved_memories.is_empty() {
        String::new()
    } else {
        let mut mem_text = String::from("Important facts to remember in this conversation:\n");

        // Add retrieved dynamic memories first
        for memory in retrieved_memories {
            mem_text.push_str(&format!("- {}\n", memory.text));
        }

        // Add manual memories
        for memory in &session.memories {
            mem_text.push_str(&format!("- {}\n", memory));
        }
        mem_text
    };

    // Get content rules (same as normal chat)
    let pure_mode_enabled = settings
        .app_state
        .get("pureModeEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let content_rules = if pure_mode_enabled {
        "**Content Guidelines:**\n- Keep all interactions appropriate and respectful\n- Avoid sexual, adult, or explicit content".to_string()
    } else {
        String::new()
    };

    // Substitute placeholders (same pattern as normal chat)
    let mut result = template;
    result = result.replace("{{char.name}}", char_name);
    result = result.replace("{{char.desc}}", char_desc);
    result = result.replace("{{persona.name}}", persona_name);
    result = result.replace("{{persona.desc}}", persona_desc);
    result = result.replace("{{group_characters}}", &group_chars);
    result = result.replace("{{context_summary}}", &context_summary_text);
    result = result.replace("{{key_memories}}", &key_memories_text);
    result = result.replace("{{content_rules}}", &content_rules);

    // Legacy placeholder support
    result = result.replace("{{char}}", char_name);
    result = result.replace("{{persona}}", persona_name);

    // Clean up multiple blank lines
    while result.contains("\n\n\n") {
        result = result.replace("\n\n\n", "\n\n");
    }

    result.trim().to_string()
}

/// Load persona from database
fn load_persona(app: &AppHandle, persona_id: &str) -> Result<Option<Persona>, String> {
    let personas = load_personas(app)?;
    Ok(personas.into_iter().find(|p| p.id == persona_id))
}

/// Use LLM with tool calling to select next speaker
async fn select_speaker_via_llm(
    app: &AppHandle,
    context: &GroupChatContext,
    settings: &Settings,
) -> Result<selection::SelectionResult, String> {
    select_speaker_via_llm_with_tracking(app, context, settings, true).await
}

/// Use LLM with tool calling to select next speaker, with optional usage tracking
async fn select_speaker_via_llm_with_tracking(
    app: &AppHandle,
    context: &GroupChatContext,
    settings: &Settings,
    track_usage: bool,
) -> Result<selection::SelectionResult, String> {
    // Get the first available model for selection
    let model = settings
        .models
        .first()
        .ok_or("No models configured for speaker selection")?;

    let cred = settings
        .provider_credentials
        .iter()
        .find(|c| c.provider_id == model.provider_id)
        .ok_or_else(|| format!("No credentials for provider {}", model.provider_id))?;

    let api_key = resolve_api_key(app, cred, "group_chat_selection")?;

    // Build selection prompt
    let selection_prompt = selection::build_selection_prompt(context);

    // Build tool definition
    let tool = selection::build_select_next_speaker_tool(&context.characters);

    let messages = vec![json!({
        "role": "user",
        "content": selection_prompt
    })];

    // Build tool definition
    let tool_def = ToolDefinition {
        name: "select_next_speaker".to_string(),
        description: Some("Select which character should speak next in the group chat".to_string()),
        parameters: tool
            .get("function")
            .and_then(|f| f.get("parameters"))
            .cloned()
            .unwrap_or(json!({})),
    };

    // Build request with tool calling
    let tool_config = ToolConfig {
        tools: vec![tool_def],
        choice: Some(ToolChoice::Required),
    };

    let built = request_builder::build_chat_request(
        cred,
        &api_key,
        &model.name,
        &messages,
        None,  // system_prompt
        0.3,   // Low temperature for consistent selection
        1.0,   // top_p
        500,   // max_tokens - short response
        false, // No streaming for selection
        None,  // request_id
        None,  // frequency_penalty
        None,  // presence_penalty
        None,  // top_k
        Some(&tool_config),
        false, // reasoning_enabled
        None,  // reasoning_effort
        None,  // reasoning_budget
    );

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(30_000),
        stream: Some(false),
        request_id: None,
        provider_id: Some(cred.provider_id.clone()),
    };

    let api_response = api_request(app.clone(), api_request_payload).await?;

    if !api_response.ok {
        return Err(format!(
            "Selection API request failed with status {}",
            api_response.status
        ));
    }

    // Record usage for decision maker
    if track_usage {
        let usage = extract_usage(api_response.data());
        record_decision_maker_usage(
            app,
            &usage,
            &context.session,
            model,
            cred,
            &api_key,
            "group_chat_decision_maker",
        )
        .await;
    }

    // Parse tool call response
    let calls = parse_tool_calls(&cred.provider_id, api_response.data());

    for call in calls {
        if call.name == "select_next_speaker" {
            let character_id = call
                .arguments
                .get("character_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let reasoning = call
                .arguments
                .get("reasoning")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if let Some(id) = character_id {
                return Ok(selection::SelectionResult {
                    character_id: id,
                    reasoning,
                });
            }
        }
    }

    // Fallback: try parsing from text response
    if let Some(text) = extract_text(api_response.data()) {
        if let Some(result) = selection::parse_tool_call_response(&text) {
            return Ok(result);
        }
    }

    // Final fallback: heuristic selection
    log_info(
        app,
        "group_chat",
        "LLM selection failed, using heuristic fallback".to_string(),
    );
    selection::heuristic_select_speaker(context)
}

/// Generate actual response from the selected character
async fn generate_character_response(
    app: &AppHandle,
    context: &mut GroupChatContext,
    selected_character_id: &str,
    settings: &Settings,
    pool: &State<'_, SwappablePool>,
    request_id: &str,
    operation_type: UsageOperationType,
) -> Result<(String, Option<String>, Option<UsageSummary>), String> {
    let conn = pool.get_connection()?;

    // Load full character data
    let character = load_character(&conn, selected_character_id)?;

    // Load persona if set
    let persona = if let Some(ref persona_id) = context.session.persona_id {
        load_persona(app, persona_id)?
    } else {
        None
    };

    // Get model and credentials
    let (model, cred) = select_model(settings, &character)?;
    let api_key = resolve_api_key(app, cred, "group_chat")?;

    // Retrieve relevant memories for context using dynamic memory settings
    let min_similarity = dynamic_min_similarity(settings);
    let search_query = if context_enrichment_enabled(settings) {
        build_enriched_query(&context.recent_messages)
    } else {
        context.user_message.clone()
    };

    let retrieved_memories = select_relevant_memories(
        app,
        &context.session,
        &search_query,
        5, // limit
        min_similarity,
    )
    .await;

    // Mark retrieved memories as accessed and promote cold ones
    if !retrieved_memories.is_empty() {
        let memory_ids: Vec<String> = retrieved_memories.iter().map(|m| m.id.clone()).collect();
        promote_cold_memories(app, &mut context.session, &memory_ids);
        mark_memories_accessed(&mut context.session, &memory_ids);
        log_info(
            app,
            "group_chat",
            format!(
                "Retrieved and marked {} memories as accessed (query enrichment: {})",
                retrieved_memories.len(),
                context_enrichment_enabled(settings)
            ),
        );
    }

    // Build system prompt with group context and retrieved memories
    let system_prompt = build_group_system_prompt(
        app,
        &character,
        persona.as_ref(),
        &context.session,
        &context.characters,
        settings,
        &retrieved_memories,
    );

    // Convert group messages to API format
    let selected_char_info = context
        .characters
        .iter()
        .find(|c| c.id == selected_character_id)
        .ok_or("Selected character not found")?;

    // Apply conversation window limit for dynamic memory (like normal chat)
    // This ensures we only send the last N messages to the LLM based on dynamic_window_size
    let messages_for_generation = if is_dynamic_memory_enabled(settings) {
        let window_size = dynamic_window_size(settings);
        conversation_window(&context.recent_messages, window_size)
    } else {
        context.recent_messages.clone()
    };

    let api_messages = build_messages_for_api(
        &messages_for_generation,
        &context.characters,
        selected_char_info,
        persona.as_ref(),
        true,
    );

    let mut messages = vec![json!({
        "role": "system",
        "content": system_prompt
    })];
    messages.extend(api_messages);

    let persona_name = persona.as_ref().map(|p| p.title.as_str()).unwrap_or("User");
    messages.push(json!({
        "role": "user",
        "content": format!("[{}]: {}", persona_name, context.user_message)
    }));

    let temperature = model
        .advanced_model_settings
        .as_ref()
        .and_then(|a| a.temperature)
        .unwrap_or(0.7);
    let top_p = model
        .advanced_model_settings
        .as_ref()
        .and_then(|a| a.top_p)
        .unwrap_or(1.0);
    let max_tokens = model
        .advanced_model_settings
        .as_ref()
        .and_then(|a| a.max_output_tokens)
        .unwrap_or(2048);
    let reasoning_enabled = model
        .advanced_model_settings
        .as_ref()
        .and_then(|a| a.reasoning_enabled)
        .unwrap_or(false);
    let reasoning_effort = model
        .advanced_model_settings
        .as_ref()
        .and_then(|a| a.reasoning_effort.clone());
    let reasoning_budget = model
        .advanced_model_settings
        .as_ref()
        .and_then(|a| a.reasoning_budget_tokens);
    let presence_penalty = model
        .advanced_model_settings
        .as_ref()
        .and_then(|a| a.presence_penalty);
    let frequency_penalty = model
        .advanced_model_settings
        .as_ref()
        .and_then(|a| a.frequency_penalty);
    let top_k = model.advanced_model_settings.as_ref().and_then(|a| a.top_k);

    let built = request_builder::build_chat_request(
        cred,
        &api_key,
        &model.name,
        &messages,
        None, // system prompt already in messages
        temperature,
        top_p,
        max_tokens,
        true,              // Stream
        None,              // request_id will be passed via ApiRequest
        frequency_penalty, // frequency_penalty
        presence_penalty,  // presence_penalty
        top_k,             // top_k
        None,              // No tools for response generation
        reasoning_enabled, // reasoning_enabled
        reasoning_effort,  // reasoning_effort
        reasoning_budget,  // reasoning_budget
    );

    log_info(
        app,
        "group_chat",
        format!(
            "Generating response from {} via {} model {}",
            character.name, cred.provider_id, model.name
        ),
    );

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(300_000),
        stream: Some(true),
        request_id: Some(request_id.to_string()),
        provider_id: Some(cred.provider_id.clone()),
    };

    log_info(
        app,
        "group_chat_response",
        format!(
            "Sending streaming request for {} with request_id={}",
            character.name, request_id
        ),
    );

    let api_response = api_request(app.clone(), api_request_payload).await?;

    log_info(
        app,
        "group_chat_response",
        format!(
            "API response received: status={} ok={}",
            api_response.status, api_response.ok
        ),
    );

    if !api_response.ok {
        return Err(format!(
            "Character response API request failed with status {}",
            api_response.status
        ));
    }

    let data_preview = match api_response.data() {
        serde_json::Value::String(s) => {
            let preview = if s.len() > 500 { &s[..500] } else { s.as_str() };
            format!("String({} bytes): {}...", s.len(), preview)
        }
        serde_json::Value::Object(obj) => {
            format!("Object with keys: {:?}", obj.keys().collect::<Vec<_>>())
        }
        other => format!("{:?}", other),
    };
    log_info(
        app,
        "group_chat_response",
        format!("Response data type: {}", data_preview),
    );

    let text = extract_text(api_response.data());

    log_info(
        app,
        "group_chat_response",
        format!(
            "Extracted text: {:?} (len={})",
            text.as_ref().map(|t| if t.len() > 100 {
                format!("{}...", &t[..100])
            } else {
                t.clone()
            }),
            text.as_ref().map(|t| t.len()).unwrap_or(0)
        ),
    );

    let text = text.ok_or_else(|| "Empty response from provider".to_string())?;

    let usage = extract_usage(api_response.data());

    let reasoning = api_response
        .data()
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("reasoning"))
        .and_then(|r| r.as_str())
        .map(|s| s.to_string());

    let message_usage = usage.as_ref().map(|u| UsageSummary {
        prompt_tokens: u.prompt_tokens.map(|v| v as i32),
        completion_tokens: u.completion_tokens.map(|v| v as i32),
        total_tokens: u.total_tokens.map(|v| v as i32),
    });

    record_group_usage(
        app,
        &usage,
        &context.session,
        &character,
        model,
        cred,
        &api_key,
        operation_type,
        "group_chat_response",
    )
    .await;

    Ok((text, reasoning, message_usage))
}

#[tauri::command]
pub async fn group_chat_send(
    app: AppHandle,
    session_id: String,
    user_message: String,
    _stream: Option<bool>,
    request_id: Option<String>,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    log_info(
        &app,
        "group_chat_send",
        format!("Starting group chat send for session {}", session_id),
    );

    let settings = load_settings(&app)?;
    let conn = pool.get_connection()?;

    let mut context = build_selection_context(&conn, &session_id, &user_message)?;
    let user_msg = save_user_message(&conn, &session_id, &user_message)?;
    let mention_result = parse_mentions(&user_message, &context.characters);

    let _ = app.emit(
        "group_chat_status",
        json!({
            "sessionId": session_id,
            "status": "selecting_character",
        }),
    );

    let (selected_character_id, selection_reasoning, was_mentioned) =
        if let Some(mentioned_id) = mention_result {
            log_info(
                &app,
                "group_chat_send",
                format!("User mentioned character {}", mentioned_id),
            );
            (
                mentioned_id,
                Some("User mentioned this character directly".to_string()),
                true,
            )
        } else {
            match select_speaker_via_llm(&app, &context, &settings).await {
                Ok(selection) => {
                    log_info(
                        &app,
                        "group_chat_send",
                        format!(
                            "LLM selected character {}: {:?}",
                            selection.character_id, selection.reasoning
                        ),
                    );
                    (selection.character_id, selection.reasoning, false)
                }
                Err(err) => {
                    log_error(
                        &app,
                        "group_chat_send",
                        format!("LLM selection failed: {}, using heuristic", err),
                    );
                    let fallback = selection::heuristic_select_speaker(&context)?;
                    (fallback.character_id, fallback.reasoning, false)
                }
            }
        };

    if !context
        .session
        .character_ids
        .contains(&selected_character_id)
    {
        return Err(format!(
            "Selected character {} is not in this group chat",
            selected_character_id
        ));
    }

    let character = context
        .characters
        .iter()
        .find(|c| c.id == selected_character_id)
        .ok_or_else(|| "Character not found".to_string())?
        .clone();

    let _ = app.emit(
        "group_chat_status",
        json!({
            "sessionId": session_id,
            "status": "character_selected",
            "characterId": selected_character_id,
            "characterName": character.name,
        }),
    );

    context.recent_messages.push(user_msg);

    let req_id = request_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    let (response_content, reasoning, message_usage) = generate_character_response(
        &app,
        &mut context,
        &selected_character_id,
        &settings,
        &pool,
        &req_id,
        UsageOperationType::GroupChatMessage,
    )
    .await?;

    let conn = pool.get_connection()?;
    let message = save_assistant_message(
        &conn,
        &session_id,
        &selected_character_id,
        &response_content,
        reasoning.as_deref(),
        selection_reasoning.as_deref(),
        message_usage.as_ref(),
    )?;

    let stats_json = group_sessions::group_participation_stats_internal(&conn, &session_id)?;
    let participation_stats: Vec<GroupParticipation> =
        serde_json::from_str(&stats_json).map_err(|e| e.to_string())?;

    let response = GroupChatResponse {
        message,
        character_id: selected_character_id,
        character_name: character.name.clone(),
        reasoning,
        selection_reasoning,
        was_mentioned,
        participation_stats,
    };

    let _ = app.emit(
        "group_chat_status",
        json!({
            "sessionId": session_id,
            "status": "complete",
            "characterId": &response.character_id,
        }),
    );

    log_info(
        &app,
        "group_chat_send",
        format!(
            "Group chat response complete: {} responded with {} chars",
            character.name,
            response_content.len()
        ),
    );

    if is_dynamic_memory_enabled(&settings) {
        let conn = pool.get_connection()?;
        let session_json = group_sessions::group_session_get_internal(&conn, &session_id)?;
        let mut updated_session: GroupSession =
            serde_json::from_str(&session_json).map_err(|e| e.to_string())?;

        if let Err(e) =
            process_group_dynamic_memory_cycle(&app, &mut updated_session, &settings, &pool).await
        {
            log_warn(
                &app,
                "group_chat_send",
                format!("Dynamic memory cycle failed: {}", e),
            );
        }
    }

    serde_json::to_string(&response).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn group_chat_retry_dynamic_memory(
    app: AppHandle,
    session_id: String,
    pool: State<'_, SwappablePool>,
) -> Result<(), String> {
    log_info(
        &app,
        "group_chat_retry_dynamic_memory",
        format!(
            "Manually triggering memory cycle for session {}",
            session_id
        ),
    );

    let settings = load_settings(&app)?;
    let conn = pool.get_connection()?;
    let session_json = group_sessions::group_session_get_internal(&conn, &session_id)?;
    let mut session: GroupSession =
        serde_json::from_str(&session_json).map_err(|e| e.to_string())?;

    process_group_dynamic_memory_cycle(&app, &mut session, &settings, &pool).await
}

#[tauri::command]
pub async fn group_chat_regenerate(
    app: AppHandle,
    session_id: String,
    message_id: String,
    force_character_id: Option<String>,
    request_id: Option<String>,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    log_info(
        &app,
        "group_chat_regenerate",
        format!(
            "Regenerating message {} in session {}",
            message_id, session_id
        ),
    );

    let _ = app.emit(
        "group_chat_status",
        json!({
            "sessionId": session_id,
            "status": "selecting_character",
        }),
    );

    let settings = load_settings(&app)?;
    let conn = pool.get_connection()?;

    let (turn_number, original_speaker): (i32, Option<String>) = conn
        .query_row(
            "SELECT turn_number, speaker_character_id FROM group_messages WHERE id = ?1",
            rusqlite::params![message_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let user_message: String = conn
        .query_row(
            "SELECT content FROM group_messages WHERE session_id = ?1 AND turn_number < ?2 AND role = 'user' ORDER BY turn_number DESC LIMIT 1",
            rusqlite::params![session_id, turn_number],
            |row| row.get(0),
        )
        .unwrap_or_default();

    let mut context = build_selection_context(&conn, &session_id, &user_message)?;
    context
        .recent_messages
        .retain(|m| m.turn_number < turn_number);

    let (selected_character_id, selection_reasoning) = if let Some(forced_id) = force_character_id {
        (
            forced_id,
            Some("User forced character selection".to_string()),
        )
    } else {
        match select_speaker_via_llm(&app, &context, &settings).await {
            Ok(selection) => (selection.character_id, selection.reasoning),
            Err(err) => {
                log_error(
                    &app,
                    "group_chat_regenerate",
                    format!("LLM selection failed: {}", err),
                );
                let fallback = selection::heuristic_select_speaker(&context)?;
                (fallback.character_id, fallback.reasoning)
            }
        }
    };

    let character = context
        .characters
        .iter()
        .find(|c| c.id == selected_character_id)
        .ok_or_else(|| "Character not found".to_string())?
        .clone();

    let _ = app.emit(
        "group_chat_status",
        json!({
            "sessionId": session_id,
            "status": "character_selected",
            "characterId": selected_character_id,
            "characterName": character.name,
        }),
    );

    let req_id = request_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    let (response_content, reasoning, message_usage) = generate_character_response(
        &app,
        &mut context,
        &selected_character_id,
        &settings,
        &pool,
        &req_id,
        UsageOperationType::GroupChatRegenerate,
    )
    .await?;

    let conn = pool.get_connection()?;
    let now = now_ms();
    let variant_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO group_message_variants (id, message_id, content, speaker_character_id, created_at, reasoning, selection_reasoning, prompt_tokens, completion_tokens, total_tokens)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            variant_id,
            message_id,
            response_content,
            selected_character_id,
            now,
            reasoning,
            selection_reasoning,
            message_usage.as_ref().and_then(|u| u.prompt_tokens),
            message_usage.as_ref().and_then(|u| u.completion_tokens),
            message_usage.as_ref().and_then(|u| u.total_tokens),
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE group_messages SET content = ?1, speaker_character_id = ?2, selected_variant_id = ?3, reasoning = ?4, selection_reasoning = ?5 WHERE id = ?6",
        rusqlite::params![
            response_content,
            selected_character_id,
            variant_id,
            reasoning,
            selection_reasoning,
            message_id
        ],
    )
    .map_err(|e| e.to_string())?;

    if original_speaker.as_ref() != Some(&selected_character_id) {
        update_participation(&conn, &session_id, &selected_character_id, turn_number)?;
    }

    let stats_json = group_sessions::group_participation_stats_internal(&conn, &session_id)?;
    let participation_stats: Vec<GroupParticipation> =
        serde_json::from_str(&stats_json).map_err(|e| e.to_string())?;

    let messages_json =
        group_sessions::group_messages_list_internal(&conn, &session_id, 100, None, None)?;
    let messages: Vec<GroupMessage> =
        serde_json::from_str(&messages_json).map_err(|e| e.to_string())?;
    let message = messages
        .into_iter()
        .find(|m| m.id == message_id)
        .ok_or_else(|| "Message not found after update".to_string())?;

    let response = GroupChatResponse {
        message,
        character_id: selected_character_id.clone(),
        character_name: character.name.clone(),
        reasoning,
        selection_reasoning,
        was_mentioned: false,
        participation_stats,
    };

    let _ = app.emit(
        "group_chat_status",
        json!({
            "sessionId": session_id,
            "status": "complete",
            "characterId": &selected_character_id,
        }),
    );

    serde_json::to_string(&response).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn group_chat_continue(
    app: AppHandle,
    session_id: String,
    force_character_id: Option<String>,
    request_id: Option<String>,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    log_info(
        &app,
        "group_chat_continue",
        format!("Continuing group chat session {}", session_id),
    );

    let _ = app.emit(
        "group_chat_status",
        json!({
            "sessionId": session_id,
            "status": "selecting_character",
        }),
    );

    let settings = load_settings(&app)?;
    let conn = pool.get_connection()?;

    let mut context = build_selection_context(&conn, &session_id, "")?;

    let (selected_character_id, selection_reasoning) = if let Some(forced_id) = force_character_id {
        (
            forced_id,
            Some("User requested specific character".to_string()),
        )
    } else {
        match select_speaker_via_llm(&app, &context, &settings).await {
            Ok(selection) => (selection.character_id, selection.reasoning),
            Err(err) => {
                log_error(
                    &app,
                    "group_chat_continue",
                    format!("LLM selection failed: {}", err),
                );
                let fallback = selection::heuristic_select_speaker(&context)?;
                (fallback.character_id, fallback.reasoning)
            }
        }
    };

    let character = context
        .characters
        .iter()
        .find(|c| c.id == selected_character_id)
        .ok_or_else(|| "Character not found".to_string())?
        .clone();

    let _ = app.emit(
        "group_chat_status",
        json!({
            "sessionId": session_id,
            "status": "character_selected",
            "characterId": selected_character_id,
            "characterName": character.name,
        }),
    );

    let req_id = request_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    let (response_content, reasoning, message_usage) = generate_character_response(
        &app,
        &mut context,
        &selected_character_id,
        &settings,
        &pool,
        &req_id,
        UsageOperationType::GroupChatContinue,
    )
    .await?;

    let conn = pool.get_connection()?;
    let message = save_assistant_message(
        &conn,
        &session_id,
        &selected_character_id,
        &response_content,
        reasoning.as_deref(),
        selection_reasoning.as_deref(),
        message_usage.as_ref(),
    )?;

    let stats_json = group_sessions::group_participation_stats_internal(&conn, &session_id)?;
    let participation_stats: Vec<GroupParticipation> =
        serde_json::from_str(&stats_json).map_err(|e| e.to_string())?;

    let response = GroupChatResponse {
        message,
        character_id: selected_character_id.clone(),
        character_name: character.name.clone(),
        reasoning,
        selection_reasoning,
        was_mentioned: false,
        participation_stats,
    };

    let _ = app.emit(
        "group_chat_status",
        json!({
            "sessionId": session_id,
            "status": "complete",
            "characterId": &selected_character_id,
        }),
    );

    serde_json::to_string(&response).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn group_chat_get_selection_prompt(
    session_id: String,
    user_message: String,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let context = build_selection_context(&conn, &session_id, &user_message)?;
    Ok(selection::build_selection_prompt(&context))
}
