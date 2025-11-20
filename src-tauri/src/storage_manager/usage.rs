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
pub async fn storage_reset_database(app: tauri::AppHandle) -> Result<(), String> {
    use super::db::{init_db, init_pool};
    use tauri::Manager;

    // Get the database path
    let db_path = db_path(&app)?;

    // Delete the database file if it exists
    if db_path.exists() {
        fs::remove_file(&db_path).map_err(|e| format!("Failed to delete database: {}", e))?;
    }

    // Delete WAL and SHM files if they exist
    let wal_path = db_path.with_extension("db-wal");
    if wal_path.exists() {
        let _ = fs::remove_file(&wal_path);
    }

    let shm_path = db_path.with_extension("db-shm");
    if shm_path.exists() {
        let _ = fs::remove_file(&shm_path);
    }

    // Delete embedding model files
    let lettuce_dir = crate::utils::lettuce_dir(&app)?;
    let model_dir = lettuce_dir.join("models").join("embedding");
    if model_dir.exists() {
        fs::remove_dir_all(&model_dir)
            .map_err(|e| format!("Failed to delete embedding models: {}", e))?;
    }

    // Reset the download state since we deleted the model files
    crate::embedding_model::reset_download_state().await;

    // Re-initialize the database pool
    let pool = init_pool(&app)?;
    let conn = pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    // Initialize the schema
    init_db(&app, &conn)?;

    // Update the app state with the new pool
    {
        let _ = app.manage(pool);
    }

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
