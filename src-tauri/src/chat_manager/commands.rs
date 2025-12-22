use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::api::{api_request, ApiRequest};
use crate::chat_manager::storage::{get_base_prompt, PromptType};
use crate::embedding_model;
use crate::utils::{log_error, log_info, log_warn, now_millis};

use super::prompt_engine;
use super::prompts;
use super::prompts::{APP_DYNAMIC_MEMORY_TEMPLATE_ID, APP_DYNAMIC_SUMMARY_TEMPLATE_ID};
use super::request::{
    ensure_assistant_variant, extract_error_message, extract_reasoning, extract_text,
    extract_usage, new_assistant_variant,
};
use super::service::{
    record_failed_usage, record_usage_if_available, resolve_api_key, ChatContext,
};
use super::storage::{default_character_rules, recent_messages, save_session};
use super::tooling::{parse_tool_calls, ToolCall, ToolChoice, ToolConfig, ToolDefinition};
use super::types::{
    ChatAddMessageAttachmentArgs, ChatCompletionArgs, ChatContinueArgs, ChatRegenerateArgs,
    ChatTurnResult, ContinueResult, MemoryEmbedding, Model, PromptScope, ProviderCredential,
    RegenerateResult, Session, Settings, StoredMessage, SystemPromptTemplate,
};
use crate::storage_manager::sessions::{messages_upsert_batch, session_upsert_meta};
use crate::utils::emit_debug;

const FALLBACK_TEMPERATURE: f64 = 0.7;
const FALLBACK_TOP_P: f64 = 1.0;
const FALLBACK_MAX_OUTPUT_TOKENS: u32 = 4096;
const FALLBACK_DYNAMIC_WINDOW: u32 = 20;
const FALLBACK_DYNAMIC_MAX_ENTRIES: u32 = 50;
const MEMORY_ID_SPACE: u64 = 1_000_000;

/// Determines if dynamic memory is currently active for this character.
/// Returns true ONLY if BOTH conditions are met:
/// 1. Global dynamic memory setting is enabled in advanced settings
/// 2. Character's memory_type is set to "dynamic"
///
/// If either condition is false, the system falls back to manual memory mode
/// (using session.memories) without modifying the character's memory_type setting.
fn is_dynamic_memory_active(
    settings: &Settings,
    session_character: &super::types::Character,
) -> bool {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.enabled)
        .unwrap_or(false)
        && session_character
            .memory_type
            .eq_ignore_ascii_case("dynamic")
}

#[allow(dead_code)]
fn has_image_generation_model(settings: &Settings) -> bool {
    settings.models.iter().any(|m| {
        m.output_scopes
            .iter()
            .any(|s| s.eq_ignore_ascii_case("image"))
    })
}

fn append_image_directive_instructions(
    system_prompt: Option<String>,
    _settings: &Settings,
) -> Option<String> {
    return system_prompt;
}

fn dynamic_window_size(settings: &Settings) -> usize {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.summary_message_interval.max(1))
        .unwrap_or(FALLBACK_DYNAMIC_WINDOW) as usize
}

fn manual_window_size(settings: &Settings) -> usize {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.manual_mode_context_window)
        .unwrap_or(50) as usize
}

fn dynamic_max_entries(settings: &Settings) -> usize {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.max_entries.max(1))
        .unwrap_or(FALLBACK_DYNAMIC_MAX_ENTRIES) as usize
}

const FALLBACK_MIN_SIMILARITY: f32 = 0.35;

fn dynamic_min_similarity(settings: &Settings) -> f32 {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.min_similarity_threshold)
        .unwrap_or(FALLBACK_MIN_SIMILARITY)
}

const FALLBACK_HOT_MEMORY_TOKEN_BUDGET: u32 = 2000;

fn dynamic_hot_memory_token_budget(settings: &Settings) -> u32 {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.hot_memory_token_budget)
        .unwrap_or(FALLBACK_HOT_MEMORY_TOKEN_BUDGET)
}

/// Calculate total tokens used by hot (non-cold) memories
fn calculate_hot_memory_tokens(session: &Session) -> u32 {
    session
        .memory_embeddings
        .iter()
        .filter(|m| !m.is_cold)
        .map(|m| m.token_count)
        .sum()
}

/// Enforce the hot memory token budget by demoting oldest memories to cold storage.
/// Returns the number of memories demoted.
fn enforce_hot_memory_budget(app: &AppHandle, session: &mut Session, budget: u32) -> usize {
    let mut current_tokens = calculate_hot_memory_tokens(session);

    if current_tokens <= budget {
        return 0;
    }

    // Sort hot memories by last_accessed_at (oldest first) for demotion
    let mut hot_indices: Vec<(usize, u64)> = session
        .memory_embeddings
        .iter()
        .enumerate()
        .filter(|(_, m)| !m.is_cold)
        .map(|(i, m)| (i, m.last_accessed_at))
        .collect();

    // Sort by last_accessed_at ascending (oldest first)
    hot_indices.sort_by_key(|(_, accessed)| *accessed);

    let mut demoted_count = 0;

    for (idx, _) in hot_indices {
        if current_tokens <= budget {
            break;
        }

        let memory = &mut session.memory_embeddings[idx];
        let tokens_freed = memory.token_count;
        memory.is_cold = true;
        current_tokens = current_tokens.saturating_sub(tokens_freed);
        demoted_count += 1;

        log_info(
            app,
            "dynamic_memory",
            format!(
                "Demoted memory {} to cold storage (freed {} tokens)",
                memory.id, tokens_freed
            ),
        );
    }

    demoted_count
}

const FALLBACK_DECAY_RATE: f32 = 0.08;
const FALLBACK_COLD_THRESHOLD: f32 = 0.3;

fn dynamic_decay_rate(settings: &Settings) -> f32 {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.decay_rate)
        .unwrap_or(FALLBACK_DECAY_RATE)
}

fn dynamic_cold_threshold(settings: &Settings) -> f32 {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.cold_threshold)
        .unwrap_or(FALLBACK_COLD_THRESHOLD)
}

fn context_enrichment_enabled(settings: &Settings) -> bool {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.context_enrichment_enabled)
        .unwrap_or(true) // Default to enabled (v2 users get this by default)
}

/// Apply importance decay to all hot, unpinned memories.
/// Memories that fall below cold_threshold are demoted to cold storage.
/// Returns (decayed_count, demoted_count)
fn apply_memory_decay(
    app: &AppHandle,
    session: &mut Session,
    decay_rate: f32,
    cold_threshold: f32,
) -> (usize, usize) {
    let mut decayed = 0;
    let mut demoted = 0;

    for mem in session.memory_embeddings.iter_mut() {
        // Skip cold or pinned memories
        if mem.is_cold || mem.is_pinned {
            continue;
        }

        // Apply decay
        mem.importance_score = (mem.importance_score - decay_rate).max(0.0);
        decayed += 1;

        // Check if should demote
        if mem.importance_score < cold_threshold {
            mem.is_cold = true;
            demoted += 1;
            log_info(
                app,
                "dynamic_memory",
                format!(
                    "Memory {} demoted to cold (score: {:.2} < threshold: {:.2})",
                    mem.id, mem.importance_score, cold_threshold
                ),
            );
        }
    }

    (decayed, demoted)
}

fn conversation_window(messages: &[StoredMessage], limit: usize) -> Vec<StoredMessage> {
    let mut convo: Vec<StoredMessage> = messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .cloned()
        .collect();
    if convo.len() > limit {
        convo.drain(0..(convo.len() - limit));
    }
    convo
}

/// Extract pinned and unpinned conversation messages separately.
/// Pinned messages are always included but don't count against the window limit.
/// Returns (pinned_messages, recent_unpinned_messages_within_limit)
fn conversation_window_with_pinned(
    messages: &[StoredMessage],
    limit: usize,
) -> (Vec<StoredMessage>, Vec<StoredMessage>) {
    let convo: Vec<StoredMessage> = messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .cloned()
        .collect();

    let mut pinned = Vec::new();
    let mut unpinned = Vec::new();

    for msg in convo {
        if msg.is_pinned {
            pinned.push(msg);
        } else {
            unpinned.push(msg);
        }
    }

    // Apply sliding window to unpinned messages only
    if unpinned.len() > limit {
        unpinned.drain(0..(unpinned.len() - limit));
    }

    (pinned, unpinned)
}

fn conversation_count(messages: &[StoredMessage]) -> usize {
    messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .count()
}

fn generate_memory_id() -> String {
    let now = now_millis().unwrap_or(0);
    format!("{:06}", now % MEMORY_ID_SPACE)
}

/// Build an enriched query from the last 2 messages for better memory retrieval.
/// Cases:
/// - [assistant, user] -> assistant.content + user.content (normal chat)
/// - [assistant, assistant] -> prev.content + last.content (chat continue)
/// - [user, user] -> prev.content + last.content (cancelled retry)
/// Falls back to just the latest message if only 1 exists.
fn build_enriched_query(messages: &[StoredMessage]) -> String {
    let convo: Vec<&StoredMessage> = messages
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

fn format_memories_with_ids(session: &Session) -> Vec<String> {
    session
        .memories
        .iter()
        .enumerate()
        .map(|(idx, text)| {
            let id = session
                .memory_embeddings
                .get(idx)
                .map(|m| m.id.clone())
                .unwrap_or_else(|| format!("{:06}", (idx as u64) % MEMORY_ID_SPACE));
            format!("[{}] {}", id, text)
        })
        .collect()
}

fn resolve_temperature(session: &Session, model: &Model, settings: &Settings) -> f64 {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.temperature)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.temperature)
        })
        .or(settings.advanced_model_settings.temperature)
        .unwrap_or(FALLBACK_TEMPERATURE)
}

fn resolve_top_p(session: &Session, model: &Model, settings: &Settings) -> f64 {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.top_p)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.top_p)
        })
        .or(settings.advanced_model_settings.top_p)
        .unwrap_or(FALLBACK_TOP_P)
}

fn resolve_max_tokens(session: &Session, model: &Model, settings: &Settings) -> u32 {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.max_output_tokens)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.max_output_tokens)
        })
        .or(settings.advanced_model_settings.max_output_tokens)
        .unwrap_or(FALLBACK_MAX_OUTPUT_TOKENS)
}

fn resolve_frequency_penalty(
    session: &Session,
    model: &Model,
    _settings: &Settings,
) -> Option<f64> {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.frequency_penalty)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.frequency_penalty)
        })
}

fn resolve_presence_penalty(session: &Session, model: &Model, _settings: &Settings) -> Option<f64> {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.presence_penalty)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.presence_penalty)
        })
}

