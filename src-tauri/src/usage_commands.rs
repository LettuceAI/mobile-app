use tauri::AppHandle;
use std::fs;
use crate::usage_tracking::{RequestUsage, UsageFilter, UsageStats};
use crate::usage_storage;
use crate::utils::ensure_lettuce_dir;

#[tauri::command]
pub async fn usage_add_record(app: AppHandle, usage: RequestUsage) -> Result<(), String> {
    usage_storage::add_usage_record(&app, usage)
}

#[tauri::command]
pub async fn usage_query_records(
    app: AppHandle,
    filter: UsageFilter,
) -> Result<Vec<RequestUsage>, String> {
    usage_storage::query_usage_records(&app, filter)
}

#[tauri::command]
pub async fn usage_get_stats(
    app: AppHandle,
    filter: UsageFilter,
) -> Result<UsageStats, String> {
    usage_storage::calculate_usage_stats(&app, filter)
}

#[tauri::command]
pub async fn usage_clear_before(
    app: AppHandle,
    timestamp: u64,
) -> Result<u64, String> {
    usage_storage::clear_usage_records_before(&app, timestamp)
}

#[tauri::command]
pub async fn usage_export_csv(
    app: AppHandle,
    filter: UsageFilter,
) -> Result<String, String> {
    let records = usage_storage::query_usage_records(&app, filter)?;
    
    let mut csv = String::from("timestamp,session_id,character_name,model_name,provider_label,prompt_tokens,completion_tokens,total_tokens,total_cost,success,error_message\n");
    
    for record in records {
        let timestamp = record.timestamp;
        let session_id = &record.session_id;
        let character_name = &record.character_name;
        let model_name = &record.model_name;
        let provider_label = &record.provider_label;
        let prompt_tokens = record.prompt_tokens.unwrap_or(0);
        let completion_tokens = record.completion_tokens.unwrap_or(0);
        let total_tokens = record.total_tokens.unwrap_or(0);
        let total_cost = record.cost.as_ref().map(|c| c.total_cost).unwrap_or(0.0);
        let success = if record.success { "yes" } else { "no" };
        let error_message = record.error_message.as_deref().unwrap_or("");
        
        let line = format!(
            "{},{},{},{},{},{},{},{},{},{},{}\n",
            timestamp,
            session_id,
            character_name,
            model_name,
            provider_label,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            total_cost,
            success,
            error_message
        );
        
        csv.push_str(&line);
    }
    
    Ok(csv)
}

#[tauri::command]
pub async fn usage_save_csv(
    app: AppHandle,
    csv_data: String,
    filename: String,
) -> Result<String, String> {
    let dir = ensure_lettuce_dir(&app)?;
    let exports_dir = dir.join("exports");
    fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
    
    let file_path = exports_dir.join(&filename);
    
    fs::write(&file_path, &csv_data).map_err(|e| e.to_string())?;
    
    file_path
        .to_str()
        .ok_or_else(|| "Invalid file path".to_string())
        .map(|s| s.to_string())
}
