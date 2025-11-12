use serde_json::Value;
use tauri::AppHandle;

use crate::chat_manager::prompts;
use crate::chat_manager::types::PromptScope;
use crate::storage_manager::{
    settings::storage_read_settings,
    settings::storage_write_settings,
};
use crate::utils::{log_error, log_info};

/// Current migration version
const CURRENT_MIGRATION_VERSION: u32 = 3;

/// Migration system for updating data structures across app versions
pub fn run_migrations(app: &AppHandle) -> Result<(), String> {
    log_info(app, "migrations", "Starting migration check".to_string());

    // Get current migration version from settings
    let current_version = get_migration_version(app)?;

    if current_version >= CURRENT_MIGRATION_VERSION {
        log_info(
            app,
            "migrations",
            format!(
                "No migrations needed (current: {}, latest: {})",
                current_version, CURRENT_MIGRATION_VERSION
            ),
        );
        return Ok(());
    }

    log_info(
        app,
        "migrations",
        format!(
            "Running migrations from version {} to {}",
            current_version, CURRENT_MIGRATION_VERSION
        ),
    );

    // Run migrations sequentially
    let mut version = current_version;

    if version < 1 {
        log_info(
            app,
            "migrations",
            "Running migration v0 -> v1: Add custom prompt fields".to_string(),
        );
        migrate_v0_to_v1(app)?;
        version = 1;
    }

    if version < 2 {
        log_info(
            app,
            "migrations",
            "Running migration v1 -> v2: Convert prompts to template system".to_string(),
        );
        migrate_v1_to_v2(app)?;
        version = 2;
    }

    if version < 3 {
        log_info(
            app,
            "migrations",
            "Running migration v2 -> v3: Normalize templates to global prompts (no scopes)"
                .to_string(),
        );
        migrate_v2_to_v3(app)?;
        version = 3;
    }

    // Future migrations go here:
    // if version < 2 {
    //     migrate_v1_to_v2(app)?;
    //     version = 2;
    // }

    // Update migration version
    set_migration_version(app, version)?;

    log_info(
        app,
        "migrations",
        format!(
            "Migrations completed successfully. Now at version {}",
            version
        ),
    );

    Ok(())
}

/// Get the current migration version
fn get_migration_version(app: &AppHandle) -> Result<u32, String> {
    match storage_read_settings(app.clone()) {
        Ok(Some(settings_json)) => {
            let settings: Value = serde_json::from_str(&settings_json)
                .map_err(|e| format!("Failed to parse settings: {}", e))?;

            Ok(settings
                .get("migrationVersion")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32)
                .unwrap_or(0))
        }
        Ok(None) => Ok(0), // No settings file means version 0
        Err(e) => {
            log_error(
                app,
                "migrations",
                format!("Error reading settings for migration version: {}", e),
            );
            Ok(0) // Assume version 0 on error
        }
    }
}

/// Set the migration version
fn set_migration_version(app: &AppHandle, version: u32) -> Result<(), String> {
    match storage_read_settings(app.clone()) {
        Ok(Some(settings_json)) => {
            let mut settings: Value = serde_json::from_str(&settings_json)
                .map_err(|e| format!("Failed to parse settings: {}", e))?;

            if let Some(obj) = settings.as_object_mut() {
                obj.insert(
                    "migrationVersion".to_string(),
                    Value::Number(version.into()),
                );
            }

            storage_write_settings(
                app.clone(),
                serde_json::to_string(&settings).map_err(|e| e.to_string())?,
            )?;

            Ok(())
        }
        Ok(None) => {
            // Create minimal settings with migration version
            let settings = serde_json::json!({
                "migrationVersion": version,
                "providerCredentials": [],
                "models": [],
                "appState": null,
                "advancedModelSettings": {
                    "temperature": 0.7,
                    "topP": 1.0,
                    "maxOutputTokens": 1024
                }
            });

            storage_write_settings(
                app.clone(),
                serde_json::to_string(&settings).map_err(|e| e.to_string())?,
            )?;

            Ok(())
        }
        Err(e) => Err(format!("Failed to read settings: {}", e)),
    }
}