fn resolve_top_k(session: &Session, model: &Model, _settings: &Settings) -> Option<u32> {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.top_k)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.top_k)
        })
}

fn resolve_reasoning_enabled(session: &Session, model: &Model, _settings: &Settings) -> bool {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.reasoning_enabled)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.reasoning_enabled)
        })
        .unwrap_or(false)
}

fn resolve_reasoning_effort(
    session: &Session,
    model: &Model,
    _settings: &Settings,
) -> Option<String> {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.reasoning_effort.clone())
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.reasoning_effort.clone())
        })
}

fn resolve_reasoning_budget(
    session: &Session,
    model: &Model,
    _settings: &Settings,
    reasoning_effort: Option<&str>,
) -> Option<u32> {
    // First check for explicit budget
    let explicit_budget = session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.reasoning_budget_tokens)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.reasoning_budget_tokens)
        });

    if explicit_budget.is_some() {
        return explicit_budget;
    }

    // Default budget based on effort level
    reasoning_effort.map(|effort| match effort {
        "low" => 2048,
        "medium" => 8192,
        "high" => 16384,
        _ => 4096, // default fallback
    })
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.is_empty() || b.is_empty() || a.len() != b.len() {
        return 0.0;
    }
    let mut dot = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += (*x as f64 * *y as f64) as f32;
        norm_a += (*x as f64 * *x as f64) as f32;
        norm_b += (*y as f64 * *y as f64) as f32;
    }
    let denom = (norm_a.sqrt() * norm_b.sqrt()).max(1e-6);
    dot / denom
}

async fn select_relevant_memories(
    app: &AppHandle,
    session: &Session,
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
                    "memory_retrieval",
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
        .map(|(score, m)| {
            let mut cloned = m.clone();
            cloned.match_score = Some(score);
            cloned
        })
        .collect();

    // If hot results are empty or sparse, search cold memories by keyword
    if hot_results.is_empty() {
        let matches = search_memories_by_keyword(session, query, limit);
        if !matches.is_empty() {
            crate::utils::log_info(
                app,
                "memory_retrieval",
                format!("Found {} memories via keyword search", matches.len()),
            );
        }
        return matches;
    }

    hot_results
}

/// Search memories using simple keyword matching (fallback).
fn search_memories_by_keyword(
    session: &Session,
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

    // Sort by match count descending
    matches.sort_by(|a, b| b.0.cmp(&a.0));
    matches.into_iter().take(limit).map(|(_, m)| m).collect()
}

/// Promote cold memories to hot (called when they match a keyword search)
fn promote_cold_memories(app: &AppHandle, session: &mut Session, memory_ids: &[String]) {
    let now = now_millis().unwrap_or_default();
    for mem in session.memory_embeddings.iter_mut() {
        if memory_ids.contains(&mem.id) && mem.is_cold {
            mem.is_cold = false;
            mem.importance_score = 0.7; // Moderate score for promoted memories
            mem.last_accessed_at = now;
            mem.access_count += 1;
            log_info(
                app,
                "dynamic_memory",
                format!("Promoted cold memory {} to hot", mem.id),
            );
        }
    }
}

/// Update last_accessed_at, boost importance_score, and increment access_count for retrieved memories
fn mark_memories_accessed(session: &mut Session, memory_ids: &[String]) {
    let now = now_millis().unwrap_or_default();
    for mem in session.memory_embeddings.iter_mut() {
        if memory_ids.contains(&mem.id) {
            mem.last_accessed_at = now;
            mem.access_count += 1;
            // Boost importance score back to 1.0 when accessed
            mem.importance_score = 1.0;
        }
    }
}

use super::types::ImageAttachment;
use crate::storage_manager::media::storage_save_session_attachment;

fn persist_attachments(
    app: &AppHandle,
    character_id: &str,
    session_id: &str,
    message_id: &str,
    role: &str,
    attachments: Vec<ImageAttachment>,
) -> Result<Vec<ImageAttachment>, String> {
    let mut persisted = Vec::new();

    for attachment in attachments {
        if attachment.storage_path.is_some() && attachment.data.is_empty() {
            persisted.push(attachment);
            continue;
        }

        if attachment.data.is_empty() {
            continue;
        }

        let storage_path = storage_save_session_attachment(
            app.clone(),
            character_id.to_string(),
            session_id.to_string(),
            message_id.to_string(),
            attachment.id.clone(),
            role.to_string(),
            attachment.data.clone(),
        )?;

        persisted.push(ImageAttachment {
            id: attachment.id,
            data: String::new(),
            mime_type: attachment.mime_type,
            filename: attachment.filename,
            width: attachment.width,
            height: attachment.height,
            storage_path: Some(storage_path),
        });
    }

    Ok(persisted)
}

use crate::storage_manager::media::storage_load_session_attachment;

fn load_attachment_data(app: &AppHandle, message: &StoredMessage) -> StoredMessage {
    let mut loaded_message = message.clone();

    loaded_message.attachments = message
        .attachments
        .iter()
        .map(|attachment| {
            if !attachment.data.is_empty() {
                return attachment.clone();
            }

            let storage_path = match &attachment.storage_path {
                Some(path) => path,
                None => return attachment.clone(),
            };

            match storage_load_session_attachment(app.clone(), storage_path.clone()) {
                Ok(data) => ImageAttachment {
                    id: attachment.id.clone(),
                    data,
                    mime_type: attachment.mime_type.clone(),
                    filename: attachment.filename.clone(),
                    width: attachment.width,
                    height: attachment.height,
                    storage_path: attachment.storage_path.clone(),
                },
                Err(_) => attachment.clone(),
            }
        })
        .collect();

    loaded_message
}

