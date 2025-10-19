use std::collections::HashMap;
use std::fs;
use tauri::AppHandle;

use crate::usage_tracking::{RequestUsage, UsageFilter, UsageStats, ProviderStats, ModelStats, CharacterStats};
use crate::utils::{log_backend, ensure_lettuce_dir};

const USAGE_LOG_FILE: &str = "usage_log.json";

fn usage_log_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(ensure_lettuce_dir(app)?.join(USAGE_LOG_FILE))
}

pub fn load_usage_log(app: &AppHandle) -> Result<Vec<RequestUsage>, String> {
    let path = usage_log_path(app)?;
    
    if !path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read usage log: {}", e))?;
    
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse usage log: {}", e))
}

pub fn save_usage_log(app: &AppHandle, usage_log: &[RequestUsage]) -> Result<(), String> {
    let path = usage_log_path(app)?;
    let content = serde_json::to_string_pretty(usage_log)
        .map_err(|e| format!("Failed to serialize usage log: {}", e))?;
    
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write usage log: {}", e))
}

pub fn add_usage_record(app: &AppHandle, usage: RequestUsage) -> Result<(), String> {
    let mut log = load_usage_log(app)?;
    
    log_backend(
        app,
        "usage_tracking",
        format!(
            "Recording usage: model={} provider={} tokens={:?} cost={:?} success={}",
            usage.model_name,
            usage.provider_id,
            usage.total_tokens,
            usage.cost.as_ref().map(|c| c.total_cost),
            usage.success
        ),
    );
    
    log.push(usage);
    save_usage_log(app, &log)
}

pub fn query_usage_records(
    app: &AppHandle,
    filter: UsageFilter,
) -> Result<Vec<RequestUsage>, String> {
    let log = load_usage_log(app)?;
    
    Ok(log
        .into_iter()
        .filter(|record| {
            if let Some(start) = filter.start_timestamp {
                if record.timestamp < start {
                    return false;
                }
            }
            
            if let Some(end) = filter.end_timestamp {
                if record.timestamp > end {
                    return false;
                }
            }
            
            if let Some(provider) = &filter.provider_id {
                if &record.provider_id != provider {
                    return false;
                }
            }
            
            if let Some(model) = &filter.model_id {
                if &record.model_id != model {
                    return false;
                }
            }
            
            if let Some(character) = &filter.character_id {
                if &record.character_id != character {
                    return false;
                }
            }
            
            if let Some(session) = &filter.session_id {
                if &record.session_id != session {
                    return false;
                }
            }
            
            if let Some(true) = filter.success_only {
                if !record.success {
                    return false;
                }
            }
            
            true
        })
        .collect())
}

pub fn calculate_usage_stats(
    app: &AppHandle,
    filter: UsageFilter,
) -> Result<UsageStats, String> {
    let records = query_usage_records(app, filter)?;
    
    let mut stats = UsageStats {
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        total_tokens: 0,
        total_cost: 0.0,
        average_cost_per_request: 0.0,
        by_provider: HashMap::new(),
        by_model: HashMap::new(),
        by_character: HashMap::new(),
    };
    
    for record in records {
        stats.total_requests += 1;
        
        if record.success {
            stats.successful_requests += 1;
        } else {
            stats.failed_requests += 1;
        }
        
        if let Some(tokens) = record.total_tokens {
            stats.total_tokens += tokens;
        }
        
        if let Some(cost) = &record.cost {
            stats.total_cost += cost.total_cost;
        }
        
        // Provider stats
        let provider_stats = stats
            .by_provider
            .entry(record.provider_id.clone())
            .or_insert_with(|| ProviderStats {
                total_requests: 0,
                successful_requests: 0,
                total_tokens: 0,
                total_cost: 0.0,
            });
        
        provider_stats.total_requests += 1;
        if record.success {
            provider_stats.successful_requests += 1;
        }
        if let Some(tokens) = record.total_tokens {
            provider_stats.total_tokens += tokens;
        }
        if let Some(cost) = &record.cost {
            provider_stats.total_cost += cost.total_cost;
        }
        
        // Model stats
        let model_stats = stats
            .by_model
            .entry(record.model_id.clone())
            .or_insert_with(|| ModelStats {
                provider_id: record.provider_id.clone(),
                total_requests: 0,
                successful_requests: 0,
                total_tokens: 0,
                total_cost: 0.0,
            });
        
        model_stats.total_requests += 1;
        if record.success {
            model_stats.successful_requests += 1;
        }
        if let Some(tokens) = record.total_tokens {
            model_stats.total_tokens += tokens;
        }
        if let Some(cost) = &record.cost {
            model_stats.total_cost += cost.total_cost;
        }
        
        // Character stats
        let char_stats = stats
            .by_character
            .entry(record.character_id.clone())
            .or_insert_with(|| CharacterStats {
                total_requests: 0,
                successful_requests: 0,
                total_tokens: 0,
                total_cost: 0.0,
            });
        
        char_stats.total_requests += 1;
        if record.success {
            char_stats.successful_requests += 1;
        }
        if let Some(tokens) = record.total_tokens {
            char_stats.total_tokens += tokens;
        }
        if let Some(cost) = &record.cost {
            char_stats.total_cost += cost.total_cost;
        }
    }
    
    if stats.total_requests > 0 {
        stats.average_cost_per_request = stats.total_cost / stats.total_requests as f64;
    }
    
    Ok(stats)
}

pub fn clear_usage_records_before(app: &AppHandle, timestamp: u64) -> Result<u64, String> {
    let log = load_usage_log(app)?;
    let original_count = log.len() as u64;
    
    let filtered: Vec<_> = log
        .into_iter()
        .filter(|r| r.timestamp >= timestamp)
        .collect();
    
    let deleted_count = original_count - filtered.len() as u64;
    
    save_usage_log(app, &filtered)?;
    
    log_backend(
        app,
        "usage_tracking",
        format!("Cleared {} old usage records", deleted_count),
    );
    
    Ok(deleted_count)
}
