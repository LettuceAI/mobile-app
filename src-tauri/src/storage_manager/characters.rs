use rusqlite::{params, OptionalExtension};
use serde_json::{Map as JsonMap, Value as JsonValue};

use super::db::{now_ms, open_db};

fn read_character(conn: &rusqlite::Connection, id: &str) -> Result<JsonValue, String> {
    let (name, avatar_path, bg_path, description, default_scene_id, default_model_id, prompt_template_id, system_prompt, memory_type, disable_avatar_gradient, created_at, updated_at): (String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64, i64) = conn
        .query_row(
            "SELECT name, avatar_path, background_image_path, description, default_scene_id, default_model_id, prompt_template_id, system_prompt, memory_type, disable_avatar_gradient, created_at, updated_at FROM characters WHERE id = ?",
            params![id],
            |r| Ok((
                r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?, r.get::<_, i64>(9)?, r.get(10)?, r.get(11)?
            )),
        )
        .map_err(|e| e.to_string())?;

    // rules
    let mut rules: Vec<JsonValue> = Vec::new();
    let mut stmt = conn
        .prepare("SELECT rule FROM character_rules WHERE character_id = ? ORDER BY idx ASC")
        .map_err(|e| e.to_string())?;
    let q = stmt
        .query_map(params![id], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| e.to_string())?;
    for it in q {
        rules.push(JsonValue::String(it.map_err(|e| e.to_string())?));
    }

    // scenes
    let mut scenes_stmt = conn.prepare("SELECT id, content, created_at, selected_variant_id FROM scenes WHERE character_id = ? ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    let scenes_rows = scenes_stmt
        .query_map(params![id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut scenes: Vec<JsonValue> = Vec::new();
    for row in scenes_rows {
        let (scene_id, content, created_at_s, selected_variant_id) =
            row.map_err(|e| e.to_string())?;
        // variants
        let mut var_stmt = conn.prepare("SELECT id, content, created_at FROM scene_variants WHERE scene_id = ? ORDER BY created_at ASC").map_err(|e| e.to_string())?;
        let var_rows = var_stmt
            .query_map(params![&scene_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut variants: Vec<JsonValue> = Vec::new();
        for v in var_rows {
            let (vid, vcontent, vcreated) = v.map_err(|e| e.to_string())?;
            variants
                .push(serde_json::json!({"id": vid, "content": vcontent, "createdAt": vcreated}));
        }
        let mut obj = JsonMap::new();
        obj.insert("id".into(), JsonValue::String(scene_id));
        obj.insert("content".into(), JsonValue::String(content));
        obj.insert("createdAt".into(), JsonValue::from(created_at_s));
        if !variants.is_empty() {
            obj.insert("variants".into(), JsonValue::Array(variants));
        }
        if let Some(sel) = selected_variant_id {
            obj.insert("selectedVariantId".into(), JsonValue::String(sel));
        }
        scenes.push(JsonValue::Object(obj));
    }

    let mut root = JsonMap::new();
    root.insert("id".into(), JsonValue::String(id.to_string()));
    root.insert("name".into(), JsonValue::String(name));
    if let Some(a) = avatar_path {
        root.insert("avatarPath".into(), JsonValue::String(a));
    }
    if let Some(b) = bg_path {
        root.insert("backgroundImagePath".into(), JsonValue::String(b));
    }
    if let Some(d) = description {
        root.insert("description".into(), JsonValue::String(d));
    }
    root.insert("rules".into(), JsonValue::Array(rules));
    root.insert("scenes".into(), JsonValue::Array(scenes));
    if let Some(ds) = default_scene_id {
        root.insert("defaultSceneId".into(), JsonValue::String(ds));
    }
    if let Some(dm) = default_model_id {
        root.insert("defaultModelId".into(), JsonValue::String(dm));
    }
    let memory_value = memory_type.unwrap_or_else(|| "manual".to_string());
    root.insert("memoryType".into(), JsonValue::String(memory_value));
    if let Some(pt) = prompt_template_id {
        root.insert("promptTemplateId".into(), JsonValue::String(pt));
    }
    if let Some(sp) = system_prompt {
        root.insert("systemPrompt".into(), JsonValue::String(sp));
    }
    root.insert(
        "disableAvatarGradient".into(),
        JsonValue::Bool(disable_avatar_gradient != 0),
    );
    root.insert("createdAt".into(), JsonValue::from(created_at));
    root.insert("updatedAt".into(), JsonValue::from(updated_at));
    Ok(JsonValue::Object(root))
}

#[tauri::command]
pub fn characters_list(app: tauri::AppHandle) -> Result<String, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id FROM characters ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for id in rows {
        let id = id.map_err(|e| e.to_string())?;
        out.push(read_character(&conn, &id)?);
    }
    Ok(serde_json::to_string(&out).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn character_upsert(app: tauri::AppHandle, character_json: String) -> Result<String, String> {
    let mut conn = open_db(&app)?;
    let c: JsonValue = serde_json::from_str(&character_json).map_err(|e| e.to_string())?;
    let id = c
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let name = c
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "name is required".to_string())?;
    let avatar_path = c
        .get("avatarPath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let bg_path = c
        .get("backgroundImagePath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let description = c
        .get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let default_model_id = c
        .get("defaultModelId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let prompt_template_id = c
        .get("promptTemplateId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let system_prompt = c
        .get("systemPrompt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let memory_type = match c.get("memoryType").and_then(|v| v.as_str()) {
        Some("dynamic") => "dynamic".to_string(),
        _ => "manual".to_string(),
    };
    let disable_avatar_gradient = c
        .get("disableAvatarGradient")
        .and_then(|v| v.as_bool())
        .unwrap_or(false) as i64;
    let now = now_ms() as i64;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let existing_created: Option<i64> = tx
        .query_row(
            "SELECT created_at FROM characters WHERE id = ?",
            params![&id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let created_at = existing_created.unwrap_or(now);

    tx.execute(
        r#"INSERT INTO characters (id, name, avatar_path, background_image_path, description, default_scene_id, default_model_id, prompt_template_id, system_prompt, memory_type, disable_avatar_gradient, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,
              avatar_path=excluded.avatar_path,
              background_image_path=excluded.background_image_path,
              description=excluded.description,
              default_model_id=excluded.default_model_id,
              prompt_template_id=excluded.prompt_template_id,
              system_prompt=excluded.system_prompt,
              memory_type=excluded.memory_type,
              disable_avatar_gradient=excluded.disable_avatar_gradient,
              updated_at=excluded.updated_at"#,
        params![id, name, avatar_path, bg_path, description, default_model_id, prompt_template_id, system_prompt, memory_type, disable_avatar_gradient, created_at, now],
    ).map_err(|e| e.to_string())?;

    // Replace rules
    tx.execute(
        "DELETE FROM character_rules WHERE character_id = ?",
        params![&id],
    )
    .map_err(|e| e.to_string())?;
    if let Some(rules) = c.get("rules").and_then(|v| v.as_array()) {
        for (idx, rule) in rules.iter().enumerate() {
            if let Some(text) = rule.as_str() {
                tx.execute(
                    "INSERT INTO character_rules (character_id, idx, rule) VALUES (?, ?, ?)",
                    params![&id, idx as i64, text],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    // Delete existing scenes (cascade variants)
    let scene_ids: Vec<String> = {
        let mut s = tx
            .prepare("SELECT id FROM scenes WHERE character_id = ?")
            .map_err(|e| e.to_string())?;
        let rows = s
            .query_map(params![&id], |r| Ok(r.get::<_, String>(0)?))
            .map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for it in rows {
            v.push(it.map_err(|e| e.to_string())?);
        }
        v
    };
    for sid in scene_ids {
        tx.execute("DELETE FROM scenes WHERE id = ?", params![sid])
            .map_err(|e| e.to_string())?;
    }

    // Insert scenes
    let mut new_default_scene_id: Option<String> = c
        .get("defaultSceneId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if let Some(scenes) = c.get("scenes").and_then(|v| v.as_array()) {
        for (i, s) in scenes.iter().enumerate() {
            let sid = s
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let content = s.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let created_at_s = s.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(now);
            let selected_variant_id = s
                .get("selectedVariantId")
                .and_then(|v| v.as_str())
                .map(|x| x.to_string());
            tx.execute("INSERT INTO scenes (id, character_id, content, created_at, selected_variant_id) VALUES (?, ?, ?, ?, ?)", params![&sid, &id, content, created_at_s, selected_variant_id]).map_err(|e| e.to_string())?;
            if i == 0 && new_default_scene_id.is_none() {
                new_default_scene_id = Some(sid.clone());
            }
            if let Some(vars) = s.get("variants").and_then(|v| v.as_array()) {
                for v in vars {
                    let vid = v
                        .get("id")
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                    let vcontent = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
                    let vcreated = v.get("createdAt").and_then(|x| x.as_i64()).unwrap_or(now);
                    tx.execute("INSERT INTO scene_variants (id, scene_id, content, created_at) VALUES (?, ?, ?, ?)", params![vid, &sid, vcontent, vcreated]).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    tx.execute(
        "UPDATE characters SET default_scene_id = ? WHERE id = ?",
        params![new_default_scene_id, &id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    let conn2 = open_db(&app)?;
    read_character(&conn2, &id).and_then(|v| serde_json::to_string(&v).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn character_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM characters WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