#[tauri::command]
pub async fn chat_completion(
    app: AppHandle,
    args: ChatCompletionArgs,
) -> Result<ChatTurnResult, String> {
    let ChatCompletionArgs {
        session_id,
        character_id,
        user_message,
        persona_id,
        stream,
        request_id,
        attachments,
    } = args;

    log_info(
        &app,
        "chat_completion",
        format!(
            "start session={} character={} stream={:?} request_id={:?}",
            &session_id, &character_id, stream, request_id
        ),
    );

    let context = ChatContext::initialize(app.clone())?;
    let settings = &context.settings;

    emit_debug(
        &app,
        "loading_character",
        json!({ "characterId": character_id.clone() }),
    );

    let character = match context.find_character(&character_id) {
        Ok(found) => found,
        Err(err) => {
            log_error(
                &app,
                "chat_completion",
                format!("character {} not found", &character_id),
            );
            return Err(err);
        }
    };

    let mut session = match context.load_session(&session_id)? {
        Some(s) => s,
        None => {
            log_error(
                &app,
                "chat_completion",
                format!("session {} not found", &session_id),
            );
            return Err("Session not found".to_string());
        }
    };

    let effective_persona_id = session.persona_id.as_ref().or(persona_id.as_ref());
    let persona = context.choose_persona(effective_persona_id.map(|id| id.as_str()));

    emit_debug(
        &app,
        "session_loaded",
        json!({
            "sessionId": session.id,
            "messageCount": session.messages.len(),
            "updatedAt": session.updated_at,
        }),
    );

    if session.character_id != character.id {
        session.character_id = character.id.clone();
    }

    let dynamic_memory_enabled = is_dynamic_memory_active(settings, &character);
    let dynamic_window = dynamic_window_size(settings);
    if dynamic_memory_enabled {
        let _ = prompts::ensure_dynamic_memory_templates(&app);
    }

    let (model, provider_cred) = context.select_model(&character)?;

    log_info(
        &app,
        "chat_completion",
        format!(
            "selected provider={} model={} credential={}",
            provider_cred.provider_id.as_str(),
            model.name.as_str(),
            provider_cred.id.as_str()
        ),
    );

    emit_debug(
        &app,
        "model_selected",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "credentialId": provider_cred.id,
        }),
    );

    let api_key = resolve_api_key(&app, provider_cred, "chat_completion")?;

    let now = now_millis()?;

    let user_msg_id = uuid::Uuid::new_v4().to_string();

    let persisted_attachments = persist_attachments(
        &app,
        &character_id,
        &session_id,
        &user_msg_id,
        "user",
        attachments,
    )?;

    let user_msg = StoredMessage {
        id: user_msg_id,
        role: "user".into(),
        content: user_message.clone(),
        created_at: now,
        usage: None,
        variants: Vec::new(),
        selected_variant_id: None,
        memory_refs: Vec::new(),
        is_pinned: false,
        attachments: persisted_attachments,
        reasoning: None,
    };
    session.messages.push(user_msg.clone());
    session.updated_at = now;
    save_session(&app, &session)?;

    emit_debug(
        &app,
        "session_saved",
        json!({
            "stage": "after_user_message",
            "sessionId": session.id,
            "messageCount": session.messages.len(),
            "updatedAt": session.updated_at,
        }),
    );

    let system_prompt = append_image_directive_instructions(
        context.build_system_prompt(&character, model, persona, &session),
        settings,
    );

    // Determine message window: use conversation_window for dynamic memory (limited context),
    // or recent_messages for manual memory (includes all recent non-scene messages)
    // For dynamic memory with pinned messages: pinned messages are always included but don't count in the limit
    let (pinned_msgs, recent_msgs) = if dynamic_memory_enabled {
        let (pinned, unpinned) = conversation_window_with_pinned(&session.messages, dynamic_window);
        (pinned, unpinned)
    } else {
        (
            Vec::new(),
            recent_messages(&session, manual_window_size(settings)),
        )
    };

    // Retrieve top-k relevant memories for this turn.
    // - Dynamic memory: use semantic search over memory embeddings
    // - Manual memory: memories are injected via system prompt (see below)
    let relevant_memories = if dynamic_memory_enabled && !session.memory_embeddings.is_empty() {
        // Build search query - use enriched query (last 2 msgs) if enabled, else just user message
        let search_query = if context_enrichment_enabled(settings) {
            build_enriched_query(&session.messages)
        } else {
            user_message.clone()
        };

        crate::utils::log_info(
            &app,
            "memory_retrieval",
            format!(
                "Search query ({} chars, enriched={})",
                search_query.len(),
                context_enrichment_enabled(settings)
            ),
        );

        select_relevant_memories(
            &app,
            &session,
            &search_query,
            5,
            dynamic_min_similarity(settings),
        )
        .await
    } else {
        Vec::new()
    };

    // Update access tracking for retrieved memories
    if !relevant_memories.is_empty() {
        let memory_ids: Vec<String> = relevant_memories.iter().map(|m| m.id.clone()).collect();
        // Promote any cold memories that were recalled via keyword search
        promote_cold_memories(&app, &mut session, &memory_ids);
        mark_memories_accessed(&mut session, &memory_ids);
    }

    let system_role = super::request_builder::system_role_for(provider_cred);
    let mut messages_for_api = Vec::new();
    crate::chat_manager::messages::push_system_message(
        &mut messages_for_api,
        &system_role,
        system_prompt,
    );

    // Inject memory context when available
    // - Dynamic memory: inject semantically relevant memories as context
    // - Manual memory: session.memories are already included in system prompt
    //   (see build_system_prompt in prompt_engine.rs)
    let memory_block = if dynamic_memory_enabled {
        if relevant_memories.is_empty() {
            None
        } else {
            Some(
                relevant_memories
                    .iter()
                    .map(|m| format!("- {}", m.text))
                    .collect::<Vec<_>>()
                    .join("\n"),
            )
        }
    } else if !session.memories.is_empty() {
        Some(
            session
                .memories
                .iter()
                .map(|m| format!("- {}", m))
                .collect::<Vec<_>>()
                .join("\n"),
        )
    } else {
        None
    };
    if let Some(block) = memory_block {
        crate::chat_manager::messages::push_system_message(
            &mut messages_for_api,
            &system_role,
            Some(format!("Relevant memories:\n{}", block)),
        );
    }

    let char_name = &character.name;
    let persona_name = persona.map(|p| p.title.as_str()).unwrap_or("");
    let allow_image_input = model
        .input_scopes
        .iter()
        .any(|scope| scope.eq_ignore_ascii_case("image"));

    // Include pinned messages first (if dynamic memory is enabled)
    // Pinned messages are always included but don't count against the sliding window limit
    for msg in &pinned_msgs {
        let msg_with_data = load_attachment_data(&app, msg);
        crate::chat_manager::messages::push_user_or_assistant_message_with_context(
            &mut messages_for_api,
            &msg_with_data,
            char_name,
            persona_name,
            allow_image_input,
        );
    }

    for msg in &recent_msgs {
        let msg_with_data = load_attachment_data(&app, msg);
        crate::chat_manager::messages::push_user_or_assistant_message_with_context(
            &mut messages_for_api,
            &msg_with_data,
            char_name,
            persona_name,
            allow_image_input,
        );
    }

    crate::chat_manager::messages::sanitize_placeholders_in_api_messages(
        &mut messages_for_api,
        char_name,
        persona_name,
    );

    let should_stream = stream.unwrap_or(true);
    let request_id = if should_stream {
        request_id.or_else(|| Some(Uuid::new_v4().to_string()))
    } else {
        None
    };

    let temperature = resolve_temperature(&session, &model, &settings);
    let top_p = resolve_top_p(&session, &model, &settings);
    let max_tokens = resolve_max_tokens(&session, &model, &settings);
    let frequency_penalty = resolve_frequency_penalty(&session, &model, &settings);
    let presence_penalty = resolve_presence_penalty(&session, &model, &settings);
    let top_k = resolve_top_k(&session, &model, &settings);
    let reasoning_enabled = resolve_reasoning_enabled(&session, &model, &settings);
    let reasoning_effort = resolve_reasoning_effort(&session, &model, &settings);
    let reasoning_budget =
        resolve_reasoning_budget(&session, &model, &settings, reasoning_effort.as_deref());

    log_info(
        &app,
        "chat_completion",
        format!(
            "reasoning settings: enabled={} effort={:?} budget={:?} model_adv={:?}",
            reasoning_enabled,
            reasoning_effort,
            reasoning_budget,
            model
                .advanced_model_settings
                .as_ref()
                .map(|a| a.reasoning_enabled)
        ),
    );

    let built = super::request_builder::build_chat_request(
        provider_cred,
        &api_key,
        &model.name,
        &messages_for_api,
        None,
        temperature,
        top_p,
        max_tokens,
        should_stream,
        request_id.clone(),
        frequency_penalty,
        presence_penalty,
        top_k,
        None,
        reasoning_enabled,
        reasoning_effort,
        reasoning_budget,
    );

    log_info(
        &app,
        "chat_completion",
        format!(
            "request prepared endpoint={} stream={} request_id={:?}",
            built.url.as_str(),
            should_stream,
            &request_id
        ),
    );

    log_info(
        &app,
        "chat_completion",
        format!(
            "request body: reasoning_effort={:?}, reasoning_budget={:?}, max_tokens={:?}, reasoning_enabled={}",
            built.body.get("reasoning_effort"),
            built.body.get("reasoning").and_then(|r| r.get("max_tokens")),
            built.body.get("max_completion_tokens").or(built.body.get("max_tokens")),
            reasoning_enabled
        ),
    );

    if let Some(reasoning_config) = built.body.get("reasoning") {
        log_info(
            &app,
            "chat_completion",
            format!("reasoning config: {}", reasoning_config),
        );
    }

    emit_debug(
        &app,
        "sending_request",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "stream": should_stream,
            "requestId": request_id,
            "endpoint": built.url,
            "reasoning": built.body.get("reasoning"),
            "reasoning_effort": built.body.get("reasoning_effort"),
            "max_completion_tokens": built.body.get("max_completion_tokens"),
        }),
    );

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(900_000),
        stream: Some(built.stream),
        request_id: built.request_id.clone(),
        provider_id: Some(provider_cred.provider_id.clone()),
    };

    let api_response = match api_request(app.clone(), api_request_payload).await {
        Ok(resp) => resp,
        Err(err) => {
            log_error(
                &app,
                "chat_completion",
                format!("api_request failed: {}", err),
            );
            return Err(err);
        }
    };

    emit_debug(
        &app,
        "response",
        json!({
            "status": api_response.status,
            "ok": api_response.ok,
        }),
    );

    if !api_response.ok {
        let fallback = format!("Provider returned status {}", api_response.status);
        let err_message = extract_error_message(api_response.data()).unwrap_or(fallback.clone());

        // Extract usage even from failed requests (some providers report tokens used before failure)
        let failed_usage = extract_usage(api_response.data());
        if let Some(ref usage) = failed_usage {
            log_info(
                &app,
                "chat_completion",
                format!("usage from failed request: prompt={:?} completion={:?} total={:?} reasoning={:?}",
                    usage.prompt_tokens, usage.completion_tokens, usage.total_tokens, usage.reasoning_tokens),
            );
            emit_debug(
                &app,
                "failed_request_usage",
                json!({
                    "promptTokens": usage.prompt_tokens,
                    "completionTokens": usage.completion_tokens,
                    "totalTokens": usage.total_tokens,
                    "reasoningTokens": usage.reasoning_tokens,
                }),
            );
            record_failed_usage(
                &app,
                &failed_usage,
                &session,
                &character,
                model,
                provider_cred,
                "chat",
                &err_message,
                "chat_completion",
            );
        }

        emit_debug(
            &app,
            "provider_error",
            json!({
                "status": api_response.status,
                "message": err_message,
                "usage": failed_usage,
            }),
        );
        let combined_error = if err_message == fallback {
            err_message
        } else {
            format!("{} (status {})", err_message, api_response.status)
        };
        log_error(
            &app,
            "chat_completion",
            format!("provider error: {}", &combined_error),
        );
        return Err(combined_error);
    }

    // Extract assistant text and any image outputs.
    // Some multimodal models stream image data URLs via SSE; we must not treat those as text.
    let images_from_sse = match api_response.data() {
        Value::String(s) if s.contains("data:") => {
            super::sse::accumulate_image_data_urls_from_sse(s)
        }
        _ => Vec::new(),
    };

    let text = extract_text(api_response.data()).unwrap_or_default();
    let usage = extract_usage(api_response.data());
    let reasoning = extract_reasoning(api_response.data());

    if text.trim().is_empty() && images_from_sse.is_empty() {
        let preview =
            serde_json::to_string(api_response.data()).unwrap_or_else(|_| "<non-json>".into());
        
        // Enhanced debug info for diagnosing model-specific parsing issues
        let raw_len = match api_response.data() {
            Value::String(s) => s.len(),
            _ => 0,
        };
        let has_sse_marker = match api_response.data() {
            Value::String(s) => s.contains("data:"),
            _ => false,
        };

        let has_reasoning = reasoning.as_ref().map_or(false, |r| !r.trim().is_empty());
        let reasoning_len = reasoning.as_ref().map_or(0, |r| r.len());
        let error_detail = if has_reasoning {
            "Model completed reasoning but generated no response text. This may indicate the model ran out of tokens or encountered an issue during generation."
        } else {
            "Empty response from provider"
        };

        log_error(
            &app,
            "chat_completion",
            format!(
                "empty response from provider: has_reasoning={}, reasoning_len={}, raw_len={}, has_sse_marker={}, preview_start={}",
                has_reasoning, 
                reasoning_len,
                raw_len,
                has_sse_marker,
                preview.chars().take(500).collect::<String>()
            ),
        );
        emit_debug(
            &app,
            "empty_response",
            json!({ 
                "preview": preview, 
                "hasReasoning": has_reasoning,
                "reasoningLen": reasoning_len,
                "rawLen": raw_len,
                "hasSseMarker": has_sse_marker
            }),
        );
        return Err(error_detail.to_string());
    }

    emit_debug(
        &app,
        "assistant_reply",
        json!({
            "length": text.len(),
        }),
    );

    let assistant_created_at = now_millis()?;
    let variant = new_assistant_variant(text.clone(), usage.clone(), assistant_created_at);
    let variant_id = variant.id.clone();

    let assistant_message_id = Uuid::new_v4().to_string();

    let mut assistant_generated_attachments: Vec<ImageAttachment> = Vec::new();
    for data_url in images_from_sse {
        // Best-effort mime type inference from data URL header; fallback to PNG.
        let mime_type = data_url
            .split_once(";base64,")
            .and_then(|(prefix, _)| prefix.strip_prefix("data:"))
            .unwrap_or("image/png")
            .to_string();

        assistant_generated_attachments.push(ImageAttachment {
            id: Uuid::new_v4().to_string(),
            data: data_url,
            mime_type,
            filename: None,
            width: None,
            height: None,
            storage_path: None,
        });
    }

    let persisted_assistant_attachments = persist_attachments(
        &app,
        &character_id,
        &session_id,
        &assistant_message_id,
        "assistant",
        assistant_generated_attachments,
    )?;

    let assistant_message = StoredMessage {
        id: assistant_message_id,
        role: "assistant".into(),
        content: text.clone(),
        created_at: assistant_created_at,
        usage: usage.clone(),
        variants: vec![variant],
        selected_variant_id: Some(variant_id),
        memory_refs: if dynamic_memory_enabled {
            relevant_memories
                .iter()
                .map(|m| {
                    if let Some(score) = m.match_score {
                        format!("{}::{}", score, m.text)
                    } else {
                        m.text.clone()
                    }
                })
                .collect()
        } else {
            Vec::new()
        },
        is_pinned: false,
        attachments: persisted_assistant_attachments,
        reasoning,
    };

    session.messages.push(assistant_message.clone());
    session.updated_at = now_millis()?;
    save_session(&app, &session)?;

    log_info(
        &app,
        "chat_completion",
        format!(
            "assistant response saved message_id={} length={} total_messages={}",
            assistant_message.id.as_str(),
            assistant_message.content.len(),
            session.messages.len()
        ),
    );

    emit_debug(
        &app,
        "session_saved",
        json!({
            "stage": "after_assistant_message",
            "sessionId": session.id,
            "messageCount": session.messages.len(),
            "updatedAt": session.updated_at,
        }),
    );

    record_usage_if_available(
        &context,
        &usage,
        &session,
        &character,
        model,
        provider_cred,
        &api_key,
        assistant_created_at,
        "chat",
        "chat_completion",
    )
    .await;

    if dynamic_memory_enabled {
        if let Err(err) =
            process_dynamic_memory_cycle(&app, &mut session, settings, &character).await
        {
            log_error(
                &app,
                "chat_completion",
                format!("dynamic memory cycle failed: {}", err),
            );
        }
    }

    Ok(ChatTurnResult {
        session: session.clone(),
        session_id: session.id,
        request_id,
        user_message: user_msg,
        assistant_message,
        usage,
    })
}

