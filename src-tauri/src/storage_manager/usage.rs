use rusqlite::OptionalExtension;
use std::fs;

use super::db::{db_path, open_db};
use super::legacy::storage_root;
use crate::utils::now_millis;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsageSummary {
    pub file_count: usize,
    pub estimated_sessions: usize,
    pub last_updated_ms: Option<u64>,
}

#[tauri::command]
pub fn storage_clear_all(app: tauri::AppHandle) -> Result<(), String> {
    let dir = storage_root(&app)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn storage_usage_summary(app: tauri::AppHandle) -> Result<StorageUsageSummary, String> {
    let mut file_count = 0usize;
    let mut latest: Option<u64> = None;
    let db = db_path(&app)?;
    if db.exists() {
        file_count += 1;
        if let Ok(metadata) = fs::metadata(&db) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(ms) = modified.duration_since(std::time::UNIX_EPOCH) {
                    let ts = ms.as_millis() as u64;
                    latest = Some(latest.map_or(ts, |cur| cur.max(ts)));
                }
            }
        }
    }
    let conn = open_db(&app)?;
    let session_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
        .unwrap_or(0);
    let settings_updated: Option<i64> = conn
        .query_row("SELECT updated_at FROM settings WHERE id = 1", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(ts) = settings_updated {
        latest = Some(latest.map_or(ts as u64, |cur| cur.max(ts as u64)));
    }
    for (table, sql) in [
        ("characters", "SELECT MAX(updated_at) FROM characters"),
        ("personas", "SELECT MAX(updated_at) FROM personas"),
        ("sessions", "SELECT MAX(updated_at) FROM sessions"),
    ] {
        let max_ts: Option<i64> = conn
            .query_row(sql, [], |r| r.get(0))
            .optional()
            .map_err(|e| format!("{}: {}", table, e))?;
        if let Some(ts) = max_ts {
            latest = Some(latest.map_or(ts as u64, |cur| cur.max(ts as u64)));
        }
    }
    let last_updated_ms = latest.or_else(|| now_millis().ok());
    Ok(StorageUsageSummary {
        file_count: file_count as usize,
        estimated_sessions: session_count as usize,
        last_updated_ms,
    })
}
