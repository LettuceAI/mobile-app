use std::collections::HashMap;
use std::fs;
use tauri::{AppHandle, Manager};

use super::tracking::{
    CharacterStats, ModelStats, ProviderStats, RequestUsage, UsageFilter, UsageStats,
};
use crate::storage_manager::db::open_db;
use crate::utils::log_info;

struct UsageRepository {
    app: AppHandle,
}

impl UsageRepository {
    fn new(app: AppHandle) -> Self {
        Self { app }
    }

    fn add_record(&self, usage: RequestUsage) -> Result<(), String> {
        let mut conn = open_db(&self.app)?;

        log_info(
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

        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            r#"INSERT OR REPLACE INTO usage_records (
                id, timestamp, session_id, character_id, character_name, model_id, model_name, provider_id, provider_label,
                operation_type, prompt_tokens, completion_tokens, total_tokens, prompt_cost, completion_cost, total_cost, success, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
            rusqlite::params![
                usage.id,
                usage.timestamp as i64,
                usage.session_id,
                usage.character_id,
                usage.character_name,
                usage.model_id,
                usage.model_name,
                usage.provider_id,
                usage.provider_label,
                usage.operation_type,
                usage.prompt_tokens.map(|v| v as i64),
                usage.completion_tokens.map(|v| v as i64),
                usage.total_tokens.map(|v| v as i64),
                usage.cost.as_ref().map(|c| c.prompt_cost),
                usage.cost.as_ref().map(|c| c.completion_cost),
                usage.cost.as_ref().map(|c| c.total_cost),
                if usage.success { 1 } else { 0 },
                usage.error_message,
            ],
        )
        .map_err(|e| e.to_string())?;

        // metadata
        tx.execute(
            "DELETE FROM usage_metadata WHERE usage_id = ?",
            rusqlite::params![&usage.id],
        )
        .map_err(|e| e.to_string())?;
        for (k, v) in usage.metadata.iter() {
            tx.execute(
                "INSERT INTO usage_metadata (usage_id, key, value) VALUES (?, ?, ?)",
                rusqlite::params![&usage.id, k, v],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    fn query_records(&self, filter: UsageFilter) -> Result<Vec<RequestUsage>, String> {
        let conn = open_db(&self.app)?;
        let mut where_clauses: Vec<&str> = Vec::new();
        let mut params: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(start) = filter.start_timestamp {
            where_clauses.push("timestamp >= ?");
            params.push((start as i64).into());
        }
        if let Some(end) = filter.end_timestamp {
            where_clauses.push("timestamp <= ?");
            params.push((end as i64).into());
        }
        if let Some(ref p) = filter.provider_id {
            where_clauses.push("provider_id = ?");
            params.push(p.clone().into());
        }
        if let Some(ref m) = filter.model_id {
            where_clauses.push("model_id = ?");
            params.push(m.clone().into());
        }
        if let Some(ref c) = filter.character_id {
            where_clauses.push("character_id = ?");
            params.push(c.clone().into());
        }
        if let Some(ref s) = filter.session_id {
            where_clauses.push("session_id = ?");
            params.push(s.clone().into());
        }
        if let Some(true) = filter.success_only {
            where_clauses.push("success = 1");
        }

        let sql = format!(
            "SELECT id, timestamp, session_id, character_id, character_name, model_id, model_name, provider_id, provider_label, operation_type, prompt_tokens, completion_tokens, total_tokens, prompt_cost, completion_cost, total_cost, success, error_message FROM usage_records {} ORDER BY timestamp ASC",
            if where_clauses.is_empty() { String::new() } else { format!("WHERE {}", where_clauses.join(" AND ")) }
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(params.iter()), |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, String>(7)?,
                    r.get::<_, String>(8)?,
                    r.get::<_, String>(9)?,
                    r.get::<_, Option<i64>>(10)?,
                    r.get::<_, Option<i64>>(11)?,
                    r.get::<_, Option<i64>>(12)?,
                    r.get::<_, Option<f64>>(13)?,
                    r.get::<_, Option<f64>>(14)?,
                    r.get::<_, Option<f64>>(15)?,
                    r.get::<_, i64>(16)?,
                    r.get::<_, Option<String>>(17)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut out: Vec<RequestUsage> = Vec::new();
        let mut ids: Vec<String> = Vec::new();
        for row in rows {
            let (
                id,
                ts,
                session_id,
                character_id,
                character_name,
                model_id,
                model_name,
                provider_id,
                provider_label,
                operation_type,
                pt,
                ct,
                tt,
                pc,
                cc,
                tc,
                success,
                err,
            ) = row.map_err(|e| e.to_string())?;
            ids.push(id.clone());
            let cost = match (pc, cc, tc) {
                (Some(prompt_cost), Some(completion_cost), Some(total_cost)) => {
                    Some(crate::models::types::RequestCost {
                        prompt_tokens: pt.unwrap_or(0) as u64,
                        completion_tokens: ct.unwrap_or(0) as u64,
                        total_tokens: tt.unwrap_or(0) as u64,
                        prompt_cost,
                        completion_cost,
                        total_cost,
                    })
                }
                _ => None,
            };
            out.push(RequestUsage {
                id,
                timestamp: ts as u64,
                session_id,
                character_id,
                character_name,
                model_id,
                model_name,
                provider_id,
                provider_label,
                operation_type,
                prompt_tokens: pt.map(|v| v as u64),
                completion_tokens: ct.map(|v| v as u64),
                total_tokens: tt.map(|v| v as u64),
                cost,
                success: success != 0,
                error_message: err,
                metadata: HashMap::new(),
            });
        }

        // fetch metadata for these ids
        if !ids.is_empty() {
            let placeholders = vec!["?"; ids.len()].join(",");
            let sql = format!(
                "SELECT usage_id, key, value FROM usage_metadata WHERE usage_id IN ({})",
                placeholders
            );
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            let mut meta_map: HashMap<String, HashMap<String, String>> = HashMap::new();
            for row in rows {
                let (uid, k, v) = row.map_err(|e| e.to_string())?;
                meta_map.entry(uid).or_default().insert(k, v);
            }
            for rec in &mut out {
                if let Some(m) = meta_map.remove(&rec.id) {
                    rec.metadata = m;
                }
            }
        }
        Ok(out)
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
        let conn = open_db(&self.app)?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM usage_records WHERE timestamp < ?",
                rusqlite::params![timestamp as i64],
                |r| r.get(0),
            )
            .unwrap_or(0);
        conn.execute(
            "DELETE FROM usage_records WHERE timestamp < ?",
            rusqlite::params![timestamp as i64],
        )
        .map_err(|e| e.to_string())?;
        Ok(count as u64)
    }

    fn export_csv(&self, filter: UsageFilter) -> Result<String, String> {
        log_info(
            &self.app,
            "export_csv",
            format!("Exporting CSV with filter: start={:?}, end={:?}", filter.start_timestamp, filter.end_timestamp),
        );
        let records = self.query_records(filter)?;
        log_info(
            &self.app,
            "export_csv",
            format!("Found {} records to export", records.len()),
        );
        let csv = build_csv(&records);
        log_info(
            &self.app,
            "export_csv",
            format!("Generated CSV with {} bytes", csv.len()),
        );
        Ok(csv)
    }

    fn save_csv(&self, csv_data: &str, filename: &str) -> Result<String, String> {
        log_info(
            &self.app,
            "save_csv",
            format!("Saving CSV to downloads: {} ({} bytes)", filename, csv_data.len()),
        );

        #[cfg(target_os = "android")]
        let download_dir = {
            use std::path::PathBuf;
            PathBuf::from("/storage/emulated/0/Download")
        };

        #[cfg(not(target_os = "android"))]
        let download_dir = self.app
            .path()
            .download_dir()
            .map_err(|e| format!("Failed to get downloads directory: {}", e))?;

        if !download_dir.exists() {
            fs::create_dir_all(&download_dir)
                .map_err(|e| format!("Failed to create downloads directory: {}", e))?;
        }

        let file_path = download_dir.join(filename);

        fs::write(&file_path, csv_data.as_bytes())
            .map_err(|e| format!("Failed to write file: {}", e))?;

        let path_str = file_path
            .to_str()
            .ok_or_else(|| "Invalid path".to_string())?
            .to_string();

        log_info(
            &self.app,
            "save_csv",
            format!("Successfully saved CSV to: {}", path_str),
        );

        Ok(path_str)
    }
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
    let mut csv = String::from("timestamp,session_id,character_name,model_name,provider_label,operation_type,prompt_tokens,completion_tokens,total_tokens,total_cost,success,error_message\n");

    for record in records {
        let line = format!(
            "{},{},{},{},{},{},{},{},{},{},{},{}\n",
            record.timestamp,
            record.session_id,
            record.character_name,
            record.model_name,
            record.provider_label,
            record.operation_type,
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
