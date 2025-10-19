use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::utils::ensure_lettuce_dir;

const MODELS_CACHE_FILE: &str = "models_cache.json";
const CACHE_TTL_HOURS: u64 = 6;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsCacheEntry {
    pub id: String,
    pub pricing: Option<crate::usage_tracking::ModelPricing>,
    pub cached_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsCache {
    pub models: HashMap<String, ModelsCacheEntry>,
    pub last_updated: u64,
}

impl Default for ModelsCache {
    fn default() -> Self {
        Self {
            models: HashMap::new(),
            last_updated: 0,
        }
    }
}

fn cache_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(ensure_lettuce_dir(app)?.join(MODELS_CACHE_FILE))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn load_models_cache(app: &AppHandle) -> Result<ModelsCache, String> {
    let path = cache_path(app)?;
    
    if !path.exists() {
        return Ok(ModelsCache::default());
    }
    
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read models cache: {}", e))?;
    
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse models cache: {}", e))
}

pub fn save_models_cache(app: &AppHandle, cache: &ModelsCache) -> Result<(), String> {
    let path = cache_path(app)?;
    let content = serde_json::to_string_pretty(cache)
        .map_err(|e| format!("Failed to serialize models cache: {}", e))?;
    
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write models cache: {}", e))
}

pub fn get_cached_pricing(app: &AppHandle, model_id: &str) -> Result<Option<crate::usage_tracking::ModelPricing>, String> {
    let cache = load_models_cache(app)?;
    let current_time = now_secs();
    
    if let Some(entry) = cache.models.get(model_id) {
        let cache_age = current_time.saturating_sub(entry.cached_at);
        if cache_age < (CACHE_TTL_HOURS * 3600) {
            return Ok(entry.pricing.clone());
        }
    }
    
    Ok(None)
}

pub fn cache_model_pricing(
    app: &AppHandle,
    model_id: &str,
    pricing: Option<crate::usage_tracking::ModelPricing>,
) -> Result<(), String> {
    let mut cache = load_models_cache(app)?;
    let now = now_secs();
    
    cache.models.insert(
        model_id.to_string(),
        ModelsCacheEntry {
            id: model_id.to_string(),
            pricing,
            cached_at: now,
        },
    );
    
    cache.last_updated = now;
    save_models_cache(app, &cache)
}