#[tauri::command]
pub async fn chat_regenerate(
    app: AppHandle,
    args: ChatRegenerateArgs,
) -> Result<RegenerateResult, String> {
    let ChatRegenerateArgs {
        session_id,
        message_id,
        stream,
        request_id,
    } = args;

    let context = ChatContext::initialize(app.clone())?;
    let settings = &context.settings;

    log_info(
        &app,
        "chat_regenerate",
        format!(
            "start session={} message={} stream={:?} request_id={:?}",
            &session_id, &message_id, stream, request_id
        ),
    );

    let mut session = match context.load_session(&session_id)? {
        Some(s) => s,
        None => {
            log_error(
                &app,
                "chat_regenerate",
                format!("session {} not found", &session_id),
            );
            return Err("Session not found".to_string());
        }
    };

    emit_debug(
        &app,
        "regenerate_start",
        json!({
            "sessionId": session.id,
            "messageId": message_id,
            "messageCount": session.messages.len(),
        }),
    );

    if session.messages.is_empty() {
        return Err("No messages available for regeneration".into());
    }

    let target_index = session
        .messages
        .iter()
        .position(|msg| msg.id == message_id)
        .ok_or_else(|| "Assistant message not found".to_string())?;

    if target_index + 1 != session.messages.len() {
        return Err("Can only regenerate the latest assistant response".into());
    }

    if target_index == 0 {
        return Err("Assistant message has no preceding user prompt".into());
    }

    let preceding_index = target_index - 1;
    let preceding_message = &session.messages[preceding_index];
    if preceding_message.role != "user"
        && preceding_message.role != "assistant"
        && preceding_message.role != "scene"
    {
        return Err(
            "Expected preceding user, assistant, or scene message before assistant response".into(),
        );
    }

    if session.messages[target_index].role != "assistant"
        && session.messages[target_index].role != "scene"
    {
        return Err("Selected message is not an assistant or scene response".into());
    }

    let character = match context.find_character(&session.character_id) {
        Ok(found) => found,
        Err(err) => {
            log_error(
                &app,
                "chat_regenerate",
                format!("character {} not found", &session.character_id),
            );
            return Err(err);
        }
    };

    let persona = context.choose_persona(None);

    let (model, provider_cred) = context.select_model(&character)?;

    log_info(
        &app,
        "chat_regenerate",
        format!(
            "selected provider={} model={} credential={}",
            provider_cred.provider_id.as_str(),
            model.name.as_str(),
            provider_cred.id.as_str()
        ),
    );

    emit_debug(
        &app,
        "regenerate_model_selected",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "credentialId": provider_cred.id,
        }),
    );

    let api_key = resolve_api_key(&app, provider_cred, "chat_regenerate")?;

    let dynamic_memory_enabled = is_dynamic_memory_active(settings, &character);
    let dynamic_window = dynamic_window_size(settings);

    let relevant_memories = if dynamic_memory_enabled && !session.memory_embeddings.is_empty() {
        // Build search query - use enriched query (last 2 msgs up to target) if enabled
        let messages_up_to: Vec<StoredMessage> = session
            .messages
            .iter()
            .take(target_index + 1) // Include the message being regenerated
            .cloned()
            .collect();
        let search_query = if context_enrichment_enabled(&context.settings) {
            build_enriched_query(&messages_up_to)
        } else {
            messages_up_to
                .iter()
                .rev()
                .find(|m| m.role == "user")
                .map(|m| m.content.clone())
                .unwrap_or_default()
        };
        select_relevant_memories(
            &app,
            &session,
            &search_query,
            5,
            dynamic_min_similarity(&context.settings),
        )
        .await
    } else {
        Vec::new()
    };

    // Update access tracking for retrieved memories
    if !relevant_memories.is_empty() {
        let memory_ids: Vec<String> = relevant_memories.iter().map(|m| m.id.clone()).collect();
        promote_cold_memories(&app, &mut session, &memory_ids);
        mark_memories_accessed(&mut session, &memory_ids);
    }

    let system_prompt = append_image_directive_instructions(
        context.build_system_prompt(&character, model, persona, &session),
        settings,
    );

    let system_role = super::request_builder::system_role_for(provider_cred);
    let messages_for_api = {
        let mut out = Vec::new();
        crate::chat_manager::messages::push_system_message(&mut out, &system_role, system_prompt);

        let char_name = &character.name;
        let persona_name = persona.map(|p| p.title.as_str()).unwrap_or("");
        let allow_image_input = model
            .input_scopes
            .iter()
            .any(|scope| scope.eq_ignore_ascii_case("image"));

        let messages_before_target: Vec<StoredMessage> = session
            .messages
            .iter()
            .enumerate()
            .filter(|(idx, _)| *idx < target_index)
            .map(|(_, msg)| msg.clone())
            .collect();

        if dynamic_memory_enabled {
            let (pinned_msgs, recent_msgs) =
                conversation_window_with_pinned(&messages_before_target, dynamic_window);

            for msg in &pinned_msgs {
                let msg_with_data = load_attachment_data(&app, msg);
                crate::chat_manager::messages::push_user_or_assistant_message_with_context(
                    &mut out,
                    &msg_with_data,
                    char_name,
                    persona_name,
                    allow_image_input,
                );
            }

            for msg in &recent_msgs {
                let msg_with_data = load_attachment_data(&app, msg);
                crate::chat_manager::messages::push_user_or_assistant_message_with_context(
                    &mut out,
                    &msg_with_data,
                    char_name,
                    persona_name,
                    allow_image_input,
                );
            }
        } else {
            let start_index = target_index.saturating_sub(manual_window_size(settings));
            for (idx, msg) in session.messages.iter().enumerate() {
                if idx < start_index {
                    continue;
                }
                if idx > target_index {
                    break;
                }
                if idx == target_index {
                    continue;
                }
                let msg_with_data = load_attachment_data(&app, msg);
                crate::chat_manager::messages::push_user_or_assistant_message_with_context(
                    &mut out,
                    &msg_with_data,
                    char_name,
                    persona_name,
                    allow_image_input,
                );
            }
        }

        crate::chat_manager::messages::sanitize_placeholders_in_api_messages(
            &mut out,
            char_name,
            persona_name,
        );
        out
    };

    let should_stream = stream.unwrap_or(true);
    let request_id = if should_stream {
        request_id.or_else(|| Some(Uuid::new_v4().to_string()))
    } else {
        None
    };

    {
        let message = session
            .messages
            .get_mut(target_index)
            .ok_or_else(|| "Assistant message not accessible".to_string())?;
        ensure_assistant_variant(message);
    }

    let temperature = resolve_temperature(&session, &model, &settings);
    let top_p = resolve_top_p(&session, &model, &settings);
    let max_tokens = resolve_max_tokens(&session, &model, &settings);
    let frequency_penalty = resolve_frequency_penalty(&session, &model, &settings);
    let presence_penalty = resolve_presence_penalty(&session, &model, &settings);
    let top_k = resolve_top_k(&session, &model, &settings);
    let reasoning_enabled = resolve_reasoning_enabled(&session, &model, &settings);
    let reasoning_effort = resolve_reasoning_effort(&session, &model, &settings);
    let reasoning_budget =
        resolve_reasoning_budget(&session, &model, &settings, reasoning_effort.as_deref());

    let built = super::request_builder::build_chat_request(
        provider_cred,
        &api_key,
        &model.name,
        &messages_for_api,
        None,
        temperature,
        top_p,
        max_tokens,
        should_stream,
        request_id.clone(),
        frequency_penalty,
        presence_penalty,
        top_k,
        None,
        reasoning_enabled,
        reasoning_effort,
        reasoning_budget,
    );

    emit_debug(
        &app,
        "regenerate_request",
        json!({
            "sessionId": session.id,
            "messageId": message_id,
            "requestId": request_id,
            "endpoint": built.url,
        }),
    );

    log_info(
        &app,
        "chat_regenerate",
        format!(
            "request prepared endpoint={} stream={} request_id={:?}",
            built.url.as_str(),
            should_stream,
            &request_id
        ),
    );

    log_info(
        &app,
        "chat_regenerate",
        format!(
            "request body: reasoning_effort={:?}, reasoning_budget={:?}, max_tokens={:?}, reasoning_enabled={}",
            built.body.get("reasoning_effort"),
            built.body.get("reasoning").and_then(|r| r.get("max_tokens")),
            built.body.get("max_completion_tokens").or(built.body.get("max_tokens")),
            reasoning_enabled
        ),
    );

    if let Some(reasoning_config) = built.body.get("reasoning") {
        log_info(
            &app,
            "chat_regenerate",
            format!("reasoning config: {}", reasoning_config),
        );
    }

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(900_000),
        stream: Some(built.stream),
        request_id: built.request_id.clone(),
        provider_id: Some(provider_cred.provider_id.clone()),
    };

    let api_response = match api_request(app.clone(), api_request_payload).await {
        Ok(resp) => resp,
        Err(err) => {
            log_error(
                &app,
                "chat_regenerate",
                format!("api_request failed: {}", err),
            );
            return Err(err);
        }
    };

    emit_debug(
        &app,
        "regenerate_response",
        json!({
            "status": api_response.status,
            "ok": api_response.ok,
        }),
    );

    if !api_response.ok {
        let fallback = format!("Provider returned status {}", api_response.status);
        let err_message = extract_error_message(api_response.data()).unwrap_or(fallback.clone());

        // Extract usage even from failed requests
        let failed_usage = extract_usage(api_response.data());
        if let Some(ref usage) = failed_usage {
            emit_debug(
                &app,
                "failed_request_usage",
                json!({
                    "promptTokens": usage.prompt_tokens,
                    "completionTokens": usage.completion_tokens,
                    "totalTokens": usage.total_tokens,
                    "reasoningTokens": usage.reasoning_tokens,
                }),
            );
        }

        emit_debug(
            &app,
            "regenerate_provider_error",
            json!({
                "status": api_response.status,
                "message": err_message,
                "usage": failed_usage,
            }),
        );
        record_failed_usage(
            &app,
            &failed_usage,
            &session,
            &character,
            model,
            provider_cred,
            "regenerate",
            &err_message,
            "chat_regenerate",
        );
        return if err_message == fallback {
            Err(err_message)
        } else {
            Err(format!("{} (status {})", err_message, api_response.status))
        };
    }

    let images_from_sse = match api_response.data() {
        Value::String(s) if s.contains("data:") => {
            super::sse::accumulate_image_data_urls_from_sse(s)
        }
        _ => Vec::new(),
    };

    let text = extract_text(api_response.data()).unwrap_or_default();
    let usage = extract_usage(api_response.data());
    let reasoning = extract_reasoning(api_response.data());

    if text.trim().is_empty() && images_from_sse.is_empty() {
        let preview =
            serde_json::to_string(api_response.data()).unwrap_or_else(|_| "<non-json>".into());

        let has_reasoning = reasoning.as_ref().map_or(false, |r| !r.trim().is_empty());
        let error_detail = if has_reasoning {
            "Model completed reasoning but generated no response text. This may indicate the model ran out of tokens or encountered an issue during generation."
        } else {
            "Empty response from provider"
        };

        emit_debug(
            &app,
            "regenerate_empty_response",
            json!({ "preview": preview, "hasReasoning": has_reasoning }),
        );
        return Err(error_detail.to_string());
    }

    let created_at = now_millis()?;
    let new_variant = new_assistant_variant(text.clone(), usage.clone(), created_at);

    let mut assistant_generated_attachments: Vec<ImageAttachment> = Vec::new();
    for data_url in images_from_sse {
        let mime_type = data_url
            .split_once(";base64,")
            .and_then(|(prefix, _)| prefix.strip_prefix("data:"))
            .unwrap_or("image/png")
            .to_string();
        assistant_generated_attachments.push(ImageAttachment {
            id: Uuid::new_v4().to_string(),
            data: data_url,
            mime_type,
            filename: None,
            width: None,
            height: None,
            storage_path: None,
        });
    }

    let persisted_assistant_attachments = persist_attachments(
        &app,
        &character.id,
        &session.id,
        &message_id,
        "assistant",
        assistant_generated_attachments,
    )?;

    let assistant_clone = {
        let assistant_message = session
            .messages
            .get_mut(target_index)
            .ok_or_else(|| "Assistant message not accessible".to_string())?;

        assistant_message.content = text.clone();
        assistant_message.usage = usage.clone();
        assistant_message.reasoning = reasoning.clone();
        assistant_message.variants.push(new_variant);
        if let Some(last) = assistant_message.variants.last() {
            assistant_message.selected_variant_id = Some(last.id.clone());
        }

        if dynamic_memory_enabled {
            assistant_message.memory_refs = relevant_memories
                .iter()
                .map(|m| {
                    if let Some(score) = m.match_score {
                        format!("{}::{}", score, m.text)
                    } else {
                        m.text.clone()
                    }
                })
                .collect();
        }
        if !persisted_assistant_attachments.is_empty() {
            assistant_message.attachments = persisted_assistant_attachments;
        }
        assistant_message.clone()
    };

    session.updated_at = now_millis()?;
    save_session(&app, &session)?;

    emit_debug(
        &app,
        "regenerate_saved",
        json!({
            "sessionId": session.id,
            "messageId": message_id,
            "variantId": assistant_clone
                .selected_variant_id
                .clone()
                .unwrap_or_default(),
            "variantCount": assistant_clone.variants.len(),
        }),
    );

    log_info(
        &app,
        "chat_regenerate",
        format!(
            "completed messageId={} variants={} request_id={:?}",
            assistant_clone.id.as_str(),
            assistant_clone.variants.len(),
            &request_id
        ),
    );

    record_usage_if_available(
        &context,
        &usage,
        &session,
        &character,
        model,
        provider_cred,
        &api_key,
        created_at,
        "regenerate",
        "chat_regenerate",
    )
    .await;

    Ok(RegenerateResult {
        session: session.clone(),
        session_id: session.id,
        request_id,
        assistant_message: assistant_clone,
    })
}

