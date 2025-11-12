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
const CURRENT_MIGRATION_VERSION: u32 = 6;

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
    if version < 4 {
        log_info(
            app,
            "migrations",
            "Running migration v3 -> v4: Move secrets to SQLite (from secrets.json)".to_string(),
        );
        migrate_v3_to_v4(app)?;
        version = 4;
    }

    if version < 5 {
        log_info(
            app,
            "migrations",
            "Running migration v4 -> v5: Move prompt templates to SQLite (from prompt_templates.json)".to_string(),
        );
        migrate_v4_to_v5(app)?;
        version = 5;
    }

    if version < 6 {
        log_info(
            app,
            "migrations",
            "Running migration v5 -> v6: Move model pricing cache to SQLite (from models_cache.json)".to_string(),
        );
        migrate_v5_to_v6(app)?;
        version = 6;
    }

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

/// Migration v3 -> v4: move secrets from JSON file to SQLite `secrets` table
fn migrate_v3_to_v4(app: &AppHandle) -> Result<(), String> {
    use rusqlite::params;
    use serde::{Deserialize, Serialize};
    use std::collections::HashMap;
    use std::fs;

    use crate::storage_manager::db::{now_ms, open_db};
    use crate::utils::lettuce_dir;

    #[derive(Serialize, Deserialize, Default)]
    struct SecretsFile {
        entries: HashMap<String, String>,
    }

    // Locate old JSON file
    let dir = lettuce_dir(app)?;
    let old_path = dir.join("secrets.json");
    if !old_path.exists() {
        // Nothing to migrate
        return Ok(());
    }

    // Read and parse JSON
    let raw = fs::read_to_string(&old_path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        // Empty file; safe to remove
        let _ = fs::remove_file(&old_path);
        return Ok(());
    }
    let secrets: SecretsFile = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    // Upsert into DB
    let mut conn = open_db(app)?;
    let now = now_ms();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (k, v) in secrets.entries.iter() {
        // keys are formatted as "service|account"
        if let Some((service, account)) = k.split_once('|') {
            tx.execute(
                "INSERT INTO secrets (service, account, value, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)
                 ON CONFLICT(service, account) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![service, account, v, now],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    // Backup old file
    let _ = fs::rename(&old_path, dir.join("secrets.json.bak"));
    Ok(())
}

/// Migration v4 -> v5: move prompt templates from JSON file to SQLite table
fn migrate_v4_to_v5(app: &AppHandle) -> Result<(), String> {
    use rusqlite::params;
    use std::fs;

    use crate::chat_manager::types::{PromptScope, SystemPromptTemplate};
    use crate::storage_manager::db::open_db;
    use crate::utils::ensure_lettuce_dir;

    // JSON file path
    let path = ensure_lettuce_dir(app)?.join("prompt_templates.json");
    if !path.exists() {
        return Ok(());
    }

    // The JSON file format: { templates: SystemPromptTemplate[] }
    #[derive(serde::Deserialize)]
    struct PromptTemplatesFile {
        templates: Vec<SystemPromptTemplate>,
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: PromptTemplatesFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut conn = open_db(app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for t in file.templates.iter() {
        let scope_str = match t.scope {
            PromptScope::AppWide => "AppWide",
            PromptScope::ModelSpecific => "ModelSpecific",
            PromptScope::CharacterSpecific => "CharacterSpecific",
        };
        let target_ids_json = serde_json::to_string(&t.target_ids).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO prompt_templates (id, name, scope, target_ids, content, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                t.id,
                t.name,
                scope_str,
                target_ids_json,
                t.content,
                t.created_at,
                t.updated_at
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    // Backup the old JSON file
    let _ = fs::rename(&path, path.with_extension("json.bak"));
    Ok(())
}

/// Migration v5 -> v6: move pricing cache from models_cache.json to SQLite table
fn migrate_v5_to_v6(app: &AppHandle) -> Result<(), String> {
    use rusqlite::params;
    use std::collections::HashMap;
    use std::fs;

    use crate::models::ModelPricing;
    use crate::storage_manager::db::open_db;
    use crate::utils::ensure_lettuce_dir;

    #[derive(serde::Deserialize)]
    struct ModelsCacheEntry {
        id: String,
        pricing: Option<ModelPricing>,
        cached_at: u64,
    }

    #[derive(serde::Deserialize, Default)]
    struct ModelsCacheFile {
        models: HashMap<String, ModelsCacheEntry>,
        last_updated: u64,
    }

    let path = ensure_lettuce_dir(app)?.join("models_cache.json");
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if content.trim().is_empty() {
        let _ = fs::remove_file(&path);
        return Ok(());
    }
    let file: ModelsCacheFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let mut conn = open_db(app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (model_id, entry) in file.models.iter() {
        let pricing_json = match &entry.pricing {
            Some(p) => Some(serde_json::to_string(p).map_err(|e| e.to_string())?),
            None => None,
        };
        tx.execute(
            "INSERT OR REPLACE INTO model_pricing_cache (model_id, pricing_json, cached_at) VALUES (?1, ?2, ?3)",
            params![model_id, pricing_json, entry.cached_at],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    let _ = fs::rename(&path, path.with_extension("json.bak"));
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
