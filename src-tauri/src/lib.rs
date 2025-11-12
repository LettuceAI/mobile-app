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

            if let Err(e) = storage_manager::importer::run_legacy_import(app.handle()) {
                eprintln!("Legacy import error: {}", e);
            }

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
            storage_manager::settings::storage_read_settings,
            storage_manager::settings::storage_write_settings,
            // Legacy file-based storage commands removed from handler
            storage_manager::settings::settings_set_defaults,
            storage_manager::providers::provider_upsert,
            storage_manager::providers::provider_delete,
            storage_manager::models::model_upsert,
            storage_manager::models::model_delete,
            storage_manager::settings::settings_set_advanced_model_settings,
            storage_manager::characters::characters_list,
            storage_manager::characters::character_upsert,
            storage_manager::characters::character_delete,
            storage_manager::character_transfer::character_export,
            storage_manager::character_transfer::character_import,
            storage_manager::personas::personas_list,
            storage_manager::personas::persona_upsert,
            storage_manager::personas::persona_delete,
            storage_manager::personas::persona_default_get,
            storage_manager::sessions::sessions_list_ids,
            storage_manager::sessions::session_get,
            storage_manager::sessions::session_upsert,
            storage_manager::sessions::session_delete,
            storage_manager::sessions::session_archive,
            storage_manager::sessions::session_update_title,
            storage_manager::sessions::message_toggle_pin,
            storage_manager::usage::storage_clear_all,
            storage_manager::usage::storage_usage_summary,
            storage_manager::media::storage_write_image,
            storage_manager::media::storage_get_image_path,
            storage_manager::media::storage_read_image,
            storage_manager::media::storage_delete_image,
            storage_manager::media::storage_save_avatar,
            storage_manager::media::storage_load_avatar,
            storage_manager::media::storage_delete_avatar,
            storage_manager::media::generate_avatar_gradient,
            storage_manager::db::db_optimize,
            storage_manager::importer::legacy_backup_and_remove,
            storage_manager::db::db_optimize,
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