#[tauri::command]
pub async fn chat_continue(
    app: AppHandle,
    args: ChatContinueArgs,
) -> Result<ContinueResult, String> {
    let ChatContinueArgs {
        session_id,
        character_id,
        persona_id,
        stream,
        request_id,
    } = args;

    let context = ChatContext::initialize(app.clone())?;
    let settings = &context.settings;

    log_info(
        &app,
        "chat_continue",
        format!(
            "start session={} character={} stream={:?} request_id={:?}",
            &session_id, &character_id, stream, request_id
        ),
    );

    let mut session = match context.load_session(&session_id)? {
        Some(s) => s,
        None => {
            log_error(
                &app,
                "chat_continue",
                format!("session {} not found", &session_id),
            );
            return Err("Session not found".to_string());
        }
    };

    emit_debug(
        &app,
        "continue_start",
        json!({
            "sessionId": session.id,
            "characterId": character_id,
            "messageCount": session.messages.len(),
        }),
    );

    let character = match context.find_character(&character_id) {
        Ok(found) => found,
        Err(err) => {
            log_error(
                &app,
                "chat_continue",
                format!("character {} not found", &character_id),
            );
            return Err(err);
        }
    };

    let effective_persona_id = session.persona_id.as_ref().or(persona_id.as_ref());
    let persona = context.choose_persona(effective_persona_id.map(|id| id.as_str()));

    let (model, provider_cred) = context.select_model(&character)?;

    log_info(
        &app,
        "chat_continue",
        format!(
            "selected provider={} model={} credential={}",
            provider_cred.provider_id.as_str(),
            model.name.as_str(),
            provider_cred.id.as_str()
        ),
    );

    emit_debug(
        &app,
        "continue_model_selected",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "credentialId": provider_cred.id,
        }),
    );

    let api_key = resolve_api_key(&app, provider_cred, "chat_continue")?;

    let dynamic_memory_enabled = is_dynamic_memory_active(settings, &character);
    let dynamic_window = dynamic_window_size(settings);

    let relevant_memories = if dynamic_memory_enabled && !session.memory_embeddings.is_empty() {
        // Build search query - use enriched query (last 2 msgs) if enabled
        let search_query = if context_enrichment_enabled(&context.settings) {
            build_enriched_query(&session.messages)
        } else {
            session
                .messages
                .iter()
                .rev()
                .find(|m| m.role == "user")
                .map(|m| m.content.clone())
                .unwrap_or_default()
        };
        select_relevant_memories(
            &app,
            &session,
            &search_query,
            5,
            dynamic_min_similarity(&context.settings),
        )
        .await
    } else {
        Vec::new()
    };

    // Update access tracking for retrieved memories
    if !relevant_memories.is_empty() {
        let memory_ids: Vec<String> = relevant_memories.iter().map(|m| m.id.clone()).collect();
        promote_cold_memories(&app, &mut session, &memory_ids);
        mark_memories_accessed(&mut session, &memory_ids);
    }

    let system_prompt = append_image_directive_instructions(
        context.build_system_prompt(&character, model, persona, &session),
        settings,
    );

    let (pinned_msgs, recent_msgs) = if dynamic_memory_enabled {
        let (pinned, unpinned) = conversation_window_with_pinned(&session.messages, dynamic_window);
        (pinned, unpinned)
    } else {
        (
            Vec::new(),
            recent_messages(&session, manual_window_size(settings)),
        )
    };

    let system_role = super::request_builder::system_role_for(provider_cred);
    let mut messages_for_api = Vec::new();
    crate::chat_manager::messages::push_system_message(
        &mut messages_for_api,
        &system_role,
        system_prompt,
    );

    let char_name = &character.name;
    let persona_name = persona.map(|p| p.title.as_str()).unwrap_or("");
    let allow_image_input = model
        .input_scopes
        .iter()
        .any(|scope| scope.eq_ignore_ascii_case("image"));

    for msg in &pinned_msgs {
        let msg_with_data = load_attachment_data(&app, msg);
        crate::chat_manager::messages::push_user_or_assistant_message_with_context(
            &mut messages_for_api,
            &msg_with_data,
            char_name,
            persona_name,
            allow_image_input,
        );
    }

    for msg in &recent_msgs {
        let msg_with_data = load_attachment_data(&app, msg);
        crate::chat_manager::messages::push_user_or_assistant_message_with_context(
            &mut messages_for_api,
            &msg_with_data,
            char_name,
            persona_name,
            allow_image_input,
        );
    }
    crate::chat_manager::messages::sanitize_placeholders_in_api_messages(
        &mut messages_for_api,
        char_name,
        persona_name,
    );

    messages_for_api.push(json!({
        "role": "user",
        "content": "[CONTINUE] You were in the middle of a response. Continue writing from exactly where you left off. Do NOT restart, regenerate, or rewrite what you already said. Simply pick up the narrative thread and continue the scene forward with new content."
    }));

    let should_stream = stream.unwrap_or(true);
    let request_id = if should_stream {
        request_id.or_else(|| Some(Uuid::new_v4().to_string()))
    } else {
        None
    };

    let temperature = resolve_temperature(&session, &model, &settings);
    let top_p = resolve_top_p(&session, &model, &settings);
    let max_tokens = resolve_max_tokens(&session, &model, &settings);
    let frequency_penalty = resolve_frequency_penalty(&session, &model, &settings);
    let presence_penalty = resolve_presence_penalty(&session, &model, &settings);
    let top_k = resolve_top_k(&session, &model, &settings);
    let reasoning_enabled = resolve_reasoning_enabled(&session, &model, &settings);
    let reasoning_effort = resolve_reasoning_effort(&session, &model, &settings);
    let reasoning_budget =
        resolve_reasoning_budget(&session, &model, &settings, reasoning_effort.as_deref());

    let built = super::request_builder::build_chat_request(
        provider_cred,
        &api_key,
        &model.name,
        &messages_for_api,
        None,
        temperature,
        top_p,
        max_tokens,
        should_stream,
        request_id.clone(),
        frequency_penalty,
        presence_penalty,
        top_k,
        None,
        reasoning_enabled,
        reasoning_effort,
        reasoning_budget,
    );

    emit_debug(
        &app,
        "continue_request",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "stream": should_stream,
            "requestId": request_id,
            "endpoint": built.url,
        }),
    );

    log_info(
        &app,
        "chat_continue",
        format!(
            "request prepared endpoint={} stream={} request_id={:?}",
            built.url.as_str(),
            should_stream,
            &request_id
        ),
    );

    log_info(
        &app,
        "chat_continue",
        format!(
            "request body: reasoning_effort={:?}, reasoning_budget={:?}, max_tokens={:?}, reasoning_enabled={}",
            built.body.get("reasoning_effort"),
            built.body.get("reasoning").and_then(|r| r.get("max_tokens")),
            built.body.get("max_completion_tokens").or(built.body.get("max_tokens")),
            reasoning_enabled
        ),
    );

    if let Some(reasoning_config) = built.body.get("reasoning") {
        log_info(
            &app,
            "chat_continue",
            format!("reasoning config: {}", reasoning_config),
        );
    }

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(900_000),
        stream: Some(built.stream),
        request_id: built.request_id.clone(),
        provider_id: Some(provider_cred.provider_id.clone()),
    };

    let api_response = match api_request(app.clone(), api_request_payload).await {
        Ok(resp) => resp,
        Err(err) => {
            log_error(
                &app,
                "chat_continue",
                format!("api_request failed: {}", err),
            );
            return Err(err);
        }
    };

    emit_debug(
        &app,
        "continue_response",
        json!({
            "status": api_response.status,
            "ok": api_response.ok,
        }),
    );

    if !api_response.ok {
        let fallback = format!("Provider returned status {}", api_response.status);
        let err_message = extract_error_message(api_response.data()).unwrap_or(fallback.clone());

        // Extract usage even from failed requests
        let failed_usage = extract_usage(api_response.data());
        if let Some(ref usage) = failed_usage {
            emit_debug(
                &app,
                "failed_request_usage",
                json!({
                    "promptTokens": usage.prompt_tokens,
                    "completionTokens": usage.completion_tokens,
                    "totalTokens": usage.total_tokens,
                    "reasoningTokens": usage.reasoning_tokens,
                }),
            );
        }

        log_error(
            &app,
            "chat_continue",
            format!(
                "provider returned error status={} message={}",
                api_response.status, &err_message
            ),
        );
        emit_debug(
            &app,
            "continue_provider_error",
            json!({
                "status": api_response.status,
                "message": err_message,
                "usage": failed_usage,
            }),
        );
        record_failed_usage(
            &app,
            &failed_usage,
            &session,
            &character,
            model,
            provider_cred,
            "continue",
            &err_message,
            "chat_continue",
        );
        return if err_message == fallback {
            Err(err_message)
        } else {
            Err(format!("{} (status {})", err_message, api_response.status))
        };
    }

    let images_from_sse = match api_response.data() {
        Value::String(s) if s.contains("data:") => {
            super::sse::accumulate_image_data_urls_from_sse(s)
        }
        _ => Vec::new(),
    };

    let text = extract_text(api_response.data()).unwrap_or_default();
    let usage = extract_usage(api_response.data());
    let reasoning = extract_reasoning(api_response.data());

    if text.trim().is_empty() && images_from_sse.is_empty() {
        let preview =
            serde_json::to_string(api_response.data()).unwrap_or_else(|_| "<non-json>".into());

        let has_reasoning = reasoning.as_ref().map_or(false, |r| !r.trim().is_empty());
        let error_detail = if has_reasoning {
            "Model completed reasoning but generated no response text. This may indicate the model ran out of tokens or encountered an issue during generation."
        } else {
            "Empty response from provider"
        };

        log_warn(
            &app,
            "chat_continue",
            format!(
                "empty response from provider, has_reasoning={}, preview={}",
                has_reasoning, &preview
            ),
        );
        emit_debug(
            &app,
            "continue_empty_response",
            json!({ "preview": preview, "hasReasoning": has_reasoning }),
        );
        return Err(error_detail.to_string());
    }

    emit_debug(
        &app,
        "continue_assistant_reply",
        json!({
            "length": text.len(),
        }),
    );

    let assistant_created_at = now_millis()?;
    let variant = new_assistant_variant(text.clone(), usage.clone(), assistant_created_at);
    let variant_id = variant.id.clone();

    let assistant_message_id = Uuid::new_v4().to_string();

    let mut assistant_generated_attachments: Vec<ImageAttachment> = Vec::new();
    for data_url in images_from_sse {
        let mime_type = data_url
            .split_once(";base64,")
            .and_then(|(prefix, _)| prefix.strip_prefix("data:"))
            .unwrap_or("image/png")
            .to_string();
        assistant_generated_attachments.push(ImageAttachment {
            id: Uuid::new_v4().to_string(),
            data: data_url,
            mime_type,
            filename: None,
            width: None,
            height: None,
            storage_path: None,
        });
    }

    let persisted_assistant_attachments = persist_attachments(
        &app,
        &character_id,
        &session_id,
        &assistant_message_id,
        "assistant",
        assistant_generated_attachments,
    )?;

    let assistant_message = StoredMessage {
        id: assistant_message_id,
        role: "assistant".into(),
        content: text.clone(),
        created_at: assistant_created_at,
        usage: usage.clone(),
        variants: vec![variant],
        selected_variant_id: Some(variant_id),
        memory_refs: if dynamic_memory_enabled {
            relevant_memories
                .iter()
                .map(|m| {
                    if let Some(score) = m.match_score {
                        format!("{}::{}", score, m.text)
                    } else {
                        m.text.clone()
                    }
                })
                .collect()
        } else {
            Vec::new()
        },
        is_pinned: false,
        attachments: persisted_assistant_attachments,
        reasoning,
    };

    session.messages.push(assistant_message.clone());
    session.updated_at = now_millis()?;
    save_session(&app, &session)?;

    emit_debug(
        &app,
        "continue_session_saved",
        json!({
            "sessionId": session.id,
            "messageCount": session.messages.len(),
            "updatedAt": session.updated_at,
        }),
    );

    log_info(
        &app,
        "chat_continue",
        format!(
            "assistant continuation saved message_id={} total_messages={} request_id={:?}",
            assistant_message.id.as_str(),
            session.messages.len(),
            &request_id
        ),
    );

    record_usage_if_available(
        &context,
        &usage,
        &session,
        &character,
        model,
        provider_cred,
        &api_key,
        assistant_created_at,
        "continue",
        "chat_continue",
    )
    .await;

    Ok(ContinueResult {
        session: session.clone(),
        session_id: session.id,
        request_id,
        assistant_message,
    })
}

