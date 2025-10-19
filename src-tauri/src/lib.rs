mod api;
mod chat_manager;
mod models;
mod pricing_cache;
mod providers;
mod secrets;
mod storage_manager;
mod usage;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            api::api_request,
            models::models_cache_get,
            models::models_cache_update,
            models::verify_model_exists,
            providers::verify_provider_api_key,
            providers::get_provider_configs,
            storage_manager::storage_read_settings,
            storage_manager::storage_write_settings,
            storage_manager::storage_read_characters,
            storage_manager::storage_write_characters,
            storage_manager::storage_read_personas,
            storage_manager::storage_write_personas,
            storage_manager::storage_read_sessions_index,
            storage_manager::storage_write_sessions_index,
            storage_manager::storage_read_session,
            storage_manager::storage_write_session,
            storage_manager::storage_delete_session,
            storage_manager::storage_clear_all,
            storage_manager::storage_usage_summary,
            storage_manager::storage_write_image,
            storage_manager::storage_get_image_path,
            storage_manager::storage_read_image,
            storage_manager::storage_delete_image,
            chat_manager::chat_completion,
            chat_manager::chat_regenerate,
            chat_manager::chat_continue,
            chat_manager::get_default_character_rules,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            secrets::secret_for_cred_get,
            secrets::secret_for_cred_set,
            secrets::secret_for_cred_delete,
            usage::usage_add_record,
            usage::usage_query_records,
            usage::usage_get_stats,
            usage::usage_clear_before,
            usage::usage_export_csv,
            usage::usage_save_csv
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
