mod abort_manager;
mod api;
mod chat_manager;
mod embedding_model;
mod error;
mod image_generator;
mod logger;
mod migrations;
mod models;
mod pricing_cache;
mod providers;
mod serde_utils;
mod storage_manager;
mod tokenizer;
mod transport;
mod usage;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let abort_registry = abort_manager::AbortRegistry::new();
            app.manage(abort_registry);

            let log_manager =
                logger::LogManager::new(app.handle()).expect("Failed to initialize log manager");
            app.manage(log_manager);

            match storage_manager::db::init_pool(app.handle()) {
                Ok(pool) => {
                    let swappable = storage_manager::db::SwappablePool::new(pool);
                    app.manage(swappable);
                }
                Err(e) => panic!("Failed to initialize database pool: {}", e),
            }

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
            models::verify_model_exists,
            providers::verify_provider_api_key,
            providers::get_provider_configs,
            providers::openrouter::get_openrouter_models,
            storage_manager::settings::storage_read_settings,
            storage_manager::settings::storage_write_settings,
            storage_manager::settings::settings_set_defaults,
            storage_manager::providers::provider_upsert,
            storage_manager::providers::provider_delete,
            storage_manager::models::model_upsert,
            storage_manager::models::model_delete,
            storage_manager::settings::settings_set_advanced_model_settings,
            storage_manager::settings::settings_set_advanced,
            storage_manager::settings::settings_set_default_provider,
            storage_manager::settings::settings_set_default_model,
            storage_manager::settings::settings_set_app_state,
            storage_manager::settings::settings_set_prompt_template,
            storage_manager::settings::settings_set_system_prompt,
            storage_manager::settings::settings_set_migration_version,
            storage_manager::characters::characters_list,
            storage_manager::characters::character_upsert,
            storage_manager::characters::character_delete,
            storage_manager::character_transfer::character_export,
            storage_manager::character_transfer::character_import,
            storage_manager::character_transfer::persona_export,
            storage_manager::character_transfer::persona_import,
            storage_manager::character_transfer::import_package,
            storage_manager::character_transfer::save_json_to_downloads,
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
            storage_manager::sessions::session_add_memory,
            storage_manager::sessions::session_remove_memory,
            storage_manager::sessions::session_update_memory,
            storage_manager::usage::storage_clear_all,
            storage_manager::usage::storage_reset_database,
            storage_manager::usage::storage_usage_summary,
            storage_manager::media::storage_write_image,
            storage_manager::media::storage_get_image_path,
            storage_manager::media::storage_read_image,
            storage_manager::media::storage_delete_image,
            storage_manager::media::storage_save_avatar,
            storage_manager::media::storage_load_avatar,
            storage_manager::media::storage_delete_avatar,
            storage_manager::media::generate_avatar_gradient,
            storage_manager::media::storage_save_session_attachment,
            storage_manager::media::storage_load_session_attachment,
            storage_manager::media::storage_delete_session_attachments,
            storage_manager::media::storage_session_attachment_exists,
            storage_manager::db::db_optimize,
            storage_manager::db::db_checkpoint,
            storage_manager::backup::backup_export,
            storage_manager::backup::backup_import,
            storage_manager::backup::backup_check_encrypted,
            storage_manager::backup::backup_verify_password,
            storage_manager::backup::backup_get_info,
            storage_manager::backup::backup_list,
            storage_manager::backup::backup_delete,
            storage_manager::backup::backup_get_info_from_bytes,
            storage_manager::backup::backup_check_encrypted_from_bytes,
            storage_manager::backup::backup_verify_password_from_bytes,
            storage_manager::backup::backup_import_from_bytes,
            storage_manager::backup::backup_check_dynamic_memory,
            storage_manager::backup::backup_check_dynamic_memory_from_bytes,
            storage_manager::backup::backup_disable_dynamic_memory,
            storage_manager::importer::legacy_backup_and_remove,
            chat_manager::chat_completion,
            chat_manager::chat_regenerate,
            chat_manager::chat_continue,
            chat_manager::get_default_character_rules,
            chat_manager::get_default_system_prompt_template,
            chat_manager::search_messages,
            chat_manager::retry_dynamic_memory,
            chat_manager::list_prompt_templates,
            chat_manager::create_prompt_template,
            chat_manager::update_prompt_template,
            chat_manager::delete_prompt_template,
            chat_manager::get_prompt_template,
            chat_manager::get_app_default_template_id,
            chat_manager::is_app_default_template,
            chat_manager::reset_app_default_template,
            chat_manager::reset_dynamic_summary_template,
            chat_manager::reset_dynamic_memory_template,
            chat_manager::get_required_template_variables,
            chat_manager::validate_template_variables,
            chat_manager::render_prompt_preview,
            usage::usage_add_record,
            usage::usage_query_records,
            usage::usage_get_stats,
            usage::usage_clear_before,
            usage::usage_export_csv,
            usage::usage_save_csv,
            utils::get_app_version,
            embedding_model::check_embedding_model,
            embedding_model::start_embedding_download,
            embedding_model::get_embedding_download_progress,
            embedding_model::cancel_embedding_download,
            embedding_model::compute_embedding,
            embedding_model::initialize_embedding_model,
            embedding_model::run_embedding_test,
            embedding_model::delete_embedding_model,
            image_generator::commands::generate_image,
            logger::log_to_file,
            logger::list_log_files,
            logger::read_log_file,
            logger::delete_log_file,
            logger::clear_all_logs,
            logger::get_log_dir_path,
            logger::save_log_to_downloads,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