#[tauri::command]
pub fn get_default_character_rules(pure_mode_enabled: bool) -> Vec<String> {
    default_character_rules(pure_mode_enabled)
}

#[tauri::command]
pub fn get_default_system_prompt_template() -> String {
    get_base_prompt(PromptType::SystemPrompt)
}

// ==================== Prompt Template Commands ====================

#[tauri::command]
pub fn list_prompt_templates(app: AppHandle) -> Result<Vec<SystemPromptTemplate>, String> {
    prompts::load_templates(&app)
}

#[tauri::command]
pub fn create_prompt_template(
    app: AppHandle,
    name: String,
    scope: PromptScope,
    target_ids: Vec<String>,
    content: String,
) -> Result<SystemPromptTemplate, String> {
    prompts::create_template(&app, name, scope, target_ids, content)
}

#[tauri::command]
pub fn update_prompt_template(
    app: AppHandle,
    id: String,
    name: Option<String>,
    scope: Option<PromptScope>,
    target_ids: Option<Vec<String>>,
    content: Option<String>,
) -> Result<SystemPromptTemplate, String> {
    prompts::update_template(&app, id, name, scope, target_ids, content)
}

#[tauri::command]
pub fn delete_prompt_template(app: AppHandle, id: String) -> Result<(), String> {
    prompts::delete_template(&app, id)
}

#[tauri::command]
pub fn get_prompt_template(
    app: AppHandle,
    id: String,
) -> Result<Option<SystemPromptTemplate>, String> {
    prompts::get_template(&app, &id)
}

#[tauri::command]
pub fn get_app_default_template_id() -> String {
    prompts::APP_DEFAULT_TEMPLATE_ID.to_string()
}

#[tauri::command]
pub fn is_app_default_template(id: String) -> bool {
    prompts::is_app_default_template(&id)
}

#[tauri::command]
pub fn reset_app_default_template(app: AppHandle) -> Result<SystemPromptTemplate, String> {
    prompts::reset_app_default_template(&app)
}

#[tauri::command]
pub fn reset_dynamic_summary_template(app: AppHandle) -> Result<SystemPromptTemplate, String> {
    prompts::reset_dynamic_summary_template(&app)
}

#[tauri::command]
pub fn reset_dynamic_memory_template(app: AppHandle) -> Result<SystemPromptTemplate, String> {
    prompts::reset_dynamic_memory_template(&app)
}

#[tauri::command]
pub fn get_required_template_variables(template_id: String) -> Vec<String> {
    prompts::get_required_variables(&template_id)
}

#[tauri::command]
pub fn validate_template_variables(template_id: String, content: String) -> Result<(), String> {
    prompts::validate_required_variables(&template_id, &content)
        .map_err(|missing| format!("Missing required variables: {}", missing.join(", ")))
}

// Deprecated: get_applicable_prompts_for_* commands removed in favor of global list on client

// ==================== Prompt Preview Command ====================

