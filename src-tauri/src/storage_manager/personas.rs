use rusqlite::{params, OptionalExtension};
use serde_json::{Map as JsonMap, Value as JsonValue};

use super::db::{now_ms, open_db};

#[tauri::command]
pub fn personas_list(app: tauri::AppHandle) -> Result<String, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT id, title, description, avatar_path, is_default, created_at, updated_at FROM personas ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let (id, title, description, avatar_path, is_default, created_at, updated_at) =
            row.map_err(|e| e.to_string())?;
        let mut obj = JsonMap::new();
        obj.insert("id".into(), JsonValue::String(id));
        obj.insert("title".into(), JsonValue::String(title.to_string()));
        obj.insert(
            "description".into(),
            JsonValue::String(description.to_string()),
        );
        if let Some(a) = avatar_path {
            obj.insert("avatarPath".into(), JsonValue::String(a));
        }
        obj.insert("isDefault".into(), JsonValue::Bool(is_default != 0));
        obj.insert("createdAt".into(), JsonValue::from(created_at));
        obj.insert("updatedAt".into(), JsonValue::from(updated_at));
        out.push(JsonValue::Object(obj));
    }
    Ok(serde_json::to_string(&out).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn persona_upsert(app: tauri::AppHandle, persona_json: String) -> Result<String, String> {
    let mut conn = open_db(&app)?;
    let p: JsonValue = serde_json::from_str(&persona_json).map_err(|e| e.to_string())?;
    let id = p
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let title = p
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "title is required".to_string())?;
    let description = p
        .get("description")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "description is required".to_string())?;
    let avatar_path = p
        .get("avatarPath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let is_default = p
        .get("isDefault")
        .and_then(|v| v.as_bool())
        .unwrap_or(false) as i64;
    let now = now_ms() as i64;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let existing_created: Option<i64> = tx
        .query_row(
            "SELECT created_at FROM personas WHERE id = ?",
            params![&id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let created_at = existing_created.unwrap_or(now);

    tx.execute(
        r#"INSERT INTO personas (id, title, description, avatar_path, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title=excluded.title,
              description=excluded.description,
              avatar_path=excluded.avatar_path,
              is_default=excluded.is_default,
              updated_at=excluded.updated_at"#,
        params![&id, title, description, avatar_path, is_default, created_at, now],
    ).map_err(|e| e.to_string())?;

    if is_default != 0 {
        tx.execute(
            "UPDATE personas SET is_default = 0 WHERE id <> ?",
            params![&id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    let mut obj = JsonMap::new();
    obj.insert("id".into(), JsonValue::String(id));
    obj.insert("title".into(), JsonValue::String(title.to_string()));
    obj.insert(
        "description".into(),
        JsonValue::String(description.to_string()),
    );
    if let Some(a) = avatar_path {
        obj.insert("avatarPath".into(), JsonValue::String(a));
    }
    obj.insert("isDefault".into(), JsonValue::Bool(is_default != 0));
    obj.insert("createdAt".into(), JsonValue::from(created_at));
    obj.insert("updatedAt".into(), JsonValue::from(now));
    Ok(serde_json::to_string(&JsonValue::Object(obj)).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn persona_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM personas WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn persona_default_get(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;
    let row = conn.query_row("SELECT id, title, description, avatar_path, is_default, created_at, updated_at FROM personas WHERE is_default = 1 LIMIT 1", [], |r| Ok((
        r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, i64>(4)?, r.get::<_, i64>(5)?, r.get::<_, i64>(6)?
    ))).optional().map_err(|e| e.to_string())?;
    if let Some((id, title, description, avatar_path, is_default, created_at, updated_at)) = row {
        let mut obj = JsonMap::new();
        obj.insert("id".into(), JsonValue::String(id));
        obj.insert("title".into(), JsonValue::String(title.to_string()));
        obj.insert(
            "description".into(),
            JsonValue::String(description.to_string()),
        );
        if let Some(a) = avatar_path {
            obj.insert("avatarPath".into(), JsonValue::String(a));
        }
        obj.insert("isDefault".into(), JsonValue::Bool(is_default != 0));
        obj.insert("createdAt".into(), JsonValue::from(created_at));
        obj.insert("updatedAt".into(), JsonValue::from(updated_at));
        Ok(Some(
            serde_json::to_string(&JsonValue::Object(obj)).map_err(|e| e.to_string())?,
        ))
    } else {
        Ok(None)
    }
}
