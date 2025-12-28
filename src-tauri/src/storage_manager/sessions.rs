use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::collections::HashMap;
use uuid;

use super::db::{now_ms, open_db};
use crate::embedding_model;
use crate::utils::{log_error, log_warn};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionPreview {
    id: String,
    character_id: String,
    title: String,
    updated_at: i64,
    archived: bool,
    last_message: String,
    message_count: i64,
}

fn session_preview_from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<SessionPreview> {
    Ok(SessionPreview {
        id: r.get(0)?,
        character_id: r.get(1)?,
        title: r.get(2)?,
        updated_at: r.get(3)?,
        archived: r.get::<_, i64>(4)? != 0,
        last_message: r.get::<_, String>(5)?,
        message_count: r.get(6)?,
    })
}

fn json_usage_summary(
    prompt_tokens: Option<i64>,
    completion_tokens: Option<i64>,
    total_tokens: Option<i64>,
) -> Option<JsonValue> {
    let mut usage = JsonMap::new();
    if let Some(v) = prompt_tokens {
        usage.insert("promptTokens".into(), JsonValue::from(v));
    }
    if let Some(v) = completion_tokens {
        usage.insert("completionTokens".into(), JsonValue::from(v));
    }
    if let Some(v) = total_tokens {
        usage.insert("totalTokens".into(), JsonValue::from(v));
    }
    if usage.is_empty() {
        None
    } else {
        Some(JsonValue::Object(usage))
    }
}

