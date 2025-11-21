use rusqlite::{params, OptionalExtension};
use serde_json::{Map as JsonMap, Value as JsonValue};

use super::db::{now_ms, open_db};

#[tauri::command]
pub fn model_upsert(app: tauri::AppHandle, model_json: String) -> Result<String, String> {
    let conn = open_db(&app)?;
    let model: JsonValue = serde_json::from_str(&model_json).map_err(|e| e.to_string())?;
    let id = model
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let name = model
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "name is required".to_string())?;
    let provider_id = model
        .get("providerId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "providerId is required".to_string())?;
    let provider_label = model
        .get("providerLabel")
        .and_then(|v| v.as_str())
        .unwrap_or(provider_id);
    let display_name = model
        .get("displayName")
        .and_then(|v| v.as_str())
        .unwrap_or(name);
    let adv = model
        .get("advancedModelSettings")
        .map(|v| serde_json::to_string(v).unwrap_or("null".into()));
    let prompt_template_id = model
        .get("promptTemplateId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let system_prompt = model
        .get("systemPrompt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let existing_created: Option<i64> = conn
        .query_row(
            "SELECT created_at FROM models WHERE id = ?",
            params![&id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let created_at = existing_created.unwrap_or(now_ms() as i64);
    conn.execute(
        r#"INSERT INTO models (id, name, provider_id, provider_label, display_name, created_at, advanced_model_settings, prompt_template_id, system_prompt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,
              provider_id=excluded.provider_id,
              provider_label=excluded.provider_label,
              display_name=excluded.display_name,
              advanced_model_settings=excluded.advanced_model_settings,
              prompt_template_id=excluded.prompt_template_id,
              system_prompt=excluded.system_prompt"#,
        params![id, name, provider_id, provider_label, display_name, created_at, adv, prompt_template_id, system_prompt],
    ).map_err(|e| e.to_string())?;
    let mut out = JsonMap::new();
    out.insert("id".into(), JsonValue::String(id));
    out.insert("name".into(), JsonValue::String(name.to_string()));
    out.insert(
        "providerId".into(),
        JsonValue::String(provider_id.to_string()),
    );
    out.insert(
        "providerLabel".into(),
        JsonValue::String(provider_label.to_string()),
    );
    out.insert(
        "displayName".into(),
        JsonValue::String(display_name.to_string()),
    );
    out.insert("createdAt".into(), JsonValue::from(created_at));
    if let Some(v) = model.get("advancedModelSettings").cloned() {
        if !v.is_null() {
            out.insert("advancedModelSettings".into(), v);
        }
    }
    if let Some(v) = model
        .get("promptTemplateId")
        .and_then(|v| v.as_str())
        .map(|s| JsonValue::String(s.to_string()))
    {
        out.insert("promptTemplateId".into(), v);
    }
    if let Some(v) = model
        .get("systemPrompt")
        .and_then(|v| v.as_str())
        .map(|s| JsonValue::String(s.to_string()))
    {
        out.insert("systemPrompt".into(), v);
    }
    Ok(serde_json::to_string(&JsonValue::Object(out)).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn model_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM models WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