#[tauri::command]
pub fn render_prompt_preview(
    app: AppHandle,
    content: String,
    character_id: String,
    session_id: Option<String>,
    persona_id: Option<String>,
) -> Result<String, String> {
    let context = super::service::ChatContext::initialize(app.clone())?;
    let settings = &context.settings;

    let character = context.find_character(&character_id)?;

    // Load session if provided, otherwise synthesize a minimal one
    let session: Session = if let Some(sid) = session_id.as_ref() {
        context
            .load_session(sid)
            .and_then(|opt| opt.ok_or_else(|| "Session not found".to_string()))?
    } else {
        // Minimal ephemeral session for preview
        let now = now_millis()?;
        Session {
            id: "preview".to_string(),
            character_id: character.id.clone(),
            title: "Preview".to_string(),
            system_prompt: None,
            selected_scene_id: None,
            persona_id: None,
            advanced_model_settings: None,
            messages: vec![],
            archived: false,
            created_at: now,
            updated_at: now,
            memories: vec![
                "Memory 1 (Preview): The user prefers direct communication.".to_string(),
                "Memory 2 (Preview): We met in the tavern last night.".to_string(),
            ],
            memory_embeddings: vec![],
            memory_summary: Some("This is a placeholder for the context summary that will be generated by the AI based on your conversation history.".to_string()),
            memory_summary_token_count: 0,
            memory_tool_events: vec![],
        }
    };

    let persona = context.choose_persona(persona_id.as_deref());

    let rendered =
        prompt_engine::render_with_context(&app, &content, &character, persona, &session, settings);
    Ok(rendered)
}

#[tauri::command]
pub async fn retry_dynamic_memory(app: AppHandle, session_id: String) -> Result<(), String> {
    log_info(
        &app,
        "dynamic_memory",
        format!("retry requested for session {}", session_id),
    );
    let context = ChatContext::initialize(app.clone())?;
    let mut session = context
        .load_session(&session_id)?
        .ok_or_else(|| "Session not found".to_string())?;

    let character = context.find_character(&session.character_id)?;
    process_dynamic_memory_cycle(&app, &mut session, &context.settings, &character).await
}

