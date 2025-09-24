mod api;
mod chat_manager;
mod models_cache;
mod model_verify;
mod secrets;
mod storage_manager;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            api::api_request,
            models_cache::models_cache_get,
            models_cache::models_cache_update,
            model_verify::verify_model_exists,
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
            chat_manager::chat_completion,
            chat_manager::chat_regenerate,
            chat_manager::chat_continue,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            secrets::secret_for_cred_get,
            secrets::secret_for_cred_set,
            secrets::secret_for_cred_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