fn read_session_meta(conn: &rusqlite::Connection, id: &str) -> Result<Option<JsonValue>, String> {
    let row = conn
        .query_row(
            "SELECT character_id, title, system_prompt, selected_scene_id, persona_id, voice_autoplay, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, memories, memory_embeddings, memory_summary, memory_summary_token_count, memory_tool_events, archived, created_at, updated_at FROM sessions WHERE id = ?",
            params![id],
            |r| Ok((
                r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, Option<String>>(4)?, r.get::<_, Option<i64>>(5)?, r.get::<_, Option<f64>>(6)?, r.get::<_, Option<f64>>(7)?, r.get::<_, Option<i64>>(8)?, r.get::<_, Option<f64>>(9)?, r.get::<_, Option<f64>>(10)?, r.get::<_, Option<i64>>(11)?, r.get::<_, String>(12)?, r.get::<_, String>(13)?, r.get::<_, Option<String>>(14)?, r.get::<_, i64>(15)?, r.get::<_, String>(16)?, r.get::<_, i64>(17)?, r.get::<_, i64>(18)?, r.get::<_, i64>(19)?
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
        voice_autoplay,
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
        "voiceAutoplay": voice_autoplay.map(|value| value != 0),
        "advancedModelSettings": advanced,
        "memories": memories,
        "memoryEmbeddings": memory_embeddings,
        "memorySummary": memory_summary.unwrap_or_default(),
        "memorySummaryTokenCount": memory_summary_token_count,
        "memoryToolEvents": memory_tool_events,
        "messages": [],
        "archived": archived != 0,
        "createdAt": created_at,
        "updatedAt": updated_at,
    });
    Ok(Some(session))
}

fn read_session(conn: &rusqlite::Connection, id: &str) -> Result<Option<JsonValue>, String> {
    let row = conn
        .query_row(
            "SELECT character_id, title, system_prompt, selected_scene_id, persona_id, voice_autoplay, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, memories, memory_embeddings, memory_summary, memory_summary_token_count, memory_tool_events, archived, created_at, updated_at FROM sessions WHERE id = ?",
            params![id],
            |r| Ok((
                r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, Option<String>>(4)?, r.get::<_, Option<i64>>(5)?, r.get::<_, Option<f64>>(6)?, r.get::<_, Option<f64>>(7)?, r.get::<_, Option<i64>>(8)?, r.get::<_, Option<f64>>(9)?, r.get::<_, Option<f64>>(10)?, r.get::<_, Option<i64>>(11)?, r.get::<_, String>(12)?, r.get::<_, String>(13)?, r.get::<_, Option<String>>(14)?, r.get::<_, i64>(15)?, r.get::<_, String>(16)?, r.get::<_, i64>(17)?, r.get::<_, i64>(18)?, r.get::<_, i64>(19)?
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
        voice_autoplay,
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
    let mut mstmt = conn.prepare("SELECT id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned, memory_refs, attachments, reasoning FROM messages WHERE session_id = ? ORDER BY created_at ASC").map_err(|e| e.to_string())?;
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
                r.get::<_, Option<String>>(11)?,
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
            reasoning,
        ) = mr.map_err(|e| e.to_string())?;
        let mut vstmt = conn.prepare("SELECT id, content, created_at, prompt_tokens, completion_tokens, total_tokens, reasoning FROM message_variants WHERE message_id = ? ORDER BY created_at ASC").map_err(|e| e.to_string())?;
        let vrows = vstmt
            .query_map(params![&mid], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, Option<i64>>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, Option<i64>>(5)?,
                    r.get::<_, Option<String>>(6)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut variants: Vec<JsonValue> = Vec::new();
        for vr in vrows {
            let (vid, vcontent, vcreated, vp, vc, vt, vreasoning) =
                vr.map_err(|e| e.to_string())?;
            let mut vobj = JsonMap::new();
            vobj.insert("id".into(), JsonValue::String(vid));
            vobj.insert("content".into(), JsonValue::String(vcontent));
            vobj.insert("createdAt".into(), JsonValue::from(vcreated));
            if let Some(usage) = json_usage_summary(vp, vc, vt) {
                vobj.insert("usage".into(), usage);
            }
            if let Some(r) = vreasoning {
                vobj.insert("reasoning".into(), JsonValue::String(r));
            }
            variants.push(JsonValue::Object(vobj));
        }
        let mut mobj = JsonMap::new();
        mobj.insert("id".into(), JsonValue::String(mid));
        mobj.insert("role".into(), JsonValue::String(role));
        mobj.insert("content".into(), JsonValue::String(content));
        mobj.insert("createdAt".into(), JsonValue::from(mcreated));
        if let Some(usage) = json_usage_summary(p_tokens, c_tokens, t_tokens) {
            mobj.insert("usage".into(), usage);
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
        // Add reasoning if present
        if let Some(r) = reasoning {
            mobj.insert("reasoning".into(), JsonValue::String(r));
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
        "voiceAutoplay": voice_autoplay.map(|value| value != 0),
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

fn fetch_messages_page(
    conn: &rusqlite::Connection,
    session_id: &str,
    limit: i64,
    before_created_at: Option<i64>,
    before_id: Option<&str>,
) -> Result<Vec<JsonValue>, String> {
    let mut sql = String::from(
        "SELECT id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned, memory_refs, attachments, reasoning FROM messages WHERE session_id = ?1",
    );

    let use_before = before_created_at.is_some() && before_id.is_some();
    if use_before {
        sql.push_str(" AND (created_at < ?2 OR (created_at = ?2 AND id < ?3))");
    }
    sql.push_str(" ORDER BY created_at DESC, id DESC LIMIT ");
    sql.push_str(&limit.to_string());

    let mut raw_messages = Vec::new();
    let mut message_ids: Vec<String> = Vec::new();
    {
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        if use_before {
            let rows = stmt
                .query_map(
                    params![session_id, before_created_at.unwrap(), before_id.unwrap()],
                    |r| {
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
                            r.get::<_, Option<String>>(11)?,
                        ))
                    },
                )
                .map_err(|e| e.to_string())?;
            for row in rows {
                let tuple = row.map_err(|e| e.to_string())?;
                message_ids.push(tuple.0.clone());
                raw_messages.push(tuple);
            }
        } else {
            let rows = stmt
                .query_map(params![session_id], |r| {
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
                        r.get::<_, Option<String>>(11)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                let tuple = row.map_err(|e| e.to_string())?;
                message_ids.push(tuple.0.clone());
                raw_messages.push(tuple);
            }
        }
    }

    let mut variants_by_message: HashMap<String, Vec<JsonValue>> = HashMap::new();
    if !message_ids.is_empty() {
        let placeholders = message_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let vsql = format!(
            "SELECT message_id, id, content, created_at, prompt_tokens, completion_tokens, total_tokens, reasoning FROM message_variants WHERE message_id IN ({}) ORDER BY created_at ASC",
            placeholders
        );
        let mut vstmt = conn.prepare(&vsql).map_err(|e| e.to_string())?;
        let vrows = vstmt
            .query_map(rusqlite::params_from_iter(message_ids.iter()), |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, Option<i64>>(5)?,
                    r.get::<_, Option<i64>>(6)?,
                    r.get::<_, Option<String>>(7)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for vr in vrows {
            let (message_id, vid, vcontent, vcreated, vp, vc, vt, vreasoning) =
                vr.map_err(|e| e.to_string())?;
            variants_by_message.entry(message_id).or_default().push({
                let mut vobj = JsonMap::new();
                vobj.insert("id".into(), JsonValue::String(vid));
                if let Some(r) = vreasoning {
                    vobj.insert("reasoning".into(), JsonValue::String(r));
                }
                vobj.insert("content".into(), JsonValue::String(vcontent));
                vobj.insert("createdAt".into(), JsonValue::from(vcreated));
                if let Some(usage) = json_usage_summary(vp, vc, vt) {
                    vobj.insert("usage".into(), usage);
                }
                JsonValue::Object(vobj)
            });
        }
    }

    let mut out: Vec<JsonValue> = Vec::with_capacity(raw_messages.len());
    for (
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
        reasoning,
    ) in raw_messages
    {
        let mut mobj = JsonMap::new();
        mobj.insert("id".into(), JsonValue::String(mid.clone()));
        mobj.insert("role".into(), JsonValue::String(role));
        mobj.insert("content".into(), JsonValue::String(content));
        mobj.insert("createdAt".into(), JsonValue::from(mcreated));
        if let Some(usage) = json_usage_summary(p_tokens, c_tokens, t_tokens) {
            mobj.insert("usage".into(), usage);
        }
        if let Some(variants) = variants_by_message.get(&mid) {
            if !variants.is_empty() {
                mobj.insert("variants".into(), JsonValue::Array(variants.clone()));
            }
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
        if let Some(att_json) = attachments_json {
            if let Ok(parsed) = serde_json::from_str::<JsonValue>(&att_json) {
                mobj.insert("attachments".into(), parsed);
            }
        }
        if let Some(r) = reasoning {
            mobj.insert("reasoning".into(), JsonValue::String(r));
        }
        out.push(JsonValue::Object(mobj));
    }

    // We fetched DESC for paging; return ASC for rendering.
    out.reverse();
    Ok(out)
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

/// List session previews without loading full message history.
///
/// This is intentionally designed to avoid `session_get` for every session when
/// rendering chat lists and history.
#[tauri::command]
pub fn sessions_list_previews(
    app: tauri::AppHandle,
    character_id: Option<String>,
    limit: Option<i64>,
) -> Result<String, String> {
    let conn = open_db(&app)?;

    let mut sql = String::from(
        r#"
        SELECT
          s.id,
          s.character_id,
          s.title,
          s.updated_at,
          s.archived,
          COALESCE(
            (
              SELECT substr(m.content, 1, 400)
              FROM messages m
              WHERE m.session_id = s.id
              ORDER BY m.created_at DESC
              LIMIT 1
            ),
            ''
          ) AS last_message,
          (
            SELECT COUNT(1)
            FROM messages m
            WHERE m.session_id = s.id
          ) AS message_count
        FROM sessions s
        WHERE (?1 IS NULL OR s.character_id = ?1)
        ORDER BY s.updated_at DESC
        "#,
    );
    if limit.is_some() {
        sql.push_str(" LIMIT ?2");
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let mut previews: Vec<SessionPreview> = Vec::new();
    if limit.is_some() {
        let rows = stmt
            .query_map(params![character_id, limit], session_preview_from_row)
            .map_err(|e| e.to_string())?;
        for row in rows {
            previews.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let rows = stmt
            .query_map(params![character_id], session_preview_from_row)
            .map_err(|e| e.to_string())?;
        for row in rows {
            previews.push(row.map_err(|e| e.to_string())?);
        }
    }

    Ok(serde_json::to_string(&previews).map_err(|e| e.to_string())?)
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
pub fn session_get_meta(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;
    let v = read_session_meta(&conn, &id)?;
    Ok(match v {
        Some(json) => Some(serde_json::to_string(&json).map_err(|e| e.to_string())?),
        None => None,
    })
}

#[tauri::command]
pub fn session_message_count(app: tauri::AppHandle, session_id: String) -> Result<i64, String> {
    let conn = open_db(&app)?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM messages WHERE session_id = ?",
            params![session_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub fn messages_list(
    app: tauri::AppHandle,
    session_id: String,
    limit: i64,
    before_created_at: Option<i64>,
    before_id: Option<String>,
) -> Result<String, String> {
    let conn = open_db(&app)?;
    let messages = fetch_messages_page(
        &conn,
        &session_id,
        limit.max(0).min(500),
        before_created_at,
        before_id.as_deref(),
    )?;
    Ok(serde_json::to_string(&messages).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn messages_list_pinned(app: tauri::AppHandle, session_id: String) -> Result<String, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id FROM messages WHERE session_id = ? AND is_pinned = 1 ORDER BY created_at ASC, id ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![&session_id], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| e.to_string())?;
    let mut pinned_ids: Vec<String> = Vec::new();
    for row in rows {
        pinned_ids.push(row.map_err(|e| e.to_string())?);
    }
    if pinned_ids.is_empty() {
        return Ok("[]".to_string());
    }

    let placeholders = pinned_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned, memory_refs, attachments, reasoning FROM messages WHERE session_id = ?1 AND id IN ({}) ORDER BY created_at ASC, id ASC",
        placeholders
    );
    let mut mstmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(1 + pinned_ids.len());
    params_vec.push(&session_id);
    for id in pinned_ids.iter() {
        params_vec.push(id);
    }

    let mrows = mstmt
        .query_map(params_vec.as_slice(), |r| {
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
                r.get::<_, Option<String>>(11)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut raw_messages = Vec::new();
    let mut message_ids: Vec<String> = Vec::new();
    for row in mrows {
        let tuple = row.map_err(|e| e.to_string())?;
        message_ids.push(tuple.0.clone());
        raw_messages.push(tuple);
    }

    let mut variants_by_message: HashMap<String, Vec<JsonValue>> = HashMap::new();
    if !message_ids.is_empty() {
        let placeholders = message_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let vsql = format!(
            "SELECT message_id, id, content, created_at, prompt_tokens, completion_tokens, total_tokens, reasoning FROM message_variants WHERE message_id IN ({}) ORDER BY created_at ASC",
            placeholders
        );
        let mut vstmt = conn.prepare(&vsql).map_err(|e| e.to_string())?;
        let vrows = vstmt
            .query_map(rusqlite::params_from_iter(message_ids.iter()), |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, Option<i64>>(5)?,
                    r.get::<_, Option<i64>>(6)?,
                    r.get::<_, Option<String>>(7)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for vr in vrows {
            let (message_id, vid, vcontent, vcreated, vp, vc, vt, vreasoning) =
                vr.map_err(|e| e.to_string())?;
            variants_by_message.entry(message_id).or_default().push({
                let mut vobj = JsonMap::new();
                vobj.insert("id".into(), JsonValue::String(vid));
                if let Some(r) = vreasoning {
                    vobj.insert("reasoning".into(), JsonValue::String(r));
                }
                vobj.insert("content".into(), JsonValue::String(vcontent));
                vobj.insert("createdAt".into(), JsonValue::from(vcreated));
                if let Some(usage) = json_usage_summary(vp, vc, vt) {
                    vobj.insert("usage".into(), usage);
                }
                JsonValue::Object(vobj)
            });
        }
    }

    let mut out: Vec<JsonValue> = Vec::with_capacity(raw_messages.len());
    for (
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
        reasoning,
    ) in raw_messages
    {
        let mut mobj = JsonMap::new();
        mobj.insert("id".into(), JsonValue::String(mid.clone()));
        mobj.insert("role".into(), JsonValue::String(role));
        mobj.insert("content".into(), JsonValue::String(content));
        mobj.insert("createdAt".into(), JsonValue::from(mcreated));
        if let Some(usage) = json_usage_summary(p_tokens, c_tokens, t_tokens) {
            mobj.insert("usage".into(), usage);
        }
        if let Some(variants) = variants_by_message.get(&mid) {
            if !variants.is_empty() {
                mobj.insert("variants".into(), JsonValue::Array(variants.clone()));
            }
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
        if let Some(att_json) = attachments_json {
            if let Ok(parsed) = serde_json::from_str::<JsonValue>(&att_json) {
                mobj.insert("attachments".into(), parsed);
            }
        }
        if let Some(r) = reasoning {
            mobj.insert("reasoning".into(), JsonValue::String(r));
        }
        out.push(JsonValue::Object(mobj));
    }

    Ok(serde_json::to_string(&out).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn session_upsert_meta(app: tauri::AppHandle, session_json: String) -> Result<(), String> {
    let conn = open_db(&app)?;
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
    let voice_autoplay = s
        .get("voiceAutoplay")
        .and_then(|v| v.as_bool())
        .map(|value| if value { 1 } else { 0 });
    let archived = s.get("archived").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
    let created_at = s
        .get("createdAt")
        .and_then(|v| v.as_i64())
        .unwrap_or(now_ms() as i64);
    let updated_at = now_ms() as i64;

    let memories_json = match s.get("memories") {
        Some(v) => serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()),
        None => "[]".to_string(),
    };
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

    conn.execute(
        r#"INSERT INTO sessions (id, character_id, title, system_prompt, selected_scene_id, persona_id, voice_autoplay, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, memories, memory_embeddings, memory_summary, memory_summary_token_count, memory_tool_events, archived, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              character_id=excluded.character_id,
              title=excluded.title,
              system_prompt=excluded.system_prompt,
              selected_scene_id=excluded.selected_scene_id,
              persona_id=excluded.persona_id,
              voice_autoplay=excluded.voice_autoplay,
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
        params![
            &id,
            character_id,
            title,
            system_prompt,
            selected_scene_id,
            persona_id,
            voice_autoplay,
            temperature,
            top_p,
            max_output_tokens,
            frequency_penalty,
            presence_penalty,
            top_k,
            &memories_json,
            &memory_embeddings_json,
            memory_summary,
            memory_summary_token_count,
            &memory_tool_events_json,
            archived,
            created_at,
            updated_at
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn messages_upsert_batch(
    app: tauri::AppHandle,
    session_id: String,
    messages_json: String,
) -> Result<(), String> {
    let mut conn = open_db(&app)?;
    let v: JsonValue = serde_json::from_str(&messages_json).map_err(|e| e.to_string())?;
    let Some(msgs) = v.as_array() else {
        return Err("messages_json must be a JSON array".to_string());
    };
    let now = now_ms() as i64;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for m in msgs {
        let mid = m
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "message.id is required".to_string())?;
        let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("user");
        let content = m.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let mcreated = m.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(now);
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
        let reasoning = m
            .get("reasoning")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        tx.execute(
            r#"INSERT INTO messages (id, session_id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned, memory_refs, attachments, reasoning)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 session_id=excluded.session_id,
                 role=excluded.role,
                 content=excluded.content,
                 created_at=excluded.created_at,
                 prompt_tokens=excluded.prompt_tokens,
                 completion_tokens=excluded.completion_tokens,
                 total_tokens=excluded.total_tokens,
                 selected_variant_id=excluded.selected_variant_id,
                 is_pinned=excluded.is_pinned,
                 memory_refs=excluded.memory_refs,
                 attachments=excluded.attachments,
                 reasoning=excluded.reasoning"#,
            params![
                &mid,
                &session_id,
                role,
                content,
                mcreated,
                pt,
                ct,
                tt,
                selected_variant_id,
                is_pinned,
                memory_refs.to_string(),
                attachments.to_string(),
                reasoning
            ],
        )
        .map_err(|e| e.to_string())?;

        if m.get("variants").is_some() {
            tx.execute(
                "DELETE FROM message_variants WHERE message_id = ?",
                params![&mid],
            )
            .map_err(|e| e.to_string())?;
            if let Some(vars) = m.get("variants").and_then(|v| v.as_array()) {
                for v in vars {
                    let vid = v
                        .get("id")
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                    let vcontent = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
                    let vcreated = v.get("createdAt").and_then(|x| x.as_i64()).unwrap_or(now);
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
                    let vreasoning = v
                        .get("reasoning")
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string());
                    tx.execute(
                        "INSERT INTO message_variants (id, message_id, content, created_at, prompt_tokens, completion_tokens, total_tokens, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        params![vid, &mid, vcontent, vcreated, vp, vc, vt, vreasoning],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
    }

    tx.execute(
        "UPDATE sessions SET updated_at = ? WHERE id = ?",
        params![now, &session_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn message_delete(
    app: tauri::AppHandle,
    session_id: String,
    message_id: String,
) -> Result<(), String> {
    let conn = open_db(&app)?;
    let now = now_ms() as i64;
    conn.execute(
        "DELETE FROM messages WHERE id = ? AND session_id = ?",
        params![&message_id, &session_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE sessions SET updated_at = ? WHERE id = ?",
        params![now, &session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn messages_delete_after(
    app: tauri::AppHandle,
    session_id: String,
    message_id: String,
) -> Result<(), String> {
    let mut conn = open_db(&app)?;
    let now = now_ms() as i64;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let ids: Vec<String> = {
        let mut stmt = tx
            .prepare("SELECT id FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![&session_id], |r| Ok(r.get::<_, String>(0)?))
            .map_err(|e| e.to_string())?;
        let mut ids: Vec<String> = Vec::new();
        for row in rows {
            ids.push(row.map_err(|e| e.to_string())?);
        }
        ids
    };

    let Some(pos) = ids.iter().position(|id| id == &message_id) else {
        return Err("Message not found in session".to_string());
    };

    let to_delete = &ids[(pos + 1)..];
    for id in to_delete {
        tx.execute(
            "DELETE FROM messages WHERE id = ? AND session_id = ?",
            params![id, &session_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.execute(
        "UPDATE sessions SET updated_at = ? WHERE id = ?",
        params![now, &session_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
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
    let voice_autoplay = s
        .get("voiceAutoplay")
        .and_then(|v| v.as_bool())
        .map(|value| if value { 1 } else { 0 });
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

    // Debug log
    log_warn(
        &app,
        "session_upsert",
        format!(
            "Saving session {}. Memory summary present: {}, value: {:?}",
            id,
            memory_summary.is_some(),
            memory_summary
        ),
    );
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
        r#"INSERT INTO sessions (id, character_id, title, system_prompt, selected_scene_id, persona_id, voice_autoplay, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, memories, memory_embeddings, memory_summary, memory_summary_token_count, memory_tool_events, archived, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              character_id=excluded.character_id,
              title=excluded.title,
              system_prompt=excluded.system_prompt,
              selected_scene_id=excluded.selected_scene_id,
              persona_id=excluded.persona_id,
              voice_autoplay=excluded.voice_autoplay,
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
        params![&id, character_id, title, system_prompt, selected_scene_id, persona_id, voice_autoplay, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, &memories_json, &memory_embeddings_json, memory_summary, memory_summary_token_count, &memory_tool_events_json, archived, created_at, updated_at],
    ).map_err(|e| e.to_string())?;

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
            let reasoning = m
                .get("reasoning")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            tx.execute(
                r#"INSERT INTO messages (id, session_id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned, memory_refs, attachments, reasoning)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     session_id=excluded.session_id,
                     role=excluded.role,
                     content=excluded.content,
                     created_at=excluded.created_at,
                     prompt_tokens=excluded.prompt_tokens,
                     completion_tokens=excluded.completion_tokens,
                     total_tokens=excluded.total_tokens,
                     selected_variant_id=excluded.selected_variant_id,
                     is_pinned=excluded.is_pinned,
                     memory_refs=excluded.memory_refs,
                     attachments=excluded.attachments,
                     reasoning=excluded.reasoning"#,
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
                    attachments.to_string(),
                    reasoning
                ],
            ).map_err(|e| e.to_string())?;

            if m.get("variants").is_some() {
                tx.execute(
                    "DELETE FROM message_variants WHERE message_id = ?",
                    params![&mid],
                )
                .map_err(|e| e.to_string())?;
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
                        let vreasoning = v
                            .get("reasoning")
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string());
                        tx.execute(
                            "INSERT INTO message_variants (id, message_id, content, created_at, prompt_tokens, completion_tokens, total_tokens, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                            params![vid, &mid, vcontent, vcreated, vp, vc, vt, vreasoning],
                        )
                        .map_err(|e| e.to_string())?;
                    }
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
pub fn message_toggle_pin_state(
    app: tauri::AppHandle,
    session_id: String,
    message_id: String,
) -> Result<Option<bool>, String> {
    let conn = open_db(&app)?;
    let now = now_ms() as i64;
    let current: Option<i64> = conn
        .query_row(
            "SELECT is_pinned FROM messages WHERE id = ? AND session_id = ?",
            params![&message_id, &session_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(is_pinned) = current {
        let next = if is_pinned == 0 { 1 } else { 0 };
        conn.execute(
            "UPDATE messages SET is_pinned = ? WHERE id = ? AND session_id = ?",
            params![next, &message_id, &session_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            params![now, &session_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(Some(next != 0))
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

    if let Some(json) = read_session_meta(&conn, &session_id)? {
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

    if let Some(json) = read_session_meta(&conn, &session_id)? {
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

    if let Some(json) = read_session_meta(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&json).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}

#[tauri::command]
pub fn session_toggle_memory_pin(
    app: tauri::AppHandle,
    session_id: String,
    memory_index: usize,
) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;

    // Read current memory embeddings
    let current_embeddings_json: String = conn
        .query_row(
            "SELECT memory_embeddings FROM sessions WHERE id = ?",
            params![&session_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "[]".to_string());

    let mut memory_embeddings: Vec<JsonValue> =
        serde_json::from_str(&current_embeddings_json).unwrap_or_else(|_| vec![]);

    // Toggle pin status at index
    if memory_index < memory_embeddings.len() {
        if let Some(obj) = memory_embeddings
            .get_mut(memory_index)
            .and_then(|v| v.as_object_mut())
        {
            let current_pinned = obj
                .get("isPinned")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            obj.insert("isPinned".into(), JsonValue::Bool(!current_pinned));
        }

        // Save back
        let new_embeddings_json =
            serde_json::to_string(&memory_embeddings).map_err(|e| e.to_string())?;
        let now = now_ms() as i64;

        conn.execute(
            "UPDATE sessions SET memory_embeddings = ?, updated_at = ? WHERE id = ?",
            params![new_embeddings_json, now, &session_id],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(json) = read_session_meta(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&json).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}

#[tauri::command]
pub fn session_set_memory_cold_state(
    app: tauri::AppHandle,
    session_id: String,
    memory_index: usize,
    is_cold: bool,
) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;

    // Read current memories + embeddings so we can keep alignment.
    let (current_memories_json, current_embeddings_json): (String, String) = conn
        .query_row(
            "SELECT memories, memory_embeddings FROM sessions WHERE id = ?",
            params![&session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| ("[]".to_string(), "[]".to_string()));

    let memories: Vec<String> =
        serde_json::from_str(&current_memories_json).unwrap_or_else(|_| vec![]);
    let mut memory_embeddings: Vec<JsonValue> =
        serde_json::from_str(&current_embeddings_json).unwrap_or_else(|_| vec![]);

    if memory_index >= memories.len() {
        if let Some(json) = read_session_meta(&conn, &session_id)? {
            return Ok(Some(
                serde_json::to_string(&json).map_err(|e| e.to_string())?,
            ));
        }
        return Ok(None);
    }

    let now = now_ms() as i64;

    // Ensure embeddings vector is long enough; fill missing entries with placeholders.
    while memory_embeddings.len() <= memory_index {
        let idx = memory_embeddings.len();
        let text = memories.get(idx).cloned().unwrap_or_default();
        memory_embeddings.push(serde_json::json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "text": text,
            "embedding": [],
            "createdAt": now,
            "tokenCount": 0,
        }));
    }

    if let Some(obj) = memory_embeddings
        .get_mut(memory_index)
        .and_then(|v| v.as_object_mut())
    {
        obj.insert("isCold".into(), JsonValue::Bool(is_cold));
        if is_cold {
            obj.insert("importanceScore".into(), JsonValue::from(0.0));
        } else {
            obj.insert("importanceScore".into(), JsonValue::from(1.0));
            obj.insert("lastAccessedAt".into(), JsonValue::from(now));
        }
    }

    let new_embeddings_json =
        serde_json::to_string(&memory_embeddings).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE sessions SET memory_embeddings = ?, updated_at = ? WHERE id = ?",
        params![new_embeddings_json, now, &session_id],
    )
    .map_err(|e| e.to_string())?;

    if let Some(json) = read_session_meta(&conn, &session_id)? {
        return Ok(Some(
            serde_json::to_string(&json).map_err(|e| e.to_string())?,
        ));
    }
    Ok(None)
}
