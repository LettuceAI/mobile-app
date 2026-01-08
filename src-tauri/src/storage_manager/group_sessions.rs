use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use super::db::{now_ms, SwappablePool};

// ============================================================================
// Internal Functions (for use by group_chat_manager)
// ============================================================================

/// Internal function to get a group session without Tauri State
pub fn group_session_get_internal(conn: &Connection, id: &str) -> Result<String, String> {
    match read_group_session(conn, id)? {
        Some(session) => serde_json::to_string(&session).map_err(|e| e.to_string()),
        None => Err("Session not found".to_string()),
    }
}

/// Internal function to get participation stats without Tauri State
pub fn group_participation_stats_internal(
    conn: &Connection,
    session_id: &str,
) -> Result<String, String> {
    let stats = read_group_participation(conn, session_id)?;
    serde_json::to_string(&stats).map_err(|e| e.to_string())
}

/// Internal function to list messages without Tauri State
pub fn group_messages_list_internal(
    conn: &Connection,
    session_id: &str,
    limit: i32,
    before_created_at: Option<i64>,
    before_id: Option<&str>,
) -> Result<String, String> {
    let messages = read_group_messages(conn, session_id, limit, before_created_at, before_id)?;
    serde_json::to_string(&messages).map_err(|e| e.to_string())
}

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupSession {
    pub id: String,
    pub name: String,
    pub character_ids: Vec<String>,
    pub persona_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    /// Whether this session is archived
    #[serde(default)]
    pub archived: bool,
    /// Chat type: "conversation" or "roleplay"
    #[serde(default = "default_chat_type")]
    pub chat_type: String,
    /// Starting scene for roleplay chats (JSON-encoded scene data)
    #[serde(default)]
    pub starting_scene: Option<serde_json::Value>,
    /// Background image path for the group chat
    #[serde(default)]
    pub background_image_path: Option<String>,
    /// Manual memories (simple text entries)
    #[serde(default)]
    pub memories: Vec<String>,
    /// Dynamic memory embeddings with semantic search support
    #[serde(default)]
    pub memory_embeddings: Vec<MemoryEmbedding>,
    /// Summary of memories for context compression
    #[serde(default)]
    pub memory_summary: String,
    /// Token count of the memory summary
    #[serde(default)]
    pub memory_summary_token_count: i32,
    /// Memory tool events tracking (for dynamic memory cycle gating)
    #[serde(default)]
    pub memory_tool_events: Vec<serde_json::Value>,
}

fn default_chat_type() -> String {
    "conversation".to_string()
}

/// Memory embedding for semantic search in group sessions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEmbedding {
    pub id: String,
    pub text: String,
    pub embedding: Vec<f32>,
    pub created_at: i64,
    #[serde(default)]
    pub token_count: i32,
    #[serde(default)]
    pub is_cold: bool,
    #[serde(default = "default_importance")]
    pub importance_score: f32,
    #[serde(default)]
    pub last_accessed_at: i64,
    #[serde(default)]
    pub access_count: i32,
    #[serde(default)]
    pub is_pinned: bool,
}

fn default_importance() -> f32 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupParticipation {
    pub id: String,
    pub session_id: String,
    pub character_id: String,
    pub speak_count: i32,
    pub last_spoke_turn: Option<i32>,
    pub last_spoke_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub speaker_character_id: Option<String>,
    pub turn_number: i32,
    pub created_at: i64,
    pub usage: Option<UsageSummary>,
    pub variants: Option<Vec<GroupMessageVariant>>,
    pub selected_variant_id: Option<String>,
    pub is_pinned: bool,
    pub attachments: Vec<serde_json::Value>,
    pub reasoning: Option<String>,
    pub selection_reasoning: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMessageVariant {
    pub id: String,
    pub content: String,
    pub speaker_character_id: Option<String>,
    pub created_at: i64,
    pub usage: Option<UsageSummary>,
    pub reasoning: Option<String>,
    pub selection_reasoning: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub prompt_tokens: Option<i32>,
    pub completion_tokens: Option<i32>,
    pub total_tokens: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupSessionPreview {
    pub id: String,
    pub name: String,
    pub character_ids: Vec<String>,
    pub updated_at: i64,
    pub last_message: Option<String>,
    pub message_count: i32,
    pub archived: bool,
    pub chat_type: String,
}

// ============================================================================
// Internal DB Functions
// ============================================================================

fn read_group_session(conn: &Connection, id: &str) -> Result<Option<GroupSession>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, character_ids, persona_id, created_at, updated_at,
                    memories, memory_embeddings, memory_summary, memory_summary_token_count, archived, memory_tool_events,
                    chat_type, starting_scene, background_image_path
             FROM group_sessions WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query(params![id]).map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let character_ids_json: String = row.get(2).map_err(|e| e.to_string())?;
        let character_ids: Vec<String> =
            serde_json::from_str(&character_ids_json).unwrap_or_default();

        let memories_json: String = row
            .get::<_, Option<String>>(6)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "[]".to_string());
        let memories: Vec<String> = serde_json::from_str(&memories_json).unwrap_or_default();

        let memory_embeddings_json: String = row
            .get::<_, Option<String>>(7)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "[]".to_string());
        let memory_embeddings: Vec<MemoryEmbedding> =
            serde_json::from_str(&memory_embeddings_json).unwrap_or_default();

        let memory_summary: String = row
            .get::<_, Option<String>>(8)
            .map_err(|e| e.to_string())?
            .unwrap_or_default();
        let memory_summary_token_count: i32 = row
            .get::<_, Option<i32>>(9)
            .map_err(|e| e.to_string())?
            .unwrap_or(0);

        let archived: bool = row
            .get::<_, Option<i32>>(10)
            .map_err(|e| e.to_string())?
            .map(|v| v != 0)
            .unwrap_or(false);

        let memory_tool_events_json: String = row
            .get::<_, Option<String>>(11)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "[]".to_string());
        let memory_tool_events: Vec<serde_json::Value> =
            serde_json::from_str(&memory_tool_events_json).unwrap_or_default();

        let chat_type: String = row
            .get::<_, Option<String>>(12)
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "conversation".to_string());

        let starting_scene_json: Option<String> = row.get(13).map_err(|e| e.to_string())?;
        let starting_scene: Option<serde_json::Value> =
            starting_scene_json.and_then(|s| serde_json::from_str(&s).ok());

        let background_image_path: Option<String> = row.get(14).map_err(|e| e.to_string())?;

        Ok(Some(GroupSession {
            id: row.get(0).map_err(|e| e.to_string())?,
            name: row.get(1).map_err(|e| e.to_string())?,
            character_ids,
            persona_id: row.get(3).map_err(|e| e.to_string())?,
            created_at: row.get(4).map_err(|e| e.to_string())?,
            updated_at: row.get(5).map_err(|e| e.to_string())?,
            archived,
            chat_type,
            starting_scene,
            background_image_path,
            memories,
            memory_embeddings,
            memory_summary,
            memory_summary_token_count,
            memory_tool_events,
        }))
    } else {
        Ok(None)
    }
}

