use super::repository;
use super::tracking::{RequestUsage, UsageFilter, UsageStats};
use tauri::AppHandle;

#[tauri::command]
pub async fn usage_add_record(app: AppHandle, usage: RequestUsage) -> Result<(), String> {
    repository::add_usage_record(&app, usage)
}

#[tauri::command]
pub async fn usage_query_records(
    app: AppHandle,
    filter: UsageFilter,
) -> Result<Vec<RequestUsage>, String> {
    repository::query_usage_records(&app, filter)
}

#[tauri::command]
pub async fn usage_get_stats(app: AppHandle, filter: UsageFilter) -> Result<UsageStats, String> {
    repository::calculate_usage_stats(&app, filter)
}

#[tauri::command]
pub async fn usage_clear_before(app: AppHandle, timestamp: u64) -> Result<u64, String> {
    repository::clear_usage_records_before(&app, timestamp)
}

#[tauri::command]
pub async fn usage_export_csv(app: AppHandle, filter: UsageFilter) -> Result<String, String> {
    repository::export_usage_csv(&app, filter)
}

#[tauri::command]
pub async fn usage_save_csv(
    app: AppHandle,
    csv_data: String,
    filename: String,
) -> Result<String, String> {
    repository::save_usage_csv(&app, &csv_data, &filename)
}
