use rusqlite::{params, OptionalExtension};

use crate::storage_manager::db::{now_ms, open_db};
use crate::utils::SERVICE;

fn compose_keys(service: &str, account: &str) -> (String, String) {
    (service.to_string(), account.to_string())
}

#[tauri::command]
pub fn secret_get(
    app: tauri::AppHandle,
    service: String,
    account: String,
) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;
    let (svc, acc) = compose_keys(&service, &account);
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM secrets WHERE service = ?1 AND account = ?2",
            params![svc, acc],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(value)
}

#[tauri::command]
pub fn secret_set(
    app: tauri::AppHandle,
    service: String,
    account: String,
    value: String,
) -> Result<(), String> {
    let conn = open_db(&app)?;
    let (svc, acc) = compose_keys(&service, &account);
    let now = now_ms();
    conn.execute(
        "INSERT INTO secrets (service, account, value, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(service, account) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![svc, acc, value, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn secret_delete(
    app: tauri::AppHandle,
    service: String,
    account: String,
) -> Result<(), String> {
    let conn = open_db(&app)?;
    let (svc, acc) = compose_keys(&service, &account);
    conn.execute(
        "DELETE FROM secrets WHERE service = ?1 AND account = ?2",
        params![svc, acc],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn secret_for_cred_get(
    app: tauri::AppHandle,
    provider_id: String,
    cred_id: String,
    key: String,
) -> Result<Option<String>, String> {
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    secret_get(app, service, account)
}

#[tauri::command]
pub fn secret_for_cred_set(
    app: tauri::AppHandle,
    provider_id: String,
    cred_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    secret_set(app, service, account, value)
}

#[tauri::command]
pub fn secret_for_cred_delete(
    app: tauri::AppHandle,
    provider_id: String,
    cred_id: String,
    key: String,
) -> Result<(), String> {
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    secret_delete(app, service, account)
}

// Internal helper (non-command) for other Rust modules to read secrets without exposing new commands.
pub(crate) fn internal_secret_for_cred_get(
    app: &tauri::AppHandle,
    provider_id: String,
    cred_id: String,
    key: String,
) -> Result<Option<String>, String> {
    let conn = open_db(app)?;
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    conn
        .query_row(
            "SELECT value FROM secrets WHERE service = ?1 AND account = ?2",
            params![service, account],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
}