/// Migration v0 -> v1: Add system_prompt field to Settings, Model, and Character
///
/// This migration ensures all existing data structures have the new optional
/// system_prompt field. Since Rust uses #[serde(default)], this field will
/// automatically deserialize as None for old data, but we update the settings
/// file to explicitly include it for consistency.
fn migrate_v0_to_v1(app: &AppHandle) -> Result<(), String> {
    // Settings migration - add systemPrompt field if missing
    if let Ok(Some(settings_json)) = storage_read_settings(app.clone()) {
        let mut settings: Value = serde_json::from_str(&settings_json)
            .map_err(|e| format!("Failed to parse settings: {}", e))?;

        let mut changed = false;

        // Add systemPrompt to root settings if not present
        if let Some(obj) = settings.as_object_mut() {
            if !obj.contains_key("systemPrompt") {
                obj.insert("systemPrompt".to_string(), Value::Null);
                changed = true;
                log_info(
                    app,
                    "migrations",
                    "Added systemPrompt to settings".to_string(),
                );
            }

            // Add systemPrompt to all models if not present
            if let Some(models) = obj.get_mut("models").and_then(|v| v.as_array_mut()) {
                for model in models.iter_mut() {
                    if let Some(model_obj) = model.as_object_mut() {
                        if !model_obj.contains_key("systemPrompt") {
                            model_obj.insert("systemPrompt".to_string(), Value::Null);
                            changed = true;
                        }
                    }
                }
                if changed {
                    log_info(
                        app,
                        "migrations",
                        format!("Added systemPrompt to {} models", models.len()),
                    );
                }
            }
        }

        if changed {
            storage_write_settings(
                app.clone(),
                serde_json::to_string(&settings).map_err(|e| e.to_string())?,
            )?;
            log_info(
                app,
                "migrations",
                "Settings migration completed".to_string(),
            );
        }
    }

    // Characters migration - add systemPrompt field if missing
    // Note: Characters are stored individually, so we'd need to iterate through all character files
    // Since Rust's serde will handle missing fields with #[serde(default)], we rely on that
    // The field will be automatically added when characters are saved next time
    log_info(
        app,
        "migrations",
        "Character systemPrompt fields will be added on next save (handled by serde defaults)"
            .to_string(),
    );

    Ok(())
}

/// Migration v2 -> v3: Normalize prompt templates to global prompts (remove reliance on scopes)
///
/// We keep the same storage file/format (no new file), but update all templates so they no longer
/// carry meaningful scope assignments:
/// - Set `scope` to AppWide for all non-default templates
/// - Clear `targetIds` for all templates
///
/// Notes:
/// - App Default template already uses AppWide scope; we don't change its scope (and updates are
///   prevented by prompts::update_template anyway)
/// - Character/Model/Settings continue to reference templates by ID; behavior is unchanged because
///   runtime selection uses explicit references, not scope matching
fn migrate_v2_to_v3(app: &AppHandle) -> Result<(), String> {
    use crate::chat_manager::prompts;
    use crate::chat_manager::types::PromptScope;

    // Ensure App Default exists (idempotent)
    let _ = prompts::ensure_app_default_template(app);

    let templates = prompts::load_templates(app)?;
    let mut changed = 0usize;

    for t in templates.iter() {
        // Skip changing scope for App Default; it is already AppWide
        if prompts::is_app_default_template(&t.id) {
            // We still clear target IDs if any lingered (should be empty by design)
            if !t.target_ids.is_empty() {
                let _ = prompts::update_template(
                    app,
                    t.id.clone(),
                    None,
                    None,             // keep scope as-is for App Default
                    Some(Vec::new()), // clear target ids
                    None,
                )?;
                changed += 1;
            }
            continue;
        }

        let mut need_update = false;
        let mut new_scope: Option<PromptScope> = None;
        let mut new_targets: Option<Vec<String>> = None;

        if t.scope != PromptScope::AppWide {
            new_scope = Some(PromptScope::AppWide);
            need_update = true;
        }
        if !t.target_ids.is_empty() {
            new_targets = Some(Vec::new());
            need_update = true;
        }

        if need_update {
            let _updated =
                prompts::update_template(app, t.id.clone(), None, new_scope, new_targets, None)?;
            changed += 1;
        }
    }

    log_info(
        app,
        "migrations",
        format!(
            "v2->v3 migration completed. Templates normalized: {}",
            changed
        ),
    );

    Ok(())
}

