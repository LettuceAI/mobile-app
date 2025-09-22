use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::utils::{ensure_lettuce_dir, now_millis};

#[derive(Serialize, Deserialize, Default)]
struct ModelsCacheFile {
    entries: HashMap<String, ModelsCacheEntry>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ModelsCacheEntry {
    models: Vec<String>,
    fetched_at: u64,
}

fn models_cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_lettuce_dir(app)?.join("models-cache.json"))
}

fn read_models_cache(app: &tauri::AppHandle) -> Result<ModelsCacheFile, String> {
    let path = models_cache_path(app)?;
    if !path.exists() {
        return Ok(ModelsCacheFile::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Ok(ModelsCacheFile::default());
    }
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn write_models_cache(app: &tauri::AppHandle, cache: &ModelsCacheFile) -> Result<(), String> {
    let path = models_cache_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(cache).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn models_cache_get(
    app: tauri::AppHandle,
    cred_id: String,
    max_age_ms: Option<u64>,
) -> Result<Option<Vec<String>>, String> {
    let cache = read_models_cache(&app)?;
    let entry = match cache.entries.get(&cred_id) {
        Some(e) => e,
        None => return Ok(None),
    };
    if let Some(ttl) = max_age_ms {
        let now = now_millis()?;
        if now.saturating_sub(entry.fetched_at) > ttl {
            return Ok(None);
        }
    }
    Ok(Some(entry.models.clone()))
}

#[tauri::command]
pub fn models_cache_update(
    app: tauri::AppHandle,
    cred_id: String,
    models: Vec<String>,
) -> Result<(), String> {
    let mut cache = read_models_cache(&app)?;
    cache.entries.insert(
        cred_id,
        ModelsCacheEntry {
            models,
            fetched_at: now_millis()?,
        },
    );
    write_models_cache(&app, &cache)
}
