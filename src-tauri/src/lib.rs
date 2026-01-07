mod abort_manager;
mod api;
mod chat_manager;
mod creation_helper;
mod embedding_model;
mod error;
mod group_chat_manager;
mod image_generator;
mod logger;
pub mod migrations;
pub mod models;
mod pricing_cache;
mod providers;
mod serde_utils;
pub mod storage_manager;
pub mod sync;
mod tokenizer;
mod transport;
mod tts_manager;
mod usage;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_tts::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_haptics::init());

    #[cfg(target_os = "android")]
    let builder = builder
        .plugin(tauri_plugin_android_fs::init())
        .plugin(tauri_plugin_barcode_scanner::init());

    builder
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

            if let Err(e) = chat_manager::prompts::ensure_help_me_reply_template(app.handle()) {
                eprintln!("Failed to ensure help me reply template: {}", e);
            }

            // Initialize Sync Manager
            app.manage(sync::manager::SyncManagerState::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api::api_request,
            api::abort_request,
            sync::commands::start_driver,
            sync::commands::connect_as_passenger,
            sync::commands::stop_sync,
            sync::commands::get_sync_status,
            sync::commands::get_local_ip,
            sync::commands::approve_connection,
            sync::commands::start_sync_session,
            models::verify_model_exists,
            providers::verify_provider_api_key,
            providers::get_provider_configs,
            providers::commands::get_remote_models,
            providers::openrouter::get_openrouter_models,
            storage_manager::settings::storage_read_settings,
            storage_manager::settings::storage_write_settings,
            storage_manager::settings::settings_set_defaults,
            storage_manager::providers::provider_upsert,
            storage_manager::providers::provider_delete,
            storage_manager::models::model_upsert,
            storage_manager::models::model_delete,
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
            storage_manager::lorebook::lorebooks_list,
            storage_manager::lorebook::lorebook_upsert,
            storage_manager::lorebook::lorebook_delete,
            storage_manager::lorebook::character_lorebooks_list,
            storage_manager::lorebook::character_lorebooks_set,
            storage_manager::lorebook::lorebook_entries_list,
            storage_manager::lorebook::lorebook_entry_get,
            storage_manager::lorebook::lorebook_entry_upsert,
            storage_manager::lorebook::lorebook_entry_delete,
            storage_manager::lorebook::lorebook_entry_create_blank,
            storage_manager::lorebook::lorebook_entries_reorder,
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
            storage_manager::sessions::sessions_list_previews,
            storage_manager::sessions::session_get,
            storage_manager::sessions::session_get_meta,
            storage_manager::sessions::session_message_count,
            storage_manager::sessions::messages_list,
            storage_manager::sessions::messages_list_pinned,
            storage_manager::sessions::session_upsert_meta,
            storage_manager::sessions::messages_upsert_batch,
            storage_manager::sessions::message_delete,
            storage_manager::sessions::messages_delete_after,
            storage_manager::sessions::session_upsert,
            storage_manager::sessions::session_delete,
            storage_manager::sessions::session_archive,
            storage_manager::sessions::session_update_title,
            storage_manager::sessions::message_toggle_pin,
            storage_manager::sessions::message_toggle_pin_state,
            storage_manager::sessions::session_add_memory,
            storage_manager::sessions::session_remove_memory,
            storage_manager::sessions::session_update_memory,
            storage_manager::sessions::session_toggle_memory_pin,
            storage_manager::sessions::session_set_memory_cold_state,
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
            storage_manager::media::storage_get_session_attachment_path,
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
            storage_manager::legacy::get_storage_root,
            chat_manager::chat_completion,
            chat_manager::chat_regenerate,
            chat_manager::chat_continue,
            chat_manager::chat_add_message_attachment,
            chat_manager::get_default_character_rules,
            chat_manager::get_default_system_prompt_template,
            chat_manager::search_messages,
            chat_manager::chat_generate_user_reply,
            chat_manager::retry_dynamic_memory,
            chat_manager::trigger_dynamic_memory,
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
            chat_manager::reset_help_me_reply_template,
            chat_manager::get_required_template_variables,
            chat_manager::validate_template_variables,
            chat_manager::render_prompt_preview,
            usage::usage_add_record,
            usage::usage_query_records,
            usage::usage_get_stats,
            usage::usage_clear_before,
            usage::usage_export_csv,
            usage::usage_save_csv,
            utils::accessibility_sound_base64,
            utils::get_app_version,
            embedding_model::check_embedding_model,
            embedding_model::get_embedding_model_info,
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
            tts_manager::commands::audio_provider_list,
            tts_manager::commands::audio_provider_upsert,
            tts_manager::commands::audio_provider_delete,
            tts_manager::commands::audio_models_list,
            tts_manager::commands::audio_voice_design_models_list,
            tts_manager::commands::audio_provider_voices,
            tts_manager::commands::audio_provider_refresh_voices,
            tts_manager::commands::user_voice_list,
            tts_manager::commands::user_voice_upsert,
            tts_manager::commands::user_voice_delete,
            tts_manager::commands::tts_preview,
            tts_manager::commands::audio_provider_verify,
            tts_manager::commands::audio_provider_search_voices,
            tts_manager::commands::voice_design_preview,
            tts_manager::commands::voice_design_create,
            tts_manager::audio_cache::tts_cache_key,
            tts_manager::audio_cache::tts_cache_exists,
            tts_manager::audio_cache::tts_cache_get,
            tts_manager::audio_cache::tts_cache_save,
            tts_manager::audio_cache::tts_cache_delete,
            tts_manager::audio_cache::tts_cache_clear,
            tts_manager::audio_cache::tts_cache_stats,
            creation_helper::creation_helper_start,
            creation_helper::creation_helper_get_session,
            creation_helper::creation_helper_send_message,
            creation_helper::creation_helper_get_draft,
            creation_helper::creation_helper_cancel,
            creation_helper::creation_helper_complete,
            creation_helper::creation_helper_get_images,
            creation_helper::creation_helper_get_uploaded_image,
            creation_helper::creation_helper_regenerate,
            // Group chat commands
            storage_manager::group_sessions::group_sessions_list,
            storage_manager::group_sessions::group_sessions_list_all,
            storage_manager::group_sessions::group_session_create,
            storage_manager::group_sessions::group_session_get,
            storage_manager::group_sessions::group_session_update,
            storage_manager::group_sessions::group_session_delete,
            storage_manager::group_sessions::group_session_archive,
            storage_manager::group_sessions::group_session_update_title,
            storage_manager::group_sessions::group_session_duplicate,
            storage_manager::group_sessions::group_session_add_character,
            storage_manager::group_sessions::group_session_remove_character,
            storage_manager::group_sessions::group_session_update_starting_scene,
            storage_manager::group_sessions::group_session_update_chat_type,
            storage_manager::group_sessions::group_participation_stats,
            storage_manager::group_sessions::group_participation_increment,
            storage_manager::group_sessions::group_messages_list,
            storage_manager::group_sessions::group_message_upsert,
            storage_manager::group_sessions::group_message_delete,
            storage_manager::group_sessions::group_messages_delete_after,
            storage_manager::group_sessions::group_message_add_variant,
            storage_manager::group_sessions::group_message_select_variant,
            storage_manager::group_sessions::group_message_count,
            storage_manager::group_sessions::group_session_update_memories,
            storage_manager::group_sessions::group_session_update_manual_memories,
            storage_manager::group_sessions::group_session_add_memory,
            storage_manager::group_sessions::group_session_remove_memory,
            storage_manager::group_sessions::group_session_update_memory,
            storage_manager::group_sessions::group_session_toggle_memory_pin,
            storage_manager::group_sessions::group_session_set_memory_cold_state,
            group_chat_manager::group_chat_send,
            group_chat_manager::group_chat_regenerate,
            group_chat_manager::group_chat_continue,
            group_chat_manager::group_chat_get_selection_prompt,
            group_chat_manager::group_chat_generate_user_reply,
            group_chat_manager::group_chat_retry_dynamic_memory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