/// Migration v1 -> v2: Convert systemPrompt strings to prompt template references
///
/// This migration converts the old systemPrompt field (direct string) to the new
/// prompt template system. It creates prompt templates for each unique custom prompt
/// and updates references in Settings, Models, and Characters.
fn migrate_v1_to_v2(app: &AppHandle) -> Result<(), String> {
    use std::collections::HashMap;

    let mut prompt_map: HashMap<String, String> = HashMap::new(); // content -> template_id
    let mut templates_created = 0;

    // Ensure "App Default" template exists
    let _app_default_id = prompts::ensure_app_default_template(app)?;

    // Migrate Settings app-wide prompt
    if let Ok(Some(settings_json)) = storage_read_settings(app.clone()) {
        let mut settings: Value = serde_json::from_str(&settings_json)
            .map_err(|e| format!("Failed to parse settings: {}", e))?;

        let mut changed = false;

        if let Some(obj) = settings.as_object_mut() {
            // Migrate app-wide system prompt
            if let Some(Value::String(prompt_content)) = obj.get("systemPrompt") {
                if !prompt_content.is_empty() {
                    let template_id = if let Some(id) = prompt_map.get(prompt_content) {
                        id.clone()
                    } else {
                        let template = prompts::create_template(
                            app,
                            "App-wide Prompt".to_string(),
                            PromptScope::AppWide,
                            vec![],
                            prompt_content.clone(),
                        )?;
                        prompt_map.insert(prompt_content.clone(), template.id.clone());
                        templates_created += 1;
                        template.id
                    };

                    obj.insert("promptTemplateId".to_string(), Value::String(template_id));
                    obj.remove("systemPrompt");
                    changed = true;
                }
            }

            // Migrate model-specific prompts
            if let Some(models) = obj.get_mut("models").and_then(|v| v.as_array_mut()) {
                for (idx, model) in models.iter_mut().enumerate() {
                    if let Some(model_obj) = model.as_object_mut() {
                        if let Some(Value::String(prompt_content)) = model_obj.get("systemPrompt") {
                            if !prompt_content.is_empty() {
                                let model_id_default = format!("model_{}", idx);
                                let model_id = model_obj
                                    .get("id")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or(&model_id_default);

                                let template_id = if let Some(id) = prompt_map.get(prompt_content) {
                                    id.clone()
                                } else {
                                    let template = prompts::create_template(
                                        app,
                                        format!("Model {} Prompt", model_id),
                                        PromptScope::ModelSpecific,
                                        vec![model_id.to_string()],
                                        prompt_content.clone(),
                                    )?;
                                    prompt_map.insert(prompt_content.clone(), template.id.clone());
                                    templates_created += 1;
                                    template.id
                                };

                                model_obj.insert(
                                    "promptTemplateId".to_string(),
                                    Value::String(template_id),
                                );
                                model_obj.remove("systemPrompt");
                                changed = true;
                            }
                        }
                    }
                }
            }
        }

        if changed {
            storage_write_settings(
                app.clone(),
                serde_json::to_string(&settings).map_err(|e| e.to_string())?,
            )?;
            log_info(
                app,
                "migrations",
                format!(
                    "Migrated settings prompts, created {} templates",
                    templates_created
                ),
            );
        }
    }

    // Character prompt migration for legacy files skipped; characters moved to DB

    log_info(
        app,
        "migrations",
        format!(
            "v1->v2 migration completed. Total prompt templates created: {}",
            templates_created
        ),
    );

    Ok(())
}
