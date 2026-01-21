use super::repository;
use super::tracking::{RequestUsage, UsageFilter, UsageStats};
use crate::models::{calculate_request_cost, get_model_pricing};
use crate::storage_manager::db::open_db;
use crate::utils::{log_error, log_info};
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

/// Recalculate costs for all usage records using current pricing
/// This is useful when the cost calculation formula was fixed
#[tauri::command]
pub async fn usage_recalculate_costs(app: AppHandle, api_key: String) -> Result<String, String> {
    log_info(&app, "usage_recalculate", "Starting cost recalculation...");

    // Get all records
    let records = repository::query_usage_records(
        &app,
        UsageFilter {
            start_timestamp: None,
            end_timestamp: None,
            provider_id: None,
            model_id: None,
            character_id: None,
            session_id: None,
            success_only: None,
        },
    )?;

    let total_records = records.len();
    log_info(
        &app,
        "usage_recalculate",
        format!("Found {} records to recalculate", total_records),
    );

    let mut updated_count = 0;
    let mut skipped_count = 0;
    let mut error_count = 0;

    // Open database connection for updates
    let conn = open_db(&app)?;

    for record in &records {
        // Only recalculate for OpenRouter records that have token counts
        if !record.provider_id.eq_ignore_ascii_case("openrouter") {
            skipped_count += 1;
            continue;
        }

        let prompt_tokens = record.prompt_tokens.unwrap_or(0);
        let completion_tokens = record.completion_tokens.unwrap_or(0);

        if prompt_tokens == 0 && completion_tokens == 0 {
            skipped_count += 1;
            continue;
        }

        // Fetch pricing for this model using model_name (the OpenRouter identifier like "anthropic/claude-sonnet-4.5")
        // NOT model_id which is an internal UUID
        match get_model_pricing(
            app.clone(),
            &record.provider_id,
            &record.model_name,
            Some(&api_key),
        )
        .await
        {
            Ok(Some(pricing)) => {
                if let Some(cost) =
                    calculate_request_cost(prompt_tokens, completion_tokens, &pricing)
                {
                    // Update the record in database
                    match conn.execute(
                        "UPDATE usage_records SET prompt_cost = ?, completion_cost = ?, total_cost = ? WHERE id = ?",
                        rusqlite::params![
                            cost.prompt_cost,
                            cost.completion_cost,
                            cost.total_cost,
                            &record.id,
                        ],
                    ) {
                        Ok(_) => {
                            updated_count += 1;
                        }
                        Err(e) => {
                            log_error(
                                &app,
                                "usage_recalculate",
                                format!("Failed to update record {}: {}", record.id, e),
                            );
                            error_count += 1;
                        }
                    }
                } else {
                    skipped_count += 1;
                }
            }
            Ok(None) => {
                skipped_count += 1;
            }
            Err(e) => {
                log_error(
                    &app,
                    "usage_recalculate",
                    format!("Failed to fetch pricing for {}: {}", record.model_name, e),
                );
                error_count += 1;
            }
        }
    }

    let result = format!(
        "Recalculation complete: {} updated, {} skipped, {} errors (total: {})",
        updated_count, skipped_count, error_count, total_records
    );
    log_info(&app, "usage_recalculate", &result);

    Ok(result)
}