fn read_group_participation(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<GroupParticipation>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, character_id, speak_count, last_spoke_turn, last_spoke_at
             FROM group_participation WHERE session_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query(params![session_id]).map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        result.push(GroupParticipation {
            id: row.get(0).map_err(|e| e.to_string())?,
            session_id: row.get(1).map_err(|e| e.to_string())?,
            character_id: row.get(2).map_err(|e| e.to_string())?,
            speak_count: row.get(3).map_err(|e| e.to_string())?,
            last_spoke_turn: row.get(4).map_err(|e| e.to_string())?,
            last_spoke_at: row.get(5).map_err(|e| e.to_string())?,
        });
    }

    Ok(result)
}

fn ensure_participation_records(
    conn: &Connection,
    session_id: &str,
    character_ids: &[String],
) -> Result<(), String> {
    for character_id in character_ids {
        // Check if record exists
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM group_participation WHERE session_id = ?1 AND character_id = ?2",
                params![session_id, character_id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if !exists {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO group_participation (id, session_id, character_id, speak_count, last_spoke_turn, last_spoke_at)
                 VALUES (?1, ?2, ?3, 0, NULL, NULL)",
                params![id, session_id, character_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn read_group_messages(
    conn: &Connection,
    session_id: &str,
    limit: i32,
    before_created_at: Option<i64>,
    before_id: Option<&str>,
) -> Result<Vec<GroupMessage>, String> {
    let mut messages = Vec::new();

    let (sql, params_vec): (String, Vec<Box<dyn rusqlite::ToSql>>) = match (
        before_created_at,
        before_id,
    ) {
        (Some(ts), Some(bid)) => (
            "SELECT id, session_id, role, content, speaker_character_id, turn_number, created_at,
                    prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned,
                    attachments, reasoning, selection_reasoning, model_id
             FROM group_messages
             WHERE session_id = ?1 AND (created_at < ?2 OR (created_at = ?2 AND id < ?3))
             ORDER BY created_at DESC, id DESC
             LIMIT ?4"
                .to_string(),
            vec![
                Box::new(session_id.to_string()),
                Box::new(ts),
                Box::new(bid.to_string()),
                Box::new(limit),
            ],
        ),
        _ => (
            "SELECT id, session_id, role, content, speaker_character_id, turn_number, created_at,
                    prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned,
                    attachments, reasoning, selection_reasoning, model_id
             FROM group_messages
             WHERE session_id = ?1
             ORDER BY created_at DESC, id DESC
             LIMIT ?2"
                .to_string(),
            vec![Box::new(session_id.to_string()), Box::new(limit)],
        ),
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut rows = stmt
        .query(params_refs.as_slice())
        .map_err(|e| e.to_string())?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let message_id: String = row.get(0).map_err(|e| e.to_string())?;
        let message_id_for_log = message_id.clone();
        let attachments_json: String = row.get(12).map_err(|e| e.to_string())?;
        let attachments: Vec<serde_json::Value> =
            serde_json::from_str(&attachments_json).unwrap_or_default();

        let prompt_tokens: Option<i32> = row.get(7).ok();
        let completion_tokens: Option<i32> = row.get(8).ok();
        let total_tokens: Option<i32> = row.get(9).ok();

        let usage =
            if prompt_tokens.is_some() || completion_tokens.is_some() || total_tokens.is_some() {
                Some(UsageSummary {
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                })
            } else {
                None
            };

        // Load variants
        let variants = load_group_message_variants(conn, &message_id)?;

        messages.push(GroupMessage {
            id: message_id,
            session_id: row.get(1).map_err(|e| e.to_string())?,
            role: row.get(2).map_err(|e| e.to_string())?,
            content: row.get(3).map_err(|e| e.to_string())?,
            speaker_character_id: row.get(4).map_err(|e| e.to_string())?,
            turn_number: row.get(5).map_err(|e| e.to_string())?,
            created_at: row.get(6).map_err(|e| e.to_string())?,
            usage,
            variants: if variants.is_empty() {
                None
            } else {
                Some(variants)
            },
            selected_variant_id: row.get(10).map_err(|e| e.to_string())?,
            is_pinned: row.get::<_, i32>(11).map_err(|e| e.to_string())? != 0,
            attachments,
            reasoning: row.get(13).map_err(|e| e.to_string())?,
            selection_reasoning: row.get(14).map_err(|e| e.to_string())?,
            model_id: {
                let model_id_value: Option<String> = row.get(15).map_err(|e| e.to_string())?;
                eprintln!(
                    "🔍 Read message {} from DB with model_id: {:?}",
                    message_id_for_log, model_id_value
                );
                model_id_value
            },
        });
    }

    // Reverse to get chronological order
    messages.reverse();
    eprintln!(
        "🔍 Returning {} messages, last message model_id: {:?}",
        messages.len(),
        messages.last().and_then(|m| m.model_id.as_ref())
    );
    Ok(messages)
}

fn load_group_message_variants(
    conn: &Connection,
    message_id: &str,
) -> Result<Vec<GroupMessageVariant>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, content, speaker_character_id, created_at, prompt_tokens, completion_tokens, total_tokens, reasoning, selection_reasoning, model_id
             FROM group_message_variants
             WHERE message_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query(params![message_id]).map_err(|e| e.to_string())?;
    let mut variants = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let prompt_tokens: Option<i32> = row.get(4).ok();
        let completion_tokens: Option<i32> = row.get(5).ok();
        let total_tokens: Option<i32> = row.get(6).ok();

        let usage =
            if prompt_tokens.is_some() || completion_tokens.is_some() || total_tokens.is_some() {
                Some(UsageSummary {
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                })
            } else {
                None
            };

        variants.push(GroupMessageVariant {
            id: row.get(0).map_err(|e| e.to_string())?,
            content: row.get(1).map_err(|e| e.to_string())?,
            speaker_character_id: row.get(2).map_err(|e| e.to_string())?,
            created_at: row.get(3).map_err(|e| e.to_string())?,
            usage,
            reasoning: row.get(7).map_err(|e| e.to_string())?,
            selection_reasoning: row.get(8).map_err(|e| e.to_string())?,
            model_id: row.get(9).map_err(|e| e.to_string())?,
        });
    }

    Ok(variants)
}

fn get_next_turn_number(conn: &Connection, session_id: &str) -> Result<i32, String> {
    let max_turn: Option<i32> = conn
        .query_row(
            "SELECT MAX(turn_number) FROM group_messages WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(max_turn.unwrap_or(0) + 1)
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub fn group_sessions_list(pool: State<'_, SwappablePool>) -> Result<String, String> {
    let conn = pool.get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT gs.id, gs.name, gs.character_ids, gs.updated_at,
                    (SELECT content FROM group_messages WHERE session_id = gs.id ORDER BY created_at DESC LIMIT 1) as last_message,
                    (SELECT COUNT(*) FROM group_messages WHERE session_id = gs.id) as message_count,
                    COALESCE(gs.archived, 0) as archived,
                    COALESCE(gs.chat_type, 'conversation') as chat_type
             FROM group_sessions gs
             WHERE COALESCE(gs.archived, 0) = 0
             ORDER BY gs.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut sessions = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let character_ids_json: String = row.get(2).map_err(|e| e.to_string())?;
        let character_ids: Vec<String> =
            serde_json::from_str(&character_ids_json).unwrap_or_default();

        sessions.push(GroupSessionPreview {
            id: row.get(0).map_err(|e| e.to_string())?,
            name: row.get(1).map_err(|e| e.to_string())?,
            character_ids,
            updated_at: row.get(3).map_err(|e| e.to_string())?,
            last_message: row.get(4).map_err(|e| e.to_string())?,
            message_count: row.get(5).map_err(|e| e.to_string())?,
            archived: row.get::<_, i32>(6).map_err(|e| e.to_string())? != 0,
            chat_type: row.get(7).map_err(|e| e.to_string())?,
        });
    }

    serde_json::to_string(&sessions).map_err(|e| e.to_string())
}

/// List all group sessions including archived ones (for history view)
#[tauri::command]
pub fn group_sessions_list_all(pool: State<'_, SwappablePool>) -> Result<String, String> {
    let conn = pool.get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT gs.id, gs.name, gs.character_ids, gs.updated_at,
                    (SELECT content FROM group_messages WHERE session_id = gs.id ORDER BY created_at DESC LIMIT 1) as last_message,
                    (SELECT COUNT(*) FROM group_messages WHERE session_id = gs.id) as message_count,
                    COALESCE(gs.archived, 0) as archived,
                    COALESCE(gs.chat_type, 'conversation') as chat_type
             FROM group_sessions gs
             ORDER BY gs.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut sessions = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let character_ids_json: String = row.get(2).map_err(|e| e.to_string())?;
        let character_ids: Vec<String> =
            serde_json::from_str(&character_ids_json).unwrap_or_default();

        sessions.push(GroupSessionPreview {
            id: row.get(0).map_err(|e| e.to_string())?,
            name: row.get(1).map_err(|e| e.to_string())?,
            character_ids,
            updated_at: row.get(3).map_err(|e| e.to_string())?,
            last_message: row.get(4).map_err(|e| e.to_string())?,
            message_count: row.get(5).map_err(|e| e.to_string())?,
            archived: row.get::<_, i32>(6).map_err(|e| e.to_string())? != 0,
            chat_type: row.get(7).map_err(|e| e.to_string())?,
        });
    }

    serde_json::to_string(&sessions).map_err(|e| e.to_string())
}

/// Archive a group session
#[tauri::command]
pub fn group_session_archive(
    id: String,
    archived: bool,
    pool: State<'_, SwappablePool>,
) -> Result<(), String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET archived = ?1, updated_at = ?2 WHERE id = ?3",
        params![archived, now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Update the title/name of a group session
#[tauri::command]
pub fn group_session_update_title(
    id: String,
    title: String,
    pool: State<'_, SwappablePool>,
) -> Result<(), String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Duplicate a group session (create a new session with the same characters and persona)
#[tauri::command]
pub fn group_session_duplicate(
    source_id: String,
    new_name: Option<String>,
    pool: State<'_, SwappablePool>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let conn = pool.get_connection()?;

    // Read the source session
    let source = read_group_session(&conn, &source_id)?
        .ok_or_else(|| "Source session not found".to_string())?;

    let now = now_ms();
    let new_id = Uuid::new_v4().to_string();
    let name = new_name.unwrap_or_else(|| format!("{} (copy)", source.name));
    let character_ids_json =
        serde_json::to_string(&source.character_ids).map_err(|e| e.to_string())?;

    // Use source persona_id, or fallback to default persona if source had none
    let final_persona_id = if source.persona_id.is_none() {
        // Try to get default persona
        match super::personas::persona_default_get(app) {
            Ok(Some(default_persona_json)) => {
                let default_persona: serde_json::Value =
                    serde_json::from_str(&default_persona_json).unwrap_or(serde_json::json!({}));
                default_persona
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            }
            _ => None,
        }
    } else {
        source.persona_id
    };

    // Get chat_type and starting_scene from original session
    let chat_type: String = conn
        .query_row(
            "SELECT chat_type FROM group_sessions WHERE id = ?1",
            params![source_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "conversation".to_string());

    let starting_scene_json: Option<String> = conn
        .query_row(
            "SELECT starting_scene FROM group_sessions WHERE id = ?1",
            params![source_id],
            |row| row.get(0),
        )
        .ok();

    conn.execute(
        "INSERT INTO group_sessions (id, name, character_ids, persona_id, created_at, updated_at, archived, chat_type, starting_scene, background_image_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0, ?6, ?7, ?8)",
        params![
            new_id,
            name,
            character_ids_json,
            final_persona_id,
            now,
            chat_type,
            starting_scene_json,
            source.background_image_path
        ],
    )
    .map_err(|e| e.to_string())?;

    // Create participation records for each character
    ensure_participation_records(&conn, &new_id, &source.character_ids)?;

    // Return the new session
    let new_session = read_group_session(&conn, &new_id)?
        .ok_or_else(|| "Failed to read newly created session".to_string())?;

    serde_json::to_string(&new_session).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn group_session_duplicate_with_messages(
    source_id: String,
    new_name: Option<String>,
    include_messages: bool,
    pool: State<'_, SwappablePool>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let conn = pool.get_connection()?;

    // Read the source session
    let source = read_group_session(&conn, &source_id)?
        .ok_or_else(|| "Source session not found".to_string())?;

    let now = now_ms();
    let new_id = Uuid::new_v4().to_string();
    let name = new_name.unwrap_or_else(|| format!("{} (copy)", source.name));
    let character_ids_json =
        serde_json::to_string(&source.character_ids).map_err(|e| e.to_string())?;

    // Use source persona_id, or fallback to default persona if source had none
    let final_persona_id = if source.persona_id.is_none() {
        // Try to get default persona
        match super::personas::persona_default_get(app) {
            Ok(Some(default_persona_json)) => {
                let default_persona: serde_json::Value =
                    serde_json::from_str(&default_persona_json).unwrap_or(serde_json::json!({}));
                default_persona
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            }
            _ => None,
        }
    } else {
        source.persona_id
    };

    // Get chat_type and starting_scene from original session
    let chat_type: String = conn
        .query_row(
            "SELECT chat_type FROM group_sessions WHERE id = ?1",
            params![source_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "conversation".to_string());

    let starting_scene_json: Option<String> = conn
        .query_row(
            "SELECT starting_scene FROM group_sessions WHERE id = ?1",
            params![source_id],
            |row| row.get(0),
        )
        .ok();

    // Get memories if including messages
    let (
        memories_json,
        memory_embeddings_json,
        memory_summary,
        memory_summary_token_count,
        memory_tool_events_json,
    ) = if include_messages {
        let memories: Option<String> = conn
            .query_row(
                "SELECT memories FROM group_sessions WHERE id = ?1",
                params![source_id],
                |row| row.get(0),
            )
            .ok();

        let memory_embeddings: Option<String> = conn
            .query_row(
                "SELECT memory_embeddings FROM group_sessions WHERE id = ?1",
                params![source_id],
                |row| row.get(0),
            )
            .ok();

        let memory_summary: String = conn
            .query_row(
                "SELECT COALESCE(memory_summary, '') FROM group_sessions WHERE id = ?1",
                params![source_id],
                |row| row.get(0),
            )
            .unwrap_or_default();

        let memory_summary_token_count: i64 = conn
            .query_row(
                "SELECT COALESCE(memory_summary_token_count, 0) FROM group_sessions WHERE id = ?1",
                params![source_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let memory_tool_events: Option<String> = conn
            .query_row(
                "SELECT memory_tool_events FROM group_sessions WHERE id = ?1",
                params![source_id],
                |row| row.get(0),
            )
            .ok();

        (
            memories,
            memory_embeddings,
            memory_summary,
            memory_summary_token_count,
            memory_tool_events,
        )
    } else {
        (
            Some("[]".to_string()),
            Some("[]".to_string()),
            String::new(),
            0,
            Some("[]".to_string()),
        )
    };

    // Try to insert with background_image_path, fall back if column doesn't exist
    let insert_result = conn.execute(
        "INSERT INTO group_sessions (id, name, character_ids, persona_id, created_at, updated_at, archived, chat_type, starting_scene, background_image_path, memories, memory_embeddings, memory_summary, memory_summary_token_count, memory_tool_events)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            new_id,
            name,
            character_ids_json,
            final_persona_id,
            now,
            chat_type,
            starting_scene_json,
            source.background_image_path,
            memories_json,
            memory_embeddings_json,
            memory_summary,
            memory_summary_token_count,
            memory_tool_events_json
        ],
    );

    if insert_result.is_err() {
        // Fallback without background_image_path if column doesn't exist
        conn.execute(
            "INSERT INTO group_sessions (id, name, character_ids, persona_id, created_at, updated_at, archived, chat_type, starting_scene, memories, memory_embeddings, memory_summary, memory_summary_token_count, memory_tool_events)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                new_id,
                name,
                character_ids_json,
                final_persona_id,
                now,
                chat_type,
                starting_scene_json,
                memories_json,
                memory_embeddings_json,
                memory_summary,
                memory_summary_token_count,
                memory_tool_events_json
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Create participation records for each character
    ensure_participation_records(&conn, &new_id, &source.character_ids)?;

    // Copy messages if requested
    if include_messages {
        // Get all messages from source session
        let mut stmt = conn
            .prepare(
                "SELECT id, role, content, speaker_character_id, turn_number, created_at, is_pinned, attachments
                 FROM group_messages
                 WHERE session_id = ?1
                 ORDER BY turn_number, created_at",
            )
            .map_err(|e| e.to_string())?;

        let messages: Vec<(
            String,
            String,
            String,
            Option<String>,
            i64,
            i64,
            i64,
            String,
        )> = stmt
            .query_map(params![source_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // Insert copied messages
        for (
            _old_id,
            role,
            content,
            speaker_character_id,
            turn_number,
            created_at,
            is_pinned,
            attachments,
        ) in messages
        {
            let new_message_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO group_messages (id, session_id, role, content, speaker_character_id, turn_number, created_at, is_pinned, attachments)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    new_message_id,
                    new_id,
                    role,
                    content,
                    speaker_character_id,
                    turn_number,
                    created_at,
                    is_pinned,
                    attachments
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Return the new session
    let new_session = read_group_session(&conn, &new_id)?
        .ok_or_else(|| "Failed to read newly created session".to_string())?;

    serde_json::to_string(&new_session).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn group_session_branch_to_character(
    source_id: String,
    character_id: String,
    new_name: Option<String>,
    pool: State<'_, SwappablePool>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let conn = pool.get_connection()?;

    // Read the source session
    let source = read_group_session(&conn, &source_id)?
        .ok_or_else(|| "Source session not found".to_string())?;

    // Verify character exists in the group
    if !source.character_ids.contains(&character_id) {
        return Err("Character not found in group session".to_string());
    }

    // Get character info to build name and for placeholder replacement
    let character_name: String = conn
        .query_row(
            "SELECT name FROM characters WHERE id = ?1",
            params![character_id],
            |row| row.get(0),
        )
        .map_err(|_| "Character not found".to_string())?;

    // Get all character names for placeholder replacement
    let mut character_names = std::collections::HashMap::new();
    for char_id in &source.character_ids {
        if let Ok(name) = conn.query_row(
            "SELECT name FROM characters WHERE id = ?1",
            params![char_id],
            |row| row.get::<_, String>(0),
        ) {
            character_names.insert(char_id.clone(), name);
        }
    }

    let now = now_ms();
    let new_session_id = Uuid::new_v4().to_string();
    let name = new_name.unwrap_or_else(|| format!("{} - {}", source.name, character_name));

    // Create new single-character session
    conn.execute(
        "INSERT INTO sessions (id, character_id, persona_id, title, created_at, updated_at, archived)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0)",
        params![
            new_session_id,
            character_id,
            source.persona_id,
            name,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    // Get messages from group session and convert to single-character messages
    let mut stmt = conn
        .prepare(
            "SELECT role, content, speaker_character_id, turn_number, created_at, is_pinned
             FROM group_messages
             WHERE session_id = ?1
             ORDER BY turn_number, created_at",
        )
        .map_err(|e| e.to_string())?;

    let messages: Vec<(String, String, Option<String>, i64, i64, i64)> = stmt
        .query_map(params![source_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Convert and insert messages - convert ALL messages to the chosen character
    for (role, content, _speaker_character_id, _turn_number, created_at, is_pinned) in messages {
        let new_message_id = Uuid::new_v4().to_string();

        // Convert all assistant messages (from any character) to messages from the chosen character
        let new_role = if role == "assistant" {
            "assistant"
        } else {
            role.as_str()
        };

        // Replace character name placeholders in content
        let mut processed_content = content.clone();
        for (char_id, char_name) in &character_names {
            // Replace {{@"CharacterName"}} with the chosen character's name
            let placeholder = format!("{{{{@\"{}\"}}+}}", char_name);
            processed_content = processed_content.replace(&placeholder, &character_name);

            // Also handle the format without the +
            let placeholder_alt = format!("{{{{@\"{}\"}}}}", char_name);
            processed_content = processed_content.replace(&placeholder_alt, &character_name);
        }

        conn.execute(
            "INSERT INTO messages (id, session_id, role, content, created_at, is_pinned, attachments)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, '[]')",
            params![
                new_message_id,
                new_session_id,
                new_role,
                processed_content,
                created_at,
                is_pinned
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Build response with the new session
    let session_json = super::sessions::session_get(app, new_session_id)?
        .ok_or_else(|| "Failed to read newly created session".to_string())?;

    Ok(session_json)
}

#[tauri::command]
pub fn group_session_create(
    name: String,
    character_ids_json: String,
    persona_id: Option<String>,
    chat_type: Option<String>,
    starting_scene_json: Option<String>,
    background_image_path: Option<String>,
    app: tauri::AppHandle,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let now = now_ms();
    let id = Uuid::new_v4().to_string();

    let character_ids: Vec<String> =
        serde_json::from_str(&character_ids_json).map_err(|e| e.to_string())?;

    // Use provided persona_id, or fallback to default persona
    let final_persona_id = if persona_id.is_none() {
        // Try to get default persona
        match super::personas::persona_default_get(app) {
            Ok(Some(default_persona_json)) => {
                let default_persona: serde_json::Value =
                    serde_json::from_str(&default_persona_json).unwrap_or(serde_json::json!({}));
                default_persona
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            }
            _ => None,
        }
    } else {
        persona_id
    };

    let chat_type_value = chat_type.unwrap_or_else(|| "conversation".to_string());
    let starting_scene_parsed: Option<serde_json::Value> = starting_scene_json
        .as_ref()
        .and_then(|s| serde_json::from_str(s).ok());

    conn.execute(
        "INSERT INTO group_sessions (id, name, character_ids, persona_id, created_at, updated_at, archived, chat_type, starting_scene, background_image_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0, ?6, ?7, ?8)",
        params![
            id,
            name,
            character_ids_json,
            final_persona_id,
            now,
            chat_type_value,
            starting_scene_json.as_deref(),
            background_image_path
        ],
    )
    .map_err(|e| e.to_string())?;

    // Create participation records for each character
    ensure_participation_records(&conn, &id, &character_ids)?;

    // Insert starting scene message for roleplay type
    if chat_type_value == "roleplay" {
        if let Some(ref scene_value) = starting_scene_parsed {
            if let Some(content) = scene_value.get("content").and_then(|v| v.as_str()) {
                if !content.trim().is_empty() {
                    let scene_message_id = Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO group_messages (id, session_id, role, content, speaker_character_id, turn_number, created_at, is_pinned, attachments)
                         VALUES (?1, ?2, 'scene', ?3, NULL, 0, ?4, 0, '[]')",
                        params![scene_message_id, id, content, now],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
    }

    let session = GroupSession {
        id: id.clone(),
        name,
        character_ids,
        persona_id: final_persona_id,
        created_at: now as i64,
        updated_at: now as i64,
        archived: false,
        chat_type: chat_type_value,
        starting_scene: starting_scene_parsed,
        background_image_path,
        memories: Vec::new(),
        memory_embeddings: Vec::new(),
        memory_summary: String::new(),
        memory_summary_token_count: 0,
        memory_tool_events: Vec::new(),
    };

    serde_json::to_string(&session).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn group_session_get(id: String, pool: State<'_, SwappablePool>) -> Result<String, String> {
    let conn = pool.get_connection()?;

    match read_group_session(&conn, &id)? {
        Some(session) => serde_json::to_string(&session).map_err(|e| e.to_string()),
        None => Ok("null".to_string()),
    }
}

#[tauri::command]
pub fn group_session_update(
    id: String,
    name: String,
    character_ids_json: String,
    persona_id: Option<String>,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    let character_ids: Vec<String> =
        serde_json::from_str(&character_ids_json).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE group_sessions SET name = ?1, character_ids = ?2, persona_id = ?3, updated_at = ?4 WHERE id = ?5",
        params![name, character_ids_json, persona_id, now, id],
    )
    .map_err(|e| e.to_string())?;

    // Ensure participation records exist for any new characters
    ensure_participation_records(&conn, &id, &character_ids)?;

    match read_group_session(&conn, &id)? {
        Some(session) => serde_json::to_string(&session).map_err(|e| e.to_string()),
        None => Err("Session not found".to_string()),
    }
}

#[tauri::command]
pub fn group_session_delete(id: String, pool: State<'_, SwappablePool>) -> Result<(), String> {
    let conn = pool.get_connection()?;

    // Cascading deletes will handle messages and participation
    conn.execute("DELETE FROM group_sessions WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn group_session_add_character(
    session_id: String,
    character_id: String,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    // Get current character_ids
    let session =
        read_group_session(&conn, &session_id)?.ok_or_else(|| "Session not found".to_string())?;

    let mut character_ids = session.character_ids;
    if !character_ids.contains(&character_id) {
        character_ids.push(character_id.clone());
    }

    let character_ids_json = serde_json::to_string(&character_ids).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE group_sessions SET character_ids = ?1, updated_at = ?2 WHERE id = ?3",
        params![character_ids_json, now, session_id],
    )
    .map_err(|e| e.to_string())?;

    // Ensure participation record exists
    ensure_participation_records(&conn, &session_id, &[character_id])?;

    match read_group_session(&conn, &session_id)? {
        Some(session) => serde_json::to_string(&session).map_err(|e| e.to_string()),
        None => Err("Session not found".to_string()),
    }
}

#[tauri::command]
pub fn group_session_remove_character(
    session_id: String,
    character_id: String,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    // Get current character_ids
    let session =
        read_group_session(&conn, &session_id)?.ok_or_else(|| "Session not found".to_string())?;

    let character_ids: Vec<String> = session
        .character_ids
        .into_iter()
        .filter(|id| id != &character_id)
        .collect();

    let character_ids_json = serde_json::to_string(&character_ids).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE group_sessions SET character_ids = ?1, updated_at = ?2 WHERE id = ?3",
        params![character_ids_json, now, session_id],
    )
    .map_err(|e| e.to_string())?;

    // Remove participation record
    conn.execute(
        "DELETE FROM group_participation WHERE session_id = ?1 AND character_id = ?2",
        params![session_id, character_id],
    )
    .map_err(|e| e.to_string())?;

    match read_group_session(&conn, &session_id)? {
        Some(session) => serde_json::to_string(&session).map_err(|e| e.to_string()),
        None => Err("Session not found".to_string()),
    }
}

#[tauri::command]
pub fn group_session_update_starting_scene(
    session_id: String,
    starting_scene_json: Option<String>,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET starting_scene = ?1, updated_at = ?2 WHERE id = ?3",
        params![starting_scene_json, now, session_id],
    )
    .map_err(|e| e.to_string())?;

    match read_group_session(&conn, &session_id)? {
        Some(session) => serde_json::to_string(&session).map_err(|e| e.to_string()),
        None => Err("Session not found".to_string()),
    }
}

#[tauri::command]
pub fn group_session_update_background_image(
    session_id: String,
    background_image_path: Option<String>,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET background_image_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![background_image_path, now, session_id],
    )
    .map_err(|e| e.to_string())?;

    match read_group_session(&conn, &session_id)? {
        Some(session) => serde_json::to_string(&session).map_err(|e| e.to_string()),
        None => Err("Session not found".to_string()),
    }
}

#[tauri::command]
pub fn group_session_update_chat_type(
    session_id: String,
    chat_type: String,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    // Validate chat_type
    if chat_type != "conversation" && chat_type != "roleplay" {
        return Err("Invalid chat_type. Must be 'conversation' or 'roleplay'".to_string());
    }

    conn.execute(
        "UPDATE group_sessions SET chat_type = ?1, updated_at = ?2 WHERE id = ?3",
        params![chat_type, now, session_id],
    )
    .map_err(|e| e.to_string())?;

    match read_group_session(&conn, &session_id)? {
        Some(session) => serde_json::to_string(&session).map_err(|e| e.to_string()),
        None => Err("Session not found".to_string()),
    }
}

#[tauri::command]
pub fn group_participation_stats(
    session_id: String,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let stats = read_group_participation(&conn, &session_id)?;
    serde_json::to_string(&stats).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn group_participation_increment(
    session_id: String,
    character_id: String,
    turn_number: i32,
    pool: State<'_, SwappablePool>,
) -> Result<(), String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_participation
         SET speak_count = speak_count + 1, last_spoke_turn = ?1, last_spoke_at = ?2
         WHERE session_id = ?3 AND character_id = ?4",
        params![turn_number, now, session_id, character_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn group_messages_list(
    session_id: String,
    limit: i32,
    before_created_at: Option<i64>,
    before_id: Option<String>,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let messages = read_group_messages(
        &conn,
        &session_id,
        limit,
        before_created_at,
        before_id.as_deref(),
    )?;
    serde_json::to_string(&messages).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn group_message_upsert(
    session_id: String,
    message_json: String,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    let mut message: GroupMessage =
        serde_json::from_str(&message_json).map_err(|e| e.to_string())?;

    // Check if message exists
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM group_messages WHERE id = ?1",
            params![message.id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    let attachments_json =
        serde_json::to_string(&message.attachments).map_err(|e| e.to_string())?;

    if exists {
        // Update
        conn.execute(
            "UPDATE group_messages SET content = ?1, speaker_character_id = ?2, selected_variant_id = ?3,
             is_pinned = ?4, attachments = ?5, reasoning = ?6, selection_reasoning = ?7
             WHERE id = ?8",
            params![
                message.content,
                message.speaker_character_id,
                message.selected_variant_id,
                message.is_pinned as i32,
                attachments_json,
                message.reasoning,
                message.selection_reasoning,
                message.id
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
        // Insert
        let turn_number = get_next_turn_number(&conn, &session_id)?;
        message.turn_number = turn_number;
        message.created_at = now as i64;

        let (prompt_tokens, completion_tokens, total_tokens) = match &message.usage {
            Some(u) => (u.prompt_tokens, u.completion_tokens, u.total_tokens),
            None => (None, None, None),
        };

        conn.execute(
            "INSERT INTO group_messages (id, session_id, role, content, speaker_character_id, turn_number,
             created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned,
             attachments, reasoning, selection_reasoning)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                message.id,
                session_id,
                message.role,
                message.content,
                message.speaker_character_id,
                turn_number,
                now,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                message.selected_variant_id,
                message.is_pinned as i32,
                attachments_json,
                message.reasoning,
                message.selection_reasoning
            ],
        )
        .map_err(|e| e.to_string())?;

        // Update session timestamp
        conn.execute(
            "UPDATE group_sessions SET updated_at = ?1 WHERE id = ?2",
            params![now, session_id],
        )
        .map_err(|e| e.to_string())?;
    }

    serde_json::to_string(&message).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn group_message_delete(
    session_id: String,
    message_id: String,
    pool: State<'_, SwappablePool>,
) -> Result<(), String> {
    let conn = pool.get_connection()?;

    conn.execute(
        "DELETE FROM group_messages WHERE id = ?1 AND session_id = ?2",
        params![message_id, session_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn group_messages_delete_after(
    session_id: String,
    message_id: String,
    pool: State<'_, SwappablePool>,
) -> Result<(), String> {
    let conn = pool.get_connection()?;

    // Get the turn number of the reference message
    let turn_number: i32 = conn
        .query_row(
            "SELECT turn_number FROM group_messages WHERE id = ?1 AND session_id = ?2",
            params![message_id, session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Delete all messages with higher turn number
    conn.execute(
        "DELETE FROM group_messages WHERE session_id = ?1 AND turn_number > ?2",
        params![session_id, turn_number],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn group_message_add_variant(
    message_id: String,
    variant_json: String,
    pool: State<'_, SwappablePool>,
) -> Result<String, String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    let mut variant: GroupMessageVariant =
        serde_json::from_str(&variant_json).map_err(|e| e.to_string())?;

    if variant.id.is_empty() {
        variant.id = Uuid::new_v4().to_string();
    }
    variant.created_at = now as i64;

    let (prompt_tokens, completion_tokens, total_tokens) = match &variant.usage {
        Some(u) => (u.prompt_tokens, u.completion_tokens, u.total_tokens),
        None => (None, None, None),
    };

    conn.execute(
        "INSERT INTO group_message_variants (id, message_id, content, speaker_character_id, created_at,
         prompt_tokens, completion_tokens, total_tokens, reasoning, selection_reasoning)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            variant.id,
            message_id,
            variant.content,
            variant.speaker_character_id,
            now,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            variant.reasoning,
            variant.selection_reasoning
        ],
    )
    .map_err(|e| e.to_string())?;

    // Update the selected variant id on the message
    conn.execute(
        "UPDATE group_messages SET selected_variant_id = ?1 WHERE id = ?2",
        params![variant.id, message_id],
    )
    .map_err(|e| e.to_string())?;

    serde_json::to_string(&variant).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn group_message_select_variant(
    message_id: String,
    variant_id: String,
    pool: State<'_, SwappablePool>,
) -> Result<(), String> {
    let conn = pool.get_connection()?;

    // Get variant content and speaker
    let (content, speaker_id, reasoning, selection_reasoning): (String, Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT content, speaker_character_id, reasoning, selection_reasoning FROM group_message_variants WHERE id = ?1",
            params![variant_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| e.to_string())?;

    // Update message with variant content and selection
    conn.execute(
        "UPDATE group_messages SET content = ?1, speaker_character_id = ?2, selected_variant_id = ?3, reasoning = ?4, selection_reasoning = ?5 WHERE id = ?6",
        params![content, speaker_id, variant_id, reasoning, selection_reasoning, message_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn group_message_count(
    session_id: String,
    pool: State<'_, SwappablePool>,
) -> Result<i32, String> {
    let conn = pool.get_connection()?;

    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM group_messages WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(count)
}

// ============================================================================
// Memory Operations
// ============================================================================

/// Update memory embeddings for a group session
#[tauri::command]
pub fn group_session_update_memories(
    session_id: String,
    memory_embeddings_json: String,
    memory_summary: Option<String>,
    memory_summary_token_count: Option<i32>,
    pool: State<'_, SwappablePool>,
) -> Result<(), String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET memory_embeddings = ?1, memory_summary = ?2, memory_summary_token_count = ?3, updated_at = ?4 WHERE id = ?5",
        params![
            memory_embeddings_json,
            memory_summary.unwrap_or_default(),
            memory_summary_token_count.unwrap_or(0),
            now,
            session_id
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Update manual memories for a group session
#[tauri::command]
pub fn group_session_update_manual_memories(
    session_id: String,
    memories_json: String,
    pool: State<'_, SwappablePool>,
) -> Result<(), String> {
    let conn = pool.get_connection()?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET memories = ?1, updated_at = ?2 WHERE id = ?3",
        params![memories_json, now, session_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Internal function to update memory embeddings (used by group_chat_manager)
pub fn group_session_update_memories_internal(
    conn: &Connection,
    session_id: &str,
    memory_embeddings: &[MemoryEmbedding],
    memory_summary: Option<&str>,
    memory_summary_token_count: i32,
    memory_tool_events: &[serde_json::Value],
) -> Result<(), String> {
    let now = now_ms();
    let memory_embeddings_json =
        serde_json::to_string(memory_embeddings).map_err(|e| e.to_string())?;
    let memory_tool_events_json =
        serde_json::to_string(memory_tool_events).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE group_sessions SET memory_embeddings = ?1, memory_summary = ?2, memory_summary_token_count = ?3, memory_tool_events = ?4, updated_at = ?5 WHERE id = ?6",
        params![
            memory_embeddings_json,
            memory_summary.unwrap_or(""),
            memory_summary_token_count,
            memory_tool_events_json,
            now,
            session_id
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================================================
// Group Session Memory CRUD Operations
// ============================================================================

/// Add a manual memory to a group session
#[tauri::command]
pub async fn group_session_add_memory(
    app: tauri::AppHandle,
    session_id: String,
    memory: String,
    pool: State<'_, SwappablePool>,
) -> Result<Option<String>, String> {
    use crate::embedding_model;
    use crate::utils::log_info;

    log_info(
        &app,
        "group_session_add_memory",
        format!("Adding memory to group session {}", session_id),
    );

    let conn = pool.get_connection()?;

    // Read current memories and embeddings
    let (current_memories_json, current_embeddings_json): (String, String) = conn
        .query_row(
            "SELECT memories, memory_embeddings FROM group_sessions WHERE id = ?",
            params![&session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| ("[]".to_string(), "[]".to_string()));

    let mut memories: Vec<String> =
        serde_json::from_str(&current_memories_json).unwrap_or_else(|_| vec![]);
    let mut memory_embeddings: Vec<MemoryEmbedding> =
        serde_json::from_str(&current_embeddings_json).unwrap_or_else(|_| vec![]);

    // Add new memory
    memories.push(memory.clone());

    // Compute embedding (best-effort)
    let embedding = match embedding_model::compute_embedding(app.clone(), memory.clone()).await {
        Ok(vec) => vec,
        Err(_) => Vec::new(),
    };

    // Count tokens (best-effort)
    let token_count = crate::tokenizer::count_tokens(&app, &memory).unwrap_or(0);

    memory_embeddings.push(MemoryEmbedding {
        id: uuid::Uuid::new_v4().to_string(),
        text: memory,
        embedding,
        created_at: now_ms() as i64,
        token_count: token_count as i32,
        is_cold: false,
        importance_score: 1.0,
        last_accessed_at: now_ms() as i64,
        access_count: 0,
        is_pinned: false,
    });

    // Save back
    let new_memories_json = serde_json::to_string(&memories).map_err(|e| e.to_string())?;
    let new_embeddings_json =
        serde_json::to_string(&memory_embeddings).map_err(|e| e.to_string())?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET memories = ?, memory_embeddings = ?, updated_at = ? WHERE id = ?",
        params![new_memories_json, new_embeddings_json, now, &session_id],
    )
    .map_err(|e| e.to_string())?;

    // Return updated session
    if let Some(session) = read_group_session(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&session).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}

/// Remove a memory from a group session by index
#[tauri::command]
pub fn group_session_remove_memory(
    session_id: String,
    memory_index: usize,
    pool: State<'_, SwappablePool>,
) -> Result<Option<String>, String> {
    let conn = pool.get_connection()?;

    // Read current memories and embeddings
    let (current_memories_json, current_embeddings_json): (String, String) = conn
        .query_row(
            "SELECT memories, memory_embeddings FROM group_sessions WHERE id = ?",
            params![&session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| ("[]".to_string(), "[]".to_string()));

    let mut memories: Vec<String> =
        serde_json::from_str(&current_memories_json).unwrap_or_else(|_| vec![]);
    let mut memory_embeddings: Vec<MemoryEmbedding> =
        serde_json::from_str(&current_embeddings_json).unwrap_or_else(|_| vec![]);

    // Remove at index if valid
    if memory_index < memories.len() {
        memories.remove(memory_index);
    }
    if memory_index < memory_embeddings.len() {
        memory_embeddings.remove(memory_index);
    }

    // Save back
    let new_memories_json = serde_json::to_string(&memories).map_err(|e| e.to_string())?;
    let new_embeddings_json =
        serde_json::to_string(&memory_embeddings).map_err(|e| e.to_string())?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET memories = ?, memory_embeddings = ?, updated_at = ? WHERE id = ?",
        params![new_memories_json, new_embeddings_json, now, &session_id],
    )
    .map_err(|e| e.to_string())?;

    // Return updated session
    if let Some(session) = read_group_session(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&session).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}

/// Update a memory in a group session by index
#[tauri::command]
pub async fn group_session_update_memory(
    app: tauri::AppHandle,
    session_id: String,
    memory_index: usize,
    new_memory: String,
    pool: State<'_, SwappablePool>,
) -> Result<Option<String>, String> {
    use crate::embedding_model;

    let conn = pool.get_connection()?;

    // Read current memories and embeddings
    let (current_memories_json, current_embeddings_json): (String, String) = conn
        .query_row(
            "SELECT memories, memory_embeddings FROM group_sessions WHERE id = ?",
            params![&session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| ("[]".to_string(), "[]".to_string()));

    let mut memories: Vec<String> =
        serde_json::from_str(&current_memories_json).unwrap_or_else(|_| vec![]);
    let mut memory_embeddings: Vec<MemoryEmbedding> =
        serde_json::from_str(&current_embeddings_json).unwrap_or_else(|_| vec![]);

    // Update at index if valid
    if memory_index < memories.len() {
        memories[memory_index] = new_memory.clone();
    }

    if memory_index < memory_embeddings.len() {
        // Recompute embedding
        let embedding =
            match embedding_model::compute_embedding(app.clone(), new_memory.clone()).await {
                Ok(vec) => vec,
                Err(_) => memory_embeddings[memory_index].embedding.clone(),
            };

        let token_count = crate::tokenizer::count_tokens(&app, &new_memory).unwrap_or(0);

        memory_embeddings[memory_index].text = new_memory;
        memory_embeddings[memory_index].embedding = embedding;
        memory_embeddings[memory_index].token_count = token_count as i32;
    }

    // Save back
    let new_memories_json = serde_json::to_string(&memories).map_err(|e| e.to_string())?;
    let new_embeddings_json =
        serde_json::to_string(&memory_embeddings).map_err(|e| e.to_string())?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET memories = ?, memory_embeddings = ?, updated_at = ? WHERE id = ?",
        params![new_memories_json, new_embeddings_json, now, &session_id],
    )
    .map_err(|e| e.to_string())?;

    // Return updated session
    if let Some(session) = read_group_session(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&session).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}

/// Toggle pin state for a memory in a group session
#[tauri::command]
pub fn group_session_toggle_memory_pin(
    session_id: String,
    memory_index: usize,
    pool: State<'_, SwappablePool>,
) -> Result<Option<String>, String> {
    let conn = pool.get_connection()?;

    // Read current embeddings
    let current_embeddings_json: String = conn
        .query_row(
            "SELECT memory_embeddings FROM group_sessions WHERE id = ?",
            params![&session_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "[]".to_string());

    let mut memory_embeddings: Vec<MemoryEmbedding> =
        serde_json::from_str(&current_embeddings_json).unwrap_or_else(|_| vec![]);

    // Toggle pin at index if valid
    if memory_index < memory_embeddings.len() {
        memory_embeddings[memory_index].is_pinned = !memory_embeddings[memory_index].is_pinned;
    }

    // Save back
    let new_embeddings_json =
        serde_json::to_string(&memory_embeddings).map_err(|e| e.to_string())?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET memory_embeddings = ?, updated_at = ? WHERE id = ?",
        params![new_embeddings_json, now, &session_id],
    )
    .map_err(|e| e.to_string())?;

    // Return updated session
    if let Some(session) = read_group_session(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&session).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}

/// Set cold state for a memory in a group session
#[tauri::command]
pub fn group_session_set_memory_cold_state(
    session_id: String,
    memory_index: usize,
    is_cold: bool,
    pool: State<'_, SwappablePool>,
) -> Result<Option<String>, String> {
    let conn = pool.get_connection()?;

    // Read current embeddings
    let current_embeddings_json: String = conn
        .query_row(
            "SELECT memory_embeddings FROM group_sessions WHERE id = ?",
            params![&session_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "[]".to_string());

    let mut memory_embeddings: Vec<MemoryEmbedding> =
        serde_json::from_str(&current_embeddings_json).unwrap_or_else(|_| vec![]);

    // Set cold state at index if valid
    if memory_index < memory_embeddings.len() {
        memory_embeddings[memory_index].is_cold = is_cold;
    }

    // Save back
    let new_embeddings_json =
        serde_json::to_string(&memory_embeddings).map_err(|e| e.to_string())?;
    let now = now_ms();

    conn.execute(
        "UPDATE group_sessions SET memory_embeddings = ?, updated_at = ? WHERE id = ?",
        params![new_embeddings_json, now, &session_id],
    )
    .map_err(|e| e.to_string())?;

    // Return updated session
    if let Some(session) = read_group_session(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&session).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}
