use rusqlite::params;
use serde_json::{Map as JsonMap, Value as JsonValue};

use super::db::open_db;

#[tauri::command]
pub fn provider_upsert(app: tauri::AppHandle, credential_json: String) -> Result<String, String> {
    let conn = open_db(&app)?;
    let cred: JsonValue = serde_json::from_str(&credential_json).map_err(|e| e.to_string())?;
    let id = cred.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let provider_id = cred.get("providerId").and_then(|v| v.as_str()).ok_or_else(|| "providerId is required".to_string())?;
    let label = cred.get("label").and_then(|v| v.as_str()).ok_or_else(|| "label is required".to_string())?;
    let api_key_ref = cred.get("apiKeyRef").map(|v| serde_json::to_string(v).unwrap_or("null".into()));
    let base_url = cred.get("baseUrl").and_then(|v| v.as_str()).map(|s| s.to_string());
    let default_model = cred.get("defaultModel").and_then(|v| v.as_str()).map(|s| s.to_string());
    let headers = cred.get("headers").map(|v| serde_json::to_string(v).unwrap_or("null".into()));
    conn.execute(
        r#"INSERT INTO provider_credentials (id, provider_id, label, api_key_ref, base_url, default_model, headers)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                provider_id = excluded.provider_id,
                label = excluded.label,
                api_key_ref = excluded.api_key_ref,
                base_url = excluded.base_url,
                default_model = excluded.default_model,
                headers = excluded.headers"#,
        params![id, provider_id, label, api_key_ref, base_url, default_model, headers],
    ).map_err(|e| e.to_string())?;

    let mut out = JsonMap::new();
    out.insert("id".into(), JsonValue::String(id));
    out.insert("providerId".into(), JsonValue::String(provider_id.to_string()));
    out.insert("label".into(), JsonValue::String(label.to_string()));
    if let Some(v) = cred.get("apiKeyRef").cloned() { if !v.is_null() { out.insert("apiKeyRef".into(), v); } }
    if let Some(v) = cred.get("baseUrl").and_then(|v| v.as_str()).map(|s| JsonValue::String(s.to_string())) { out.insert("baseUrl".into(), v); }
    if let Some(v) = cred.get("defaultModel").and_then(|v| v.as_str()).map(|s| JsonValue::String(s.to_string())) { out.insert("defaultModel".into(), v); }
    if let Some(v) = cred.get("headers").cloned() { if !v.is_null() { out.insert("headers".into(), v); } }
    Ok(serde_json::to_string(&JsonValue::Object(out)).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn provider_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM provider_credentials WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

