use serde_json::Value;
use tauri::AppHandle;
use std::collections::HashMap;

use crate::chat_manager::prompts;
use crate::chat_manager::types::PromptScope;
use crate::storage_manager::{
    storage_read_characters, storage_read_settings, storage_write_characters,
    storage_write_settings,
};
use crate::utils::log_backend;

/// Current migration version
const CURRENT_MIGRATION_VERSION: u32 = 2;

/// Migration system for updating data structures across app versions
pub fn run_migrations(app: &AppHandle) -> Result<(), String> {
    log_backend(app, "migrations", "Starting migration check".to_string());

    // Get current migration version from settings
    let current_version = get_migration_version(app)?;

    if current_version >= CURRENT_MIGRATION_VERSION {
        log_backend(
            app,
            "migrations",
            format!(
                "No migrations needed (current: {}, latest: {})",
                current_version, CURRENT_MIGRATION_VERSION
            ),
        );
        return Ok(());
    }

    log_backend(
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
        log_backend(app, "migrations", "Running migration v0 -> v1: Add custom prompt fields".to_string());
        migrate_v0_to_v1(app)?;
        version = 1;
    }

    if version < 2 {
        log_backend(app, "migrations", "Running migration v1 -> v2: Convert prompts to template system".to_string());
        migrate_v1_to_v2(app)?;
        version = 2;
    }

    // Future migrations go here:
    // if version < 2 {
    //     migrate_v1_to_v2(app)?;
    //     version = 2;
    // }

    // Update migration version
    set_migration_version(app, version)?;

    log_backend(
        app,
        "migrations",
        format!("Migrations completed successfully. Now at version {}", version),
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
            log_backend(
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
                obj.insert("migrationVersion".to_string(), Value::Number(version.into()));
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
                log_backend(app, "migrations", "Added systemPrompt to settings".to_string());
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
                    log_backend(
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
            log_backend(app, "migrations", "Settings migration completed".to_string());
        }
    }

    // Characters migration - add systemPrompt field if missing
    // Note: Characters are stored individually, so we'd need to iterate through all character files
    // Since Rust's serde will handle missing fields with #[serde(default)], we rely on that
    // The field will be automatically added when characters are saved next time
    log_backend(
        app,
        "migrations",
        "Character systemPrompt fields will be added on next save (handled by serde defaults)".to_string(),
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

                                model_obj.insert("promptTemplateId".to_string(), Value::String(template_id));
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
            log_backend(
                app,
                "migrations",
                format!("Migrated settings prompts, created {} templates", templates_created),
            );
        }
    }

    // Migrate Characters
    if let Ok(Some(characters_json)) = storage_read_characters(app.clone()) {
        let mut characters: Value = serde_json::from_str(&characters_json)
            .map_err(|e| format!("Failed to parse characters: {}", e))?;

        let mut changed = false;

        if let Some(chars_array) = characters.as_array_mut() {
            for (idx, character) in chars_array.iter_mut().enumerate() {
                if let Some(char_obj) = character.as_object_mut() {
                    if let Some(Value::String(prompt_content)) = char_obj.get("systemPrompt") {
                        if !prompt_content.is_empty() {
                            let char_id_default = format!("char_{}", idx);
                            let char_id = char_obj
                                .get("id")
                                .and_then(|v| v.as_str())
                                .unwrap_or(&char_id_default);
                            let char_name = char_obj
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Unknown");

                            let template_id = if let Some(id) = prompt_map.get(prompt_content) {
                                id.clone()
                            } else {
                                let template = prompts::create_template(
                                    app,
                                    format!("{} Prompt", char_name),
                                    PromptScope::CharacterSpecific,
                                    vec![char_id.to_string()],
                                    prompt_content.clone(),
                                )?;
                                prompt_map.insert(prompt_content.clone(), template.id.clone());
                                templates_created += 1;
                                template.id
                            };

                            char_obj.insert("promptTemplateId".to_string(), Value::String(template_id));
                            char_obj.remove("systemPrompt");
                            changed = true;
                        }
                    }
                }
            }

            if changed {
                storage_write_characters(
                    app.clone(),
                    serde_json::to_string(&characters).map_err(|e| e.to_string())?,
                )?;
                log_backend(
                    app,
                    "migrations",
                    format!("Migrated character prompts, total templates created: {}", templates_created),
                );
            }
        }
    }

    log_backend(
        app,
        "migrations",
        format!("v1->v2 migration completed. Total prompt templates created: {}", templates_created),
    );

    Ok(())
}