use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::storage_manager::db::open_db;
use rusqlite::OptionalExtension;
const CACHE_TTL_HOURS: u64 = 6;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn get_cached_pricing(
    app: &AppHandle,
    model_id: &str,
) -> Result<Option<crate::models::ModelPricing>, String> {
    let conn = open_db(app)?;
    let row: Option<(Option<String>, u64)> = conn
        .query_row(
            "SELECT pricing_json, cached_at FROM model_pricing_cache WHERE model_id = ?1",
            rusqlite::params![model_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    if let Some((pricing_json_opt, cached_at)) = row {
        let current_time = now_secs();
        let cache_age = current_time.saturating_sub(cached_at);
        if cache_age < (CACHE_TTL_HOURS * 3600) {
            if let Some(pricing_json) = pricing_json_opt {
                let pricing: crate::models::ModelPricing = serde_json::from_str(&pricing_json)
                    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
                return Ok(Some(pricing));
            } else {
                return Ok(None);
            }
        }
    }

    Ok(None)
}

pub fn cache_model_pricing(
    app: &AppHandle,
    model_id: &str,
    pricing: Option<crate::models::ModelPricing>,
) -> Result<(), String> {
    let conn = open_db(app)?;
    let now = now_secs();
    let pricing_json = match pricing {
        Some(ref p) => Some(
            serde_json::to_string(p)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?,
        ),
        None => None,
    };
    conn.execute(
        "INSERT INTO model_pricing_cache (model_id, pricing_json, cached_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(model_id) DO UPDATE SET pricing_json = excluded.pricing_json, cached_at = excluded.cached_at",
        rusqlite::params![model_id, pricing_json, now],
    )
    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    Ok(())
}
