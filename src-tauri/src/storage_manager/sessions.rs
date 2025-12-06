use rusqlite::{params, OptionalExtension};
use serde_json::{Map as JsonMap, Value as JsonValue};
use uuid;

use super::db::{now_ms, open_db};
use crate::embedding_model;
use crate::utils::{log_error, log_warn};

fn read_session(conn: &rusqlite::Connection, id: &str) -> Result<Option<JsonValue>, String> {
    let row = conn
        .query_row(
            "SELECT character_id, title, system_prompt, selected_scene_id, persona_id, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, memories, memory_embeddings, memory_summary, memory_summary_token_count, memory_tool_events, archived, created_at, updated_at FROM sessions WHERE id = ?",
            params![id],
            |r| Ok((
                r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, Option<String>>(4)?, r.get::<_, Option<f64>>(5)?, r.get::<_, Option<f64>>(6)?, r.get::<_, Option<i64>>(7)?, r.get::<_, Option<f64>>(8)?, r.get::<_, Option<f64>>(9)?, r.get::<_, Option<i64>>(10)?, r.get::<_, String>(11)?, r.get::<_, String>(12)?, r.get::<_, Option<String>>(13)?, r.get::<_, i64>(14)?, r.get::<_, String>(15)?, r.get::<_, i64>(16)?, r.get::<_, i64>(17)?, r.get::<_, i64>(18)?
            )),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((
        character_id,
        title,
        system_prompt,
        selected_scene_id,
        persona_id,
        temperature,
        top_p,
        max_output_tokens,
        frequency_penalty,
        presence_penalty,
        top_k,
        memories_json,
        memory_embeddings_json,
        memory_summary,
        memory_summary_token_count,
        memory_tool_events_json,
        archived,
        created_at,
        updated_at,
    )) = row
    else {
        return Ok(None);
    };

    // messages
    let mut mstmt = conn.prepare("SELECT id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned, memory_refs, attachments FROM messages WHERE session_id = ? ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    let mrows = mstmt
        .query_map(params![id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, Option<i64>>(4)?,
                r.get::<_, Option<i64>>(5)?,
                r.get::<_, Option<i64>>(6)?,
                r.get::<_, Option<String>>(7)?,
                r.get::<_, i64>(8)?,
                r.get::<_, Option<String>>(9)?,
                r.get::<_, Option<String>>(10)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut messages: Vec<JsonValue> = Vec::new();
    for mr in mrows {
        let (
            mid,
            role,
            content,
            mcreated,
            p_tokens,
            c_tokens,
            t_tokens,
            selected_variant_id,
            is_pinned,
            memory_refs_json,
            attachments_json,
        ) = mr.map_err(|e| e.to_string())?;
        let mut vstmt = conn.prepare("SELECT id, content, created_at, prompt_tokens, completion_tokens, total_tokens FROM message_variants WHERE message_id = ? ORDER BY created_at ASC").map_err(|e| e.to_string())?;
        let vrows = vstmt
            .query_map(params![&mid], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, Option<i64>>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, Option<i64>>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut variants: Vec<JsonValue> = Vec::new();
        for vr in vrows {
            let (vid, vcontent, vcreated, vp, vc, vt) = vr.map_err(|e| e.to_string())?;
            variants.push(serde_json::json!({"id": vid, "content": vcontent, "createdAt": vcreated, "usage": {"promptTokens": vp, "completionTokens": vc, "totalTokens": vt}}));
        }
        let mut mobj = JsonMap::new();
        mobj.insert("id".into(), JsonValue::String(mid));
        mobj.insert("role".into(), JsonValue::String(role));
        mobj.insert("content".into(), JsonValue::String(content));
        mobj.insert("createdAt".into(), JsonValue::from(mcreated));
        if p_tokens.is_some() || c_tokens.is_some() || t_tokens.is_some() {
            mobj.insert("usage".into(), serde_json::json!({"promptTokens": p_tokens, "completionTokens": c_tokens, "totalTokens": t_tokens}));
        }
        if !variants.is_empty() {
            mobj.insert("variants".into(), JsonValue::Array(variants));
        }
        if let Some(sel) = selected_variant_id {
            mobj.insert("selectedVariantId".into(), JsonValue::String(sel));
        }
        mobj.insert("isPinned".into(), JsonValue::Bool(is_pinned != 0));
        if let Some(refs_json) = memory_refs_json {
            if let Ok(parsed) = serde_json::from_str::<JsonValue>(&refs_json) {
                mobj.insert("memoryRefs".into(), parsed);
            }
        }
        // Parse and insert attachments
        if let Some(att_json) = attachments_json {
            if let Ok(parsed) = serde_json::from_str::<JsonValue>(&att_json) {
                mobj.insert("attachments".into(), parsed);
            }
        }
        messages.push(JsonValue::Object(mobj));
    }

    let advanced = if temperature.is_some()
        || top_p.is_some()
        || max_output_tokens.is_some()
        || frequency_penalty.is_some()
        || presence_penalty.is_some()
        || top_k.is_some()
    {
        Some(serde_json::json!({
            "temperature": temperature,
            "topP": top_p,
            "maxOutputTokens": max_output_tokens,
            "frequencyPenalty": frequency_penalty,
            "presencePenalty": presence_penalty,
            "topK": top_k,
        }))
    } else {
        None
    };

    // Parse memories JSON array
    let memories: JsonValue =
        serde_json::from_str(&memories_json).unwrap_or_else(|_| JsonValue::Array(vec![]));
    let memory_embeddings: JsonValue =
        serde_json::from_str(&memory_embeddings_json).unwrap_or_else(|_| JsonValue::Array(vec![]));
    let memory_tool_events: JsonValue =
        serde_json::from_str(&memory_tool_events_json).unwrap_or_else(|_| JsonValue::Array(vec![]));

    let session = serde_json::json!({
        "id": id,
        "characterId": character_id,
        "title": title,
        "systemPrompt": system_prompt,
        "selectedSceneId": selected_scene_id,
        "personaId": persona_id,
        "advancedModelSettings": advanced,
        "memories": memories,
        "memoryEmbeddings": memory_embeddings,
        "memorySummary": memory_summary.unwrap_or_default(),
        "memorySummaryTokenCount": memory_summary_token_count,
        "memoryToolEvents": memory_tool_events,
        "messages": messages,
        "archived": archived != 0,
        "createdAt": created_at,
        "updatedAt": updated_at,
    });
    Ok(Some(session))
}

#[tauri::command]
pub fn sessions_list_ids(app: tauri::AppHandle) -> Result<String, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id FROM sessions ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| e.to_string())?;
    let mut ids: Vec<String> = Vec::new();
    for r in rows {
        ids.push(r.map_err(|e| e.to_string())?);
    }
    Ok(serde_json::to_string(&ids).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn session_get(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;
    let v = read_session(&conn, &id)?;
    Ok(match v {
        Some(json) => Some(serde_json::to_string(&json).map_err(|e| e.to_string())?),
        None => None,
    })
}

#[tauri::command]
pub fn session_upsert(app: tauri::AppHandle, session_json: String) -> Result<(), String> {
    let mut conn = open_db(&app)?;
    let s: JsonValue = serde_json::from_str(&session_json).map_err(|e| e.to_string())?;
    let id = s
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "id is required".to_string())?
        .to_string();
    let character_id = s
        .get("characterId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "characterId is required".to_string())?;
    let title = s.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let system_prompt = s
        .get("systemPrompt")
        .and_then(|v| v.as_str())
        .map(|x| x.to_string());
    let selected_scene_id = s
        .get("selectedSceneId")
        .and_then(|v| v.as_str())
        .map(|x| x.to_string());
    let persona_id = s
        .get("personaId")
        .and_then(|v| v.as_str())
        .map(|x| x.to_string());
    let archived = s.get("archived").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
    let created_at = s
        .get("createdAt")
        .and_then(|v| v.as_i64())
        .unwrap_or(now_ms() as i64);
    let updated_at = now_ms() as i64;

    // Handle memories - serialize to JSON string
    let memories_json = match s.get("memories") {
        Some(v) => serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()),
        None => "[]".to_string(),
    };
    /*let memory_embeddings_json = match s.get("memoryEmbeddings") {
        Some(v) => serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()),
        None => "[]".to_string(),
    };*/
    let memory_summary = s
        .get("memorySummary")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let memory_summary_token_count = s
        .get("memorySummaryTokenCount")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let memory_tool_events_json = match s.get("memoryToolEvents") {
        Some(v) => serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()),
        None => "[]".to_string(),
    };
    let memory_embeddings_json = match s.get("memoryEmbeddings") {
        Some(v) => serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()),
        None => "[]".to_string(),
    };

    let adv = s.get("advancedModelSettings");
    let temperature = adv
        .and_then(|v| v.get("temperature"))
        .and_then(|v| v.as_f64());
    let top_p = adv.and_then(|v| v.get("topP")).and_then(|v| v.as_f64());
    let max_output_tokens = adv
        .and_then(|v| v.get("maxOutputTokens"))
        .and_then(|v| v.as_i64());
    let frequency_penalty = adv
        .and_then(|v| v.get("frequencyPenalty"))
        .and_then(|v| v.as_f64());
    let presence_penalty = adv
        .and_then(|v| v.get("presencePenalty"))
        .and_then(|v| v.as_f64());
    let top_k = adv.and_then(|v| v.get("topK")).and_then(|v| v.as_i64());

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        r#"INSERT INTO sessions (id, character_id, title, system_prompt, selected_scene_id, persona_id, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, memories, memory_embeddings, memory_summary, memory_summary_token_count, memory_tool_events, archived, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              character_id=excluded.character_id,
              title=excluded.title,
              system_prompt=excluded.system_prompt,
              selected_scene_id=excluded.selected_scene_id,
              persona_id=excluded.persona_id,
              temperature=excluded.temperature,
              top_p=excluded.top_p,
              max_output_tokens=excluded.max_output_tokens,
              frequency_penalty=excluded.frequency_penalty,
              presence_penalty=excluded.presence_penalty,
              top_k=excluded.top_k,
              memories=excluded.memories,
              memory_embeddings=excluded.memory_embeddings,
              memory_summary=excluded.memory_summary,
              memory_summary_token_count=excluded.memory_summary_token_count,
              memory_tool_events=excluded.memory_tool_events,
              archived=excluded.archived,
              updated_at=excluded.updated_at"#,
        params![&id, character_id, title, system_prompt, selected_scene_id, persona_id, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, &memories_json, &memory_embeddings_json, memory_summary, memory_summary_token_count, &memory_tool_events_json, archived, created_at, updated_at],
    ).map_err(|e| e.to_string())?;

    // Replace messages
    tx.execute("DELETE FROM messages WHERE session_id = ?", params![&id])
        .map_err(|e| e.to_string())?;
    if let Some(msgs) = s.get("messages").and_then(|v| v.as_array()) {
        for m in msgs {
            let mid = m
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("user");
            let content = m.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let mcreated = m
                .get("createdAt")
                .and_then(|v| v.as_i64())
                .unwrap_or(updated_at);
            let is_pinned = m.get("isPinned").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
            let usage = m.get("usage");
            let pt = usage
                .and_then(|u| u.get("promptTokens"))
                .and_then(|v| v.as_i64());
            let ct = usage
                .and_then(|u| u.get("completionTokens"))
                .and_then(|v| v.as_i64());
            let tt = usage
                .and_then(|u| u.get("totalTokens"))
                .and_then(|v| v.as_i64());
            let selected_variant_id = m
                .get("selectedVariantId")
                .and_then(|v| v.as_str())
                .map(|x| x.to_string());
            let memory_refs = m
                .get("memoryRefs")
                .cloned()
                .unwrap_or_else(|| JsonValue::Array(Vec::new()));
            let attachments = m
                .get("attachments")
                .cloned()
                .unwrap_or_else(|| JsonValue::Array(Vec::new()));
            tx.execute(
                "INSERT INTO messages (id, session_id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned, memory_refs, attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    &mid,
                    &id,
                    role,
                    content,
                    mcreated,
                    pt,
                    ct,
                    tt,
                    selected_variant_id,
                    is_pinned,
                    memory_refs.to_string(),
                    attachments.to_string()
                ],
            ).map_err(|e| e.to_string())?;

            if let Some(vars) = m.get("variants").and_then(|v| v.as_array()) {
                for v in vars {
                    let vid = v
                        .get("id")
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                    let vcontent = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
                    let vcreated = v
                        .get("createdAt")
                        .and_then(|x| x.as_i64())
                        .unwrap_or(updated_at);
                    let u = v.get("usage");
                    let vp = u
                        .and_then(|u| u.get("promptTokens"))
                        .and_then(|v| v.as_i64());
                    let vc = u
                        .and_then(|u| u.get("completionTokens"))
                        .and_then(|v| v.as_i64());
                    let vt = u
                        .and_then(|u| u.get("totalTokens"))
                        .and_then(|v| v.as_i64());
                    tx.execute("INSERT INTO message_variants (id, message_id, content, created_at, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)", params![vid, &mid, vcontent, vcreated, vp, vc, vt]).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn session_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM sessions WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn session_archive(app: tauri::AppHandle, id: String, archived: bool) -> Result<(), String> {
    let conn = open_db(&app)?;
    let now = now_ms() as i64;
    conn.execute(
        "UPDATE sessions SET archived = ?, updated_at = ? WHERE id = ?",
        params![if archived { 1 } else { 0 }, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn session_update_title(
    app: tauri::AppHandle,
    id: String,
    title: String,
) -> Result<(), String> {
    let conn = open_db(&app)?;
    let now = now_ms() as i64;
    conn.execute(
        "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
        params![title, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn message_toggle_pin(
    app: tauri::AppHandle,
    session_id: String,
    message_id: String,
) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;
    let current: Option<i64> = conn
        .query_row(
            "SELECT is_pinned FROM messages WHERE id = ?",
            params![&message_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(is_pinned) = current {
        conn.execute(
            "UPDATE messages SET is_pinned = ? WHERE id = ?",
            params![if is_pinned == 0 { 1 } else { 0 }, &message_id],
        )
        .map_err(|e| e.to_string())?;
        if let Some(json) = read_session(&conn, &session_id)? {
            return Ok(Some(
                serde_json::to_string(&json).map_err(|e| e.to_string())?,
            ));
        }
        Ok(None)
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn session_add_memory(
    app: tauri::AppHandle,
    session_id: String,
    memory: String,
) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;

    // Read current memories
    let (current_memories_json, current_embeddings_json): (String, String) = conn
        .query_row(
            "SELECT memories, memory_embeddings FROM sessions WHERE id = ?",
            params![&session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| ("[]".to_string(), "[]".to_string()));

    let mut memories: Vec<String> =
        serde_json::from_str(&current_memories_json).unwrap_or_else(|_| vec![]);
    let mut memory_embeddings: Vec<JsonValue> =
        serde_json::from_str(&current_embeddings_json).unwrap_or_else(|_| vec![]);

    // Add new memory (clone so we can still use `memory` for the embedding)
    memories.push(memory.clone());

    // Compute embedding (best-effort)
    let embedding = match embedding_model::compute_embedding(app.clone(), memory.clone()).await {
        Ok(vec) => vec,
        Err(err) => {
            log_warn(
                &app,
                "session_add_memory",
                format!("embedding failed: {}", err),
            );
            Vec::new()
        }
    };

    // Count tokens (best-effort)
    let token_count = crate::tokenizer::count_tokens(&app, &memory).unwrap_or(0);

    memory_embeddings.push(serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "text": memory.clone(),
        "embedding": embedding,
        "createdAt": now_ms() as i64,
        "tokenCount": token_count,
    }));

    // Save back
    let new_memories_json = serde_json::to_string(&memories).map_err(|e| e.to_string())?;
    let new_embeddings_json =
        serde_json::to_string(&memory_embeddings).map_err(|e| e.to_string())?;
    let now = now_ms() as i64;

    conn.execute(
        "UPDATE sessions SET memories = ?, memory_embeddings = ?, updated_at = ? WHERE id = ?",
        params![new_memories_json, new_embeddings_json, now, &session_id],
    )
    .map_err(|e| e.to_string())?;

    // Return updated session
    if let Some(json) = read_session(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&json).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}

#[tauri::command]
pub fn session_remove_memory(
    app: tauri::AppHandle,
    session_id: String,
    memory_index: usize,
) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;

    // Read current memories
    let (current_memories_json, current_embeddings_json): (String, String) = conn
        .query_row(
            "SELECT memories, memory_embeddings FROM sessions WHERE id = ?",
            params![&session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| ("[]".to_string(), "[]".to_string()));

    let mut memories: Vec<String> =
        serde_json::from_str(&current_memories_json).unwrap_or_else(|_| vec![]);
    let mut memory_embeddings: Vec<JsonValue> =
        serde_json::from_str(&current_embeddings_json).unwrap_or_else(|_| vec![]);

    // Remove memory at index
    if memory_index < memories.len() {
        memories.remove(memory_index);

        if memory_index < memory_embeddings.len() {
            memory_embeddings.remove(memory_index);
        }

        // Save back
        let new_memories_json = serde_json::to_string(&memories).map_err(|e| e.to_string())?;
        let new_embeddings_json =
            serde_json::to_string(&memory_embeddings).map_err(|e| e.to_string())?;
        let now = now_ms() as i64;

        conn.execute(
            "UPDATE sessions SET memories = ?, memory_embeddings = ?, updated_at = ? WHERE id = ?",
            params![new_memories_json, new_embeddings_json, now, &session_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Return updated session
    if let Some(json) = read_session(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&json).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}

#[tauri::command]
pub async fn session_update_memory(
    app: tauri::AppHandle,
    session_id: String,
    memory_index: usize,
    new_memory: String,
) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;

    // Read current memories
    let (current_memories_json, current_embeddings_json): (String, String) = conn
        .query_row(
            "SELECT memories, memory_embeddings FROM sessions WHERE id = ?",
            params![&session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| ("[]".to_string(), "[]".to_string()));

    let mut memories: Vec<String> =
        serde_json::from_str(&current_memories_json).unwrap_or_else(|_| vec![]);
    let mut memory_embeddings: Vec<JsonValue> =
        serde_json::from_str(&current_embeddings_json).unwrap_or_else(|_| vec![]);

    // Update memory at index
    if memory_index < memories.len() {
        memories[memory_index] = new_memory.clone();

        // Recompute embedding
        let embedding =
            match embedding_model::compute_embedding(app.clone(), new_memory.clone()).await {
                Ok(vec) => vec,
                Err(err) => {
                    log_error(
                        &app,
                        "session_update_memory",
                        format!("embedding failed: {}", err),
                    );
                    Vec::new()
                }
            };

        if memory_index < memory_embeddings.len() {
            if let Some(obj) = memory_embeddings
                .get_mut(memory_index)
                .and_then(|v| v.as_object_mut())
            {
                obj.insert(
                    "text".into(),
                    JsonValue::String(memories[memory_index].clone()),
                );
                obj.insert(
                    "embedding".into(),
                    JsonValue::Array(embedding.iter().map(|f| JsonValue::from(*f)).collect()),
                );
            }
        } else {
            memory_embeddings.push(serde_json::json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "text": memories[memory_index].clone(),
                "embedding": embedding,
                "createdAt": now_ms() as i64
            }));
        }

        // Save back
        let new_memories_json = serde_json::to_string(&memories).map_err(|e| e.to_string())?;
        let new_embeddings_json =
            serde_json::to_string(&memory_embeddings).map_err(|e| e.to_string())?;
        let now = now_ms() as i64;

        conn.execute(
            "UPDATE sessions SET memories = ?, memory_embeddings = ?, updated_at = ? WHERE id = ?",
            params![new_memories_json, new_embeddings_json, now, &session_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Return updated session
    if let Some(json) = read_session(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&json).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}