async fn process_dynamic_memory_cycle(
    app: &AppHandle,
    session: &mut Session,
    settings: &Settings,
    character: &super::types::Character,
) -> Result<(), String> {
    let Some(advanced) = settings.advanced_settings.as_ref() else {
        log_info(
            app,
            "dynamic_memory",
            "advanced settings missing; skipping dynamic memory",
        );
        return Ok(());
    };
    let Some(dynamic) = advanced.dynamic_memory.as_ref() else {
        log_info(
            app,
            "dynamic_memory",
            "dynamic memory config missing; skipping",
        );
        return Ok(());
    };
    if !dynamic.enabled || !character.memory_type.eq_ignore_ascii_case("dynamic") {
        log_info(
            app,
            "dynamic_memory",
            format!(
                "dynamic memory disabled (global={}, character_type={})",
                dynamic.enabled, character.memory_type
            ),
        );
        return Ok(());
    }

    let window_size = dynamic.summary_message_interval.max(1) as usize;
    let total_convo_at_start = conversation_count(&session.messages);
    let convo_window = conversation_window(&session.messages, window_size);
    log_info(
        app,
        "dynamic_memory",
        format!(
            "snapshot taken: window_size={} total_convo_at_start={} convo_window_count={}",
            window_size,
            total_convo_at_start,
            convo_window.len()
        ),
    );
    if convo_window.is_empty() {
        log_warn(app, "dynamic_memory", "no messages in window; skipping");
        return Ok(());
    }

    let last_window_end = session
        .memory_tool_events
        .last()
        .and_then(|e| e.get("windowEnd").and_then(|v| v.as_u64()))
        .unwrap_or(0) as usize;
    log_info(
        app,
        "dynamic_memory",
        format!(
            "considering dynamic memory: total_convo_at_start={} window_size={} last_window_end={}",
            total_convo_at_start, window_size, last_window_end
        ),
    );

    if total_convo_at_start <= last_window_end {
        log_info(
            app,
            "dynamic_memory",
            "no new messages since last run; skipping",
        );
        return Ok(());
    }

    if total_convo_at_start - last_window_end < window_size {
        log_info(
            app,
            "dynamic_memory",
            format!(
                "not enough new messages since last run (needed {}, got {})",
                window_size,
                total_convo_at_start - last_window_end
            ),
        );
        return Ok(());
    }

    // Apply importance decay to all hot, unpinned memories
    let decay_rate = dynamic_decay_rate(settings);
    let cold_threshold = dynamic_cold_threshold(settings);
    let (decayed, demoted) = apply_memory_decay(app, session, decay_rate, cold_threshold);
    if decayed > 0 || demoted > 0 {
        log_info(
            app,
            "dynamic_memory",
            format!(
                "Memory decay applied: {} memories decayed, {} demoted to cold",
                decayed, demoted
            ),
        );
    }

    let summarisation_model_id = match advanced.summarisation_model_id.as_ref() {
        Some(id) => id,
        None => {
            log_warn(app, "dynamic_memory", "summarisation model not configured");
            return Err("Summarisation model not configured".to_string());
        }
    };

    let (summary_model, summary_provider) =
        find_model_and_credential(settings, summarisation_model_id).ok_or_else(|| {
            log_error(app, "dynamic_memory", "summarisation model unavailable");
            "Summarisation model unavailable".to_string()
        })?;

    let api_key = resolve_api_key(app, summary_provider, "dynamic_memory")?;
    let window_message_ids: Vec<String> = convo_window.iter().map(|m| m.id.clone()).collect();

    log_info(
        app,
        "dynamic_memory",
        format!(
            "running summarisation with model={} window_size={} total_convo_at_start={} window_ids={:?}",
            summary_model.name, window_size, total_convo_at_start, window_message_ids
        ),
    );
    let _ = app.emit(
        "dynamic-memory:processing",
        json!({ "sessionId": session.id }),
    );

    let summary = summarize_messages(
        app,
        summary_provider,
        summary_model,
        &api_key,
        &convo_window,
        session.memory_summary.as_deref(),
        character,
        session,
        settings,
        None,
    )
    .await?;

    log_info(
        app,
        "dynamic_memory",
        format!(
            "summary length={} chars; invoking memory tools",
            summary.len()
        ),
    );
    let actions = match run_memory_tool_update(
        app,
        summary_provider,
        summary_model,
        &api_key,
        session,
        settings,
        &summary,
        &convo_window,
        character,
    )
    .await
    {
        Ok(actions) => actions,
        Err(err) => {
            log_error(
                app,
                "dynamic_memory",
                format!("memory tool update failed: {}", err),
            );

            let event = json!({
                "id": Uuid::new_v4().to_string(),
                "windowStart": total_convo_at_start.saturating_sub(window_size),
                "windowEnd": total_convo_at_start,
                "windowMessageIds": window_message_ids,
                "summary": summary,
                "actions": [],
                "error": err,
                "status": "error",
                "createdAt": now_millis().unwrap_or_default(),
            });
            session.memory_summary = Some(summary.clone());
            session.memory_summary_token_count =
                crate::tokenizer::count_tokens(app, &summary).unwrap_or(0);
            session.memory_tool_events.push(event);
            if session.memory_tool_events.len() > 50 {
                let excess = session.memory_tool_events.len() - 50;
                session.memory_tool_events.drain(0..excess);
            }
            session.updated_at = now_millis()?;
            save_session(app, session)?;
            let _ = app.emit(
                "dynamic-memory:error",
                json!({ "sessionId": session.id, "error": err }),
            );
            return Ok(());
        }
    };

    session.memory_summary = Some(summary.clone());
    session.memory_summary_token_count = crate::tokenizer::count_tokens(app, &summary).unwrap_or(0);
    let event = json!({
        "id": Uuid::new_v4().to_string(),
        "windowStart": total_convo_at_start.saturating_sub(window_size),
        "windowEnd": total_convo_at_start,
        "windowMessageIds": window_message_ids,
        "summary": summary,
        "actions": actions,
        "createdAt": now_millis().unwrap_or_default(),
    });
    session.memory_tool_events.push(event);
    if session.memory_tool_events.len() > 50 {
        let excess = session.memory_tool_events.len() - 50;
        session.memory_tool_events.drain(0..excess);
    }

    session.updated_at = now_millis()?;
    save_session(app, session)?;
    let _ = app.emit("dynamic-memory:success", json!({ "sessionId": session.id }));
    log_info(
        app,
        "dynamic_memory",
        format!(
            "dynamic memory cycle complete: events={}, memories={}, windowEnd={}",
            session.memory_tool_events.len(),
            session.memories.len(),
            total_convo_at_start
        ),
    );

    Ok(())
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

async fn run_memory_tool_update(
    app: &AppHandle,
    provider_cred: &ProviderCredential,
    model: &Model,
    api_key: &str,
    session: &mut Session,
    settings: &Settings,
    summary: &str,
    convo_window: &[StoredMessage],
    character: &super::types::Character,
) -> Result<Vec<Value>, String> {
    let tool_config = build_memory_tool_config();
    let max_entries = dynamic_max_entries(settings);

    let mut messages_for_api = Vec::new();
    let system_role = super::request_builder::system_role_for(provider_cred);

    let base_template = prompts::get_template(app, APP_DYNAMIC_MEMORY_TEMPLATE_ID)
        .ok()
        .flatten()
        .map(|t| t.content)
        .unwrap_or_else(|| {
            "You maintain long-term memories for this chat. Use tools to add or delete concise factual memories. Keep the list tidy and capped at {{max_entries}} entries. Prefer deleting by ID when removing items. When finished, call the done tool.".to_string()
        });

    let current_tokens = calculate_hot_memory_tokens(session);
    let token_budget = dynamic_hot_memory_token_budget(settings);

    let rendered =
        prompt_engine::render_with_context(app, &base_template, character, None, session, settings)
            .replace("{{max_entries}}", &max_entries.to_string())
            .replace("{{current_memory_tokens}}", &current_tokens.to_string())
            .replace("{{hot_token_budget}}", &token_budget.to_string());

    crate::chat_manager::messages::push_system_message(
        &mut messages_for_api,
        &system_role,
        Some(rendered),
    );
    let memory_lines = format_memories_with_ids(session);
    messages_for_api.push(json!({
        "role": "user",
        "content": format!(
            "Conversation summary:\n{}\n\nRecent messages:\n{}\n\nCurrent memories (with IDs):\n{}",
            summary,
            convo_window.iter().map(|m| format!("{}: {}", m.role, m.content)).collect::<Vec<_>>().join("\n"),
            if memory_lines.is_empty() { "none".to_string() } else { memory_lines.join("\n") }
        )
    }));

    let built = super::request_builder::build_chat_request(
        provider_cred,
        api_key,
        &model.name,
        &messages_for_api,
        None,
        0.2,
        1.0,
        resolve_max_tokens(session, model, settings), // Dynamic max tokens
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
        return Err(if err_message == fallback {
            err_message
        } else {
            format!("{} (status {})", err_message, api_response.status)
        });
    }

    let usage = extract_usage(api_response.data());
    let context = ChatContext::initialize(app.clone())?;
    record_usage_if_available(
        &context,
        &usage,
        session,
        character,
        model,
        provider_cred,
        api_key,
        now_millis().unwrap_or_default(),
        "memory_manager",
        "run_memory_tool_update",
    )
    .await;

    let calls = parse_tool_calls(&provider_cred.provider_id, api_response.data());
    if calls.is_empty() {
        log_warn(
            app,
            "dynamic_memory",
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
                                    "dynamic_memory",
                                    format!("failed to embed memory: {}", err),
                                );
                                None
                            }
                        };
                    let token_count = crate::tokenizer::count_tokens(app, &text).unwrap_or(0);
                    // Check if memory should be pinned
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
                        created_at: now_millis().unwrap_or_default(),
                        token_count,
                        is_cold: false,
                        last_accessed_at: now_millis().unwrap_or_default(),
                        importance_score: 1.0,
                        is_pinned,
                        access_count: 0,
                        match_score: None,
                    });
                    actions_log.push(json!({
                        "name": "create_memory",
                        "arguments": call.arguments,
                        "memoryId": mem_id,
                        "timestamp": now_millis().unwrap_or_default(),
                        "updatedMemories": format_memories_with_ids(session),
                    }));
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
                            session
                                .memories
                                .iter()
                                .position(|m| m == &text)
                                .or_else(|| {
                                    session
                                        .memory_embeddings
                                        .iter()
                                        .position(|m| m.text == text)
                                })
                        };
                    if let Some(idx) = target_idx {
                        session
                            .memories
                            .remove(idx.min(session.memories.len().saturating_sub(1)));
                        if idx < session.memory_embeddings.len() {
                            session.memory_embeddings.remove(idx);
                        }
                        actions_log.push(json!({
                            "name": "delete_memory",
                            "arguments": call.arguments,
                            "timestamp": now_millis().unwrap_or_default(),
                            "updatedMemories": format_memories_with_ids(session),
                        }));
                    } else {
                        log_warn(
                            app,
                            "dynamic_memory",
                            format!("delete_memory could not find target: {}", text),
                        );
                    }
                }
            }
            "pin_memory" => {
                if let Some(raw_id) = call.arguments.get("id").and_then(|v| v.as_str()) {
                    let id = sanitize_memory_id(raw_id);
                    if let Some(mem) = session.memory_embeddings.iter_mut().find(|m| m.id == id) {
                        mem.is_pinned = true;
                        mem.importance_score = 1.0; // Reset score when pinned
                        actions_log.push(json!({
                            "name": "pin_memory",
                            "arguments": call.arguments,
                            "timestamp": now_millis().unwrap_or_default(),
                        }));
                        log_info(app, "dynamic_memory", format!("Pinned memory {}", id));
                    } else {
                        log_warn(
                            app,
                            "dynamic_memory",
                            format!("pin_memory could not find: {}", id),
                        );
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
                        log_info(app, "dynamic_memory", format!("Unpinned memory {}", id));
                    } else {
                        log_warn(
                            app,
                            "dynamic_memory",
                            format!("unpin_memory could not find: {}", id),
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

    if session.memories.len() > max_entries {
        let excess = session.memories.len() - max_entries;
        session.memories.drain(0..excess);
        if session.memory_embeddings.len() > max_entries {
            let excess_embed = session.memory_embeddings.len() - max_entries;
            session.memory_embeddings.drain(0..excess_embed);
        }
    }

    // Enforce token budget - demote oldest memories to cold storage if over budget
    let token_budget = dynamic_hot_memory_token_budget(settings);
    let demoted = enforce_hot_memory_budget(app, session, token_budget);
    if demoted > 0 {
        log_info(
            app,
            "dynamic_memory",
            format!(
                "Demoted {} memories to cold storage (budget: {} tokens)",
                demoted, token_budget
            ),
        );
    }

    session.updated_at = now_millis()?;
    save_session(app, session)?;
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

fn build_memory_tool_config() -> ToolConfig {
    ToolConfig {
        tools: vec![
            ToolDefinition {
                name: "create_memory".to_string(),
                description: Some(
                    "Create a concise memory entry capturing important facts.".to_string(),
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
                description: Some(
                    "Delete an outdated or redundant memory by matching its text.".to_string(),
                ),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "text": { "type": "string", "description": "Memory ID (preferred) or exact text to remove" }
                    },
                    "required": ["text"]
                }),
            },
            ToolDefinition {
                name: "pin_memory".to_string(),
                description: Some(
                    "Pin a critical memory so it never decays. Use for character-defining facts."
                        .to_string(),
                ),
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
            description: Some(
                "Return a concise summary of the provided conversation window.".to_string(),
            ),
            parameters: json!({
                "type": "object",
                "properties": {
                    "summary": { "type": "string", "description": "Concise summary text" }
                },
                "required": ["summary"]
            }),
        }],
        choice: Some(ToolChoice::Required),
    }
}

async fn summarize_messages(
    app: &AppHandle,
    provider_cred: &ProviderCredential,
    model: &Model,
    api_key: &str,
    convo_window: &[StoredMessage],
    prior_summary: Option<&str>,
    character: &super::types::Character,
    session: &Session,
    settings: &Settings,
    persona: Option<&super::types::Persona>,
) -> Result<String, String> {
    let mut messages_for_api = Vec::new();
    let system_role = super::request_builder::system_role_for(provider_cred);

    let summary_template = prompts::get_template(app, APP_DYNAMIC_SUMMARY_TEMPLATE_ID)
        .ok()
        .flatten()
        .map(|t| t.content)
        .unwrap_or_else(|| {
            "Summarize the recent conversation window into a concise paragraph capturing key facts and decisions. Avoid adding new information.".to_string()
        });

    let mut rendered = prompt_engine::render_with_context(
        app,
        &summary_template,
        character,
        persona,
        session,
        settings,
    );
    let prev_text = prior_summary
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("No previous summary provided.");
    rendered = rendered.replace("{{prev_summary}}", prev_text);
    crate::chat_manager::messages::push_system_message(
        &mut messages_for_api,
        &system_role,
        Some(rendered),
    );
    for msg in convo_window {
        messages_for_api.push(json!({
            "role": msg.role,
            "content": msg.content
        }));
    }

    messages_for_api.push(json!({
        "role": "user",
        "content": "Return only the concise summary for the above conversation window. Use the write_summary tool."
    }));

    let built = super::request_builder::build_chat_request(
        provider_cred,
        api_key,
        &model.name,
        &messages_for_api,
        None,
        0.2,
        1.0,
        resolve_max_tokens(session, model, settings),
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

    let usage = extract_usage(api_response.data());
    let context = ChatContext::initialize(app.clone())?;
    record_usage_if_available(
        &context,
        &usage,
        session,
        character,
        model,
        provider_cred,
        api_key,
        now_millis().unwrap_or_default(),
        "summary",
        "summarize_messages",
    )
    .await;

    if !api_response.ok {
        let fallback = format!("Provider returned status {}", api_response.status);
        let err_message = extract_error_message(api_response.data()).unwrap_or(fallback.clone());
        return Err(if err_message == fallback {
            err_message
        } else {
            format!("{} (status {})", err_message, api_response.status)
        });
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
        .ok_or_else(|| "Failed to summarize recent messages".to_string())
}

fn find_model_and_credential<'a>(
    settings: &'a Settings,
    model_id: &str,
) -> Option<(&'a Model, &'a ProviderCredential)> {
    let model = settings.models.iter().find(|m| m.id == model_id)?;
    let preferred_provider = settings.default_provider_credential_id.as_ref();
    let provider_cred = settings
        .provider_credentials
        .iter()
        .find(|cred| {
            cred.provider_id == model.provider_id
                && preferred_provider.map(|id| id == &cred.id).unwrap_or(false)
        })
        .or_else(|| {
            settings
                .provider_credentials
                .iter()
                .find(|cred| cred.provider_id == model.provider_id)
        })?;
    Some((model, provider_cred))
}

#[tauri::command]
pub async fn chat_add_message_attachment(
    app: AppHandle,
    args: ChatAddMessageAttachmentArgs,
) -> Result<StoredMessage, String> {
    let ChatAddMessageAttachmentArgs {
        session_id,
        character_id,
        message_id,
        role,
        attachment_id,
        base64_data,
        mime_type,
        filename,
        width,
        height,
    } = args;

    if base64_data.trim().is_empty() {
        return Err("base64Data cannot be empty".to_string());
    }

    let mut session = super::storage::load_session(&app, &session_id)?
        .ok_or_else(|| "Session not found".to_string())?;

    let target_index = session
        .messages
        .iter()
        .position(|m| m.id == message_id)
        .ok_or_else(|| "Message not found in loaded session window".to_string())?;

    let storage_path = crate::storage_manager::media::storage_save_session_attachment(
        app.clone(),
        character_id,
        session_id.clone(),
        message_id.clone(),
        attachment_id.clone(),
        role,
        base64_data,
    )?;

    let new_attachment = super::types::ImageAttachment {
        id: attachment_id,
        data: String::new(),
        mime_type,
        filename,
        width,
        height,
        storage_path: Some(storage_path),
    };

    let updated_message = {
        let target = &mut session.messages[target_index];
        if let Some(existing) = target
            .attachments
            .iter_mut()
            .find(|att| att.id == new_attachment.id)
        {
            *existing = new_attachment;
        } else {
            target.attachments.push(new_attachment);
        }
        target.clone()
    };

    session.updated_at = now_millis()?;

    // Persist meta + the updated message (even if it's not the last message).
    let mut meta = session.clone();
    meta.messages = Vec::new();
    let meta_json = serde_json::to_string(&meta).map_err(|e| e.to_string())?;
    session_upsert_meta(app.clone(), meta_json)?;

    let payload =
        serde_json::to_string(&vec![updated_message.clone()]).map_err(|e| e.to_string())?;
    messages_upsert_batch(app.clone(), session_id, payload)?;

    Ok(updated_message)
}

#[tauri::command]
pub async fn search_messages(
    app: AppHandle,
    session_id: String,
    query: String,
) -> Result<Vec<super::types::MessageSearchResult>, String> {
    let context = ChatContext::initialize(app.clone())?;

    let session = match context.load_session(&session_id)? {
        Some(s) => s,
        None => return Err("Session not found".to_string()),
    };

    let query_lower = query.to_lowercase();
    let results: Vec<super::types::MessageSearchResult> = session
        .messages
        .iter()
        .filter(|msg| {
            msg.content.to_lowercase().contains(&query_lower)
                && (msg.role == "user" || msg.role == "assistant")
        })
        .map(|msg| super::types::MessageSearchResult {
            message_id: msg.id.clone(),
            content: msg.content.clone(),
            created_at: msg.created_at,
            role: msg.role.clone(),
        })
        .collect();

    Ok(results)
}
