mod abort_manager;
mod api;
mod chat_manager;
mod error;
mod migrations;
mod models;
mod pricing_cache;
mod providers;
mod secrets;
mod serde_utils;
mod storage_manager;
mod transport;
mod usage;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let abort_registry = abort_manager::AbortRegistry::new();
            app.manage(abort_registry);

            if let Err(e) = migrations::run_migrations(app.handle()) {
                eprintln!("Migration error: {}", e);
            }

            if let Err(e) = chat_manager::prompts::ensure_app_default_template(app.handle()) {
                eprintln!("Failed to ensure app default template: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api::api_request,
            api::abort_request,
            models::models_cache_get,
            models::models_cache_update,
            models::verify_model_exists,
            providers::verify_provider_api_key,
            providers::get_provider_configs,
            storage_manager::storage_read_settings,
            storage_manager::storage_write_settings,
            // Legacy file-based storage commands removed from handler
            storage_manager::settings_set_defaults,
            storage_manager::provider_upsert,
            storage_manager::provider_delete,
            storage_manager::model_upsert,
            storage_manager::model_delete,
            storage_manager::settings_set_advanced_model_settings,
            storage_manager::characters_list,
            storage_manager::character_upsert,
            storage_manager::character_delete,
            storage_manager::personas_list,
            storage_manager::persona_upsert,
            storage_manager::persona_delete,
            storage_manager::persona_default_get,
            storage_manager::sessions_list_ids,
            storage_manager::session_get,
            storage_manager::session_upsert,
            storage_manager::session_delete,
            storage_manager::session_archive,
            storage_manager::session_update_title,
            storage_manager::message_toggle_pin,
            storage_manager::storage_clear_all,
            storage_manager::storage_usage_summary,
            storage_manager::storage_write_image,
            storage_manager::storage_get_image_path,
            storage_manager::storage_read_image,
            storage_manager::storage_delete_image,
            storage_manager::storage_save_avatar,
            storage_manager::storage_load_avatar,
            storage_manager::storage_delete_avatar,
            storage_manager::generate_avatar_gradient,
            chat_manager::chat_completion,
            chat_manager::chat_regenerate,
            chat_manager::chat_continue,
            chat_manager::get_default_character_rules,
            chat_manager::get_default_system_prompt_template,
            chat_manager::list_prompt_templates,
            chat_manager::create_prompt_template,
            chat_manager::update_prompt_template,
            chat_manager::delete_prompt_template,
            chat_manager::get_prompt_template,
            chat_manager::get_app_default_template_id,
            chat_manager::is_app_default_template,
            chat_manager::reset_app_default_template,
            chat_manager::render_prompt_preview,
            chat_manager::regenerate_session_system_prompt,
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
            usage::usage_save_csv,
            utils::get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
