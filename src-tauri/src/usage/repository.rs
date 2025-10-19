use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use super::tracking::{
    CharacterStats, ModelStats, ProviderStats, RequestUsage, UsageFilter, UsageStats,
};
use crate::utils::{ensure_lettuce_dir, log_backend};

const USAGE_LOG_FILE: &str = "usage_log.json";

struct UsageRepository {
    app: AppHandle,
}

impl UsageRepository {
    fn new(app: AppHandle) -> Self {
        Self { app }
    }

    fn log_path(&self) -> Result<PathBuf, String> {
        Ok(ensure_lettuce_dir(&self.app)?.join(USAGE_LOG_FILE))
    }

    fn load_all(&self) -> Result<Vec<RequestUsage>, String> {
        let path = self.log_path()?;

        if !path.exists() {
            return Ok(Vec::new());
        }

        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read usage log: {}", e))?;

        if content.trim().is_empty() {
            return Ok(Vec::new());
        }

        serde_json::from_str(&content).map_err(|e| format!("Failed to parse usage log: {}", e))
    }

    fn save_all(&self, usage_log: &[RequestUsage]) -> Result<(), String> {
        let path = self.log_path()?;
        let content = serde_json::to_string_pretty(usage_log)
            .map_err(|e| format!("Failed to serialize usage log: {}", e))?;

        fs::write(&path, content).map_err(|e| format!("Failed to write usage log: {}", e))
    }

    fn add_record(&self, usage: RequestUsage) -> Result<(), String> {
        let mut log = self.load_all()?;

        log_backend(
            &self.app,
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
        self.save_all(&log)
    }

    fn query_records(&self, filter: UsageFilter) -> Result<Vec<RequestUsage>, String> {
        let log = self.load_all()?;
        Ok(Self::filter_records(log, &filter))
    }

    fn filter_records(records: Vec<RequestUsage>, filter: &UsageFilter) -> Vec<RequestUsage> {
        records
            .into_iter()
            .filter(|record| matches_filter(record, filter))
            .collect()
    }

    fn calculate_stats(&self, filter: UsageFilter) -> Result<UsageStats, String> {
        let records = self.query_records(filter)?;
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
            accumulate_usage_stats(&mut stats, &record);
        }

        if stats.total_requests > 0 {
            stats.average_cost_per_request = stats.total_cost / stats.total_requests as f64;
        }

        Ok(stats)
    }

    fn clear_before(&self, timestamp: u64) -> Result<u64, String> {
        let records = self.load_all()?;
        let original_len = records.len() as u64;

        let retained: Vec<_> = records
            .into_iter()
            .filter(|record| record.timestamp >= timestamp)
            .collect();

        let deleted = original_len - retained.len() as u64;
        self.save_all(&retained)?;

        log_backend(
            &self.app,
            "usage_tracking",
            format!("Cleared {} old usage records", deleted),
        );

        Ok(deleted)
    }

    fn export_csv(&self, filter: UsageFilter) -> Result<String, String> {
        let records = self.query_records(filter)?;
        Ok(build_csv(&records))
    }

    fn save_csv(&self, csv_data: &str, filename: &str) -> Result<String, String> {
        let exports_dir = self.ensure_exports_dir()?;
        let file_path = exports_dir.join(filename);

        fs::write(&file_path, csv_data).map_err(|e| e.to_string())?;

        file_path
            .to_str()
            .ok_or_else(|| "Invalid file path".to_string())
            .map(|s| s.to_string())
    }

    fn ensure_exports_dir(&self) -> Result<PathBuf, String> {
        let dir = ensure_lettuce_dir(&self.app)?;
        let exports_dir = dir.join("exports");
        fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
        Ok(exports_dir)
    }
}

fn matches_filter(record: &RequestUsage, filter: &UsageFilter) -> bool {
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

    if matches!(filter.success_only, Some(true)) && !record.success {
        return false;
    }

    true
}

fn accumulate_usage_stats(stats: &mut UsageStats, record: &RequestUsage) {
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

    let provider_stats = stats
        .by_provider
        .entry(record.provider_id.clone())
        .or_insert_with(ProviderStats::empty);
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

    let model_stats = stats
        .by_model
        .entry(record.model_id.clone())
        .or_insert_with(|| ModelStats::empty(&record.provider_id));
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

    let character_stats = stats
        .by_character
        .entry(record.character_id.clone())
        .or_insert_with(CharacterStats::empty);
    character_stats.total_requests += 1;
    if record.success {
        character_stats.successful_requests += 1;
    }
    if let Some(tokens) = record.total_tokens {
        character_stats.total_tokens += tokens;
    }
    if let Some(cost) = &record.cost {
        character_stats.total_cost += cost.total_cost;
    }
}

fn build_csv(records: &[RequestUsage]) -> String {
    let mut csv = String::from("timestamp,session_id,character_name,model_name,provider_label,prompt_tokens,completion_tokens,total_tokens,total_cost,success,error_message\n");

    for record in records {
        let line = format!(
            "{},{},{},{},{},{},{},{},{},{},{}\n",
            record.timestamp,
            record.session_id,
            record.character_name,
            record.model_name,
            record.provider_label,
            record.prompt_tokens.unwrap_or(0),
            record.completion_tokens.unwrap_or(0),
            record.total_tokens.unwrap_or(0),
            record.cost.as_ref().map(|c| c.total_cost).unwrap_or(0.0),
            if record.success { "yes" } else { "no" },
            record.error_message.as_deref().unwrap_or("")
        );
        csv.push_str(&line);
    }

    csv
}

pub fn add_usage_record(app: &AppHandle, usage: RequestUsage) -> Result<(), String> {
    UsageRepository::new(app.clone()).add_record(usage)
}

pub fn query_usage_records(
    app: &AppHandle,
    filter: UsageFilter,
) -> Result<Vec<RequestUsage>, String> {
    UsageRepository::new(app.clone()).query_records(filter)
}

pub fn calculate_usage_stats(app: &AppHandle, filter: UsageFilter) -> Result<UsageStats, String> {
    UsageRepository::new(app.clone()).calculate_stats(filter)
}

pub fn clear_usage_records_before(app: &AppHandle, timestamp: u64) -> Result<u64, String> {
    UsageRepository::new(app.clone()).clear_before(timestamp)
}

pub fn export_usage_csv(app: &AppHandle, filter: UsageFilter) -> Result<String, String> {
    UsageRepository::new(app.clone()).export_csv(filter)
}

pub fn save_usage_csv(app: &AppHandle, csv_data: &str, filename: &str) -> Result<String, String> {
    UsageRepository::new(app.clone()).save_csv(csv_data, filename)
}
