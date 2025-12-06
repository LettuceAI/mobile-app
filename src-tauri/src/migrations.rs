use serde_json::Value;
use tauri::AppHandle;

use crate::chat_manager::prompts;
use crate::chat_manager::types::PromptScope;
use crate::storage_manager::{settings::storage_read_settings, settings::storage_write_settings};
use crate::utils::log_info;

/// Current migration version
pub const CURRENT_MIGRATION_VERSION: u32 = 17;

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

    if version < 7 {
        log_info(
            app,
            "migrations",
            "Running migration v6 -> v7: Add api_key column to provider_credentials and backfill"
                .to_string(),
        );
        migrate_v6_to_v7(app)?;
        version = 7;
    }

    if version < 8 {
        log_info(
            app,
            "migrations",
            "Running migration v7 -> v8: Add memories column to sessions table".to_string(),
        );
        migrate_v7_to_v8(app)?;
        version = 8;
    }

    if version < 9 {
        log_info(
            app,
            "migrations",
            "Running migration v8 -> v9: Add advanced_settings column to settings table"
                .to_string(),
        );
        migrate_v8_to_v9(app)?;
        version = 9;
    }

    if version < 10 {
        log_info(
            app,
            "migrations",
            "Running migration v9 -> v10: Add memory_type to characters".to_string(),
        );
        migrate_v9_to_v10(app)?;
        version = 10;
    }

    if version < 11 {
        log_info(
            app,
            "migrations",
            "Running migration v10 -> v11: Add memory_embeddings to sessions".to_string(),
        );
        migrate_v10_to_v11(app)?;
        version = 11;
    }

    if version < 12 {
        log_info(
            app,
            "migrations",
            "Running migration v11 -> v12: Add memory summary and tool events to sessions"
                .to_string(),
        );
        migrate_v11_to_v12(app)?;
        version = 12;
    }

    if version < 13 {
        log_info(
            app,
            "migrations",
            "Running migration v12 -> v13: Add operation_type to usage_records".to_string(),
        );
        migrate_v12_to_v13(app)?;
        version = 13;
    }

    if version < 14 {
        log_info(
            app,
            "migrations",
            "Running migration v13 -> v14: Add model_type to models".to_string(),
        );
        migrate_v13_to_v14(app)?;
        version = 14;
    }

    if version < 15 {
        log_info(
            app,
            "migrations",
            "Running migration v14 -> v15: Add attachments column to messages".to_string(),
        );
        migrate_v14_to_v15(app)?;
        version = 15;
    }

    if version < 16 {
        log_info(
            app,
            "migrations",
            "Running migration v15 -> v16: Backfill token_count for existing memory embeddings and add usage token breakdown".to_string(),
        );
        migrate_v15_to_v16(app)?;
        version = 16;
    }

    if version < 17 {
        log_info(
            app,
            "migrations",
            "Running migration v16 -> v17: Add memory_tokens and summary_tokens to usage_records".to_string(),
        );
        migrate_v16_to_v17(app)?;
        version = 17;
    }

    // v6 -> v7 (model list cache) removed; feature dropped

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

    // Best-effort cleanup of residual legacy files that should no longer exist
    cleanup_legacy_files(app);

    Ok(())
}

/// Remove legacy JSON files if they still exist (post-migration safety)
fn cleanup_legacy_files(app: &AppHandle) {
    use std::fs;
    if let Ok(dir) = crate::utils::ensure_lettuce_dir(app) {
        let candidates = ["secrets.json", "prompt_templates.json"];
        for name in candidates.iter() {
            let path = dir.join(name);
            if path.exists() {
                let _ = fs::remove_file(&path);
            }
        }
    }
}

/// Get the current migration version
fn get_migration_version(app: &AppHandle) -> Result<u32, String> {
    use crate::storage_manager::db::open_db;

    let conn = open_db(app)?;

    // Check if settings table exists first (it should if init_db ran)
    let count: i32 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='settings'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if count == 0 {
        return Ok(0);
    }

    let version: u32 = conn
        .query_row(
            "SELECT migration_version FROM settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(version)
}

/// Set the migration version
fn set_migration_version(app: &AppHandle, version: u32) -> Result<(), String> {
    use crate::storage_manager::db::{now_ms, open_db};
    use rusqlite::params;

    let conn = open_db(app)?;
    let now = now_ms();

    // Ensure row exists (it should)
    conn.execute(
        "UPDATE settings SET migration_version = ?1, updated_at = ?2 WHERE id = 1",
        params![version, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
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
        _id: String,
        pricing: Option<ModelPricing>,
        cached_at: u64,
    }

    #[derive(serde::Deserialize, Default)]
    struct ModelsCacheFile {
        models: HashMap<String, ModelsCacheEntry>,
        _last_updated: u64,
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

/// Migration v6 -> v7: add provider_credentials.api_key and backfill from secrets
fn migrate_v6_to_v7(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;
    use rusqlite::{params, OptionalExtension};

    let conn = open_db(app)?;
    // Add column if it doesn't exist
    let _ = conn.execute(
        "ALTER TABLE provider_credentials ADD COLUMN api_key TEXT",
        [],
    );

    // Backfill using secrets table convention: service = 'lettuceai:apiKey', account = '{provider_id}:{cred_id}'
    // For each credential row, attempt to set api_key from secrets if missing
    let mut stmt = conn
        .prepare("SELECT id, provider_id FROM provider_credentials WHERE api_key IS NULL OR api_key = ''")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (cred_id, provider_id) = row.map_err(|e| e.to_string())?;
        let account = format!("{}:{}", provider_id, cred_id);
        let key_opt: Option<String> = conn
            .query_row(
                "SELECT value FROM secrets WHERE service = 'lettuceai:apiKey' AND account = ?1",
                params![account],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(key) = key_opt {
            conn.execute(
                "UPDATE provider_credentials SET api_key = ?1 WHERE id = ?2",
                params![key, cred_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Migration v7 -> v8: add memories column to sessions table
fn migrate_v7_to_v8(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;

    let conn = open_db(app)?;
    // Add column with default empty JSON array if it doesn't exist
    let _ = conn.execute(
        "ALTER TABLE sessions ADD COLUMN memories TEXT NOT NULL DEFAULT '[]'",
        [],
    );

    Ok(())
}

/// Migration v8 -> v9: add advanced_settings column to settings table
fn migrate_v8_to_v9(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;

    let conn = open_db(app)?;
    // Add column with default null if it doesn't exist
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN advanced_settings TEXT", []);

    Ok(())
}

/// Migration v9 -> v10: add memory_type column to characters table
fn migrate_v9_to_v10(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;

    let conn = open_db(app)?;

    // Check if column already exists
    let mut has_column = false;
    let mut stmt = conn
        .prepare("PRAGMA table_info(characters)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(row.get::<_, String>(1)?))
        .map_err(|e| e.to_string())?;

    for col in rows {
        let name = col.map_err(|e| e.to_string())?;
        if name == "memory_type" {
            has_column = true;
            break;
        }
    }

    if !has_column {
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN memory_type TEXT DEFAULT 'manual'",
            [],
        );
    }

    // Ensure all rows have a value
    let _ = conn.execute(
        "UPDATE characters SET memory_type = 'manual' WHERE memory_type IS NULL",
        [],
    );

    Ok(())
}

/// Migration v10 -> v11: add memory_embeddings column to sessions table
fn migrate_v10_to_v11(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;

    let conn = open_db(app)?;

    // Check for existing column
    let mut has_column = false;
    let mut stmt = conn
        .prepare("PRAGMA table_info(sessions)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(row.get::<_, String>(1)?))
        .map_err(|e| e.to_string())?;

    for col in rows {
        let name = col.map_err(|e| e.to_string())?;
        if name == "memory_embeddings" {
            has_column = true;
            break;
        }
    }

    if !has_column {
        let _ = conn.execute(
            "ALTER TABLE sessions ADD COLUMN memory_embeddings TEXT DEFAULT '[]'",
            [],
        );
    }

    let _ = conn.execute(
        "UPDATE sessions SET memory_embeddings = '[]' WHERE memory_embeddings IS NULL",
        [],
    );

    Ok(())
}

/// Migration v11 -> v12: add memory_summary and memory_tool_events columns to sessions
fn migrate_v11_to_v12(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;

    let conn = open_db(app)?;

    // Add memory_summary if missing
    let mut has_summary = false;
    let mut has_events = false;
    let mut stmt = conn
        .prepare("PRAGMA table_info(sessions)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(row.get::<_, String>(1)?))
        .map_err(|e| e.to_string())?;

    for col in rows {
        let name = col.map_err(|e| e.to_string())?;
        if name == "memory_summary" {
            has_summary = true;
        }
        if name == "memory_tool_events" {
            has_events = true;
        }
    }

    if !has_summary {
        let _ = conn.execute("ALTER TABLE sessions ADD COLUMN memory_summary TEXT", []);
    }

    if !has_events {
        let _ = conn.execute(
            "ALTER TABLE sessions ADD COLUMN memory_tool_events TEXT DEFAULT '[]'",
            [],
        );
    }

    let _ = conn.execute(
        "UPDATE sessions SET memory_tool_events = coalesce(memory_tool_events, '[]')",
        [],
    );

    Ok(())
}

/// Migration v6 -> v7: move per-credential model list cache from models-cache.json to SQLite table
// migrate_v6_to_v7 removed (feature dropped)

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

/// Migration v12 -> v13: add operation_type column to usage_records
fn migrate_v12_to_v13(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;

    let conn = open_db(app)?;

    // Check if column already exists
    let mut has_column = false;
    let mut stmt = conn
        .prepare("PRAGMA table_info(usage_records)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(row.get::<_, String>(1)?))
        .map_err(|e| e.to_string())?;

    for col in rows {
        let name = col.map_err(|e| e.to_string())?;
        if name == "operation_type" {
            has_column = true;
            break;
        }
    }

    if !has_column {
        let _ = conn.execute(
            "ALTER TABLE usage_records ADD COLUMN operation_type TEXT DEFAULT 'chat'",
            [],
        );
    }

    // Ensure all existing rows have a value
    let _ = conn.execute(
        "UPDATE usage_records SET operation_type = 'chat' WHERE operation_type IS NULL",
        [],
    );

    Ok(())
}

/// Migration v13 -> v14: add model_type column to models table
fn migrate_v13_to_v14(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;

    let conn = open_db(app)?;

    // Check if column already exists
    let mut has_column = false;
    let mut stmt = conn
        .prepare("PRAGMA table_info(models)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(row.get::<_, String>(1)?))
        .map_err(|e| e.to_string())?;

    for col in rows {
        let name = col.map_err(|e| e.to_string())?;
        if name == "model_type" {
            has_column = true;
            break;
        }
    }

    if !has_column {
        let _ = conn.execute(
            "ALTER TABLE models ADD COLUMN model_type TEXT DEFAULT 'chat'",
            [],
        );
    }

    // Ensure all existing rows have a value
    let _ = conn.execute(
        "UPDATE models SET model_type = 'chat' WHERE model_type IS NULL",
        [],
    );

    Ok(())
}

/// Migration v14 -> v15: add attachments column to messages table
fn migrate_v14_to_v15(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;

    let conn = open_db(app)?;

    // Check if column already exists
    let mut has_column = false;
    let mut stmt = conn
        .prepare("PRAGMA table_info(messages)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(row.get::<_, String>(1)?))
        .map_err(|e| e.to_string())?;

    for col in rows {
        let name = col.map_err(|e| e.to_string())?;
        if name == "attachments" {
            has_column = true;
            break;
        }
    }

    if !has_column {
        let _ = conn.execute(
            "ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT '[]'",
            [],
        );
    }

    Ok(())
}

/// Migration v15 -> v16: backfill token_count for existing memory embeddings and add memory_summary_token_count
fn migrate_v15_to_v16(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;
    use serde_json::Value;

    let conn = open_db(app)?;

    // Add memory_summary_token_count column if it doesn't exist
    let mut has_column = false;
    let mut stmt = conn
        .prepare("PRAGMA table_info(sessions)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(row.get::<_, String>(1)?))
        .map_err(|e| e.to_string())?;

    for col in rows {
        let name = col.map_err(|e| e.to_string())?;
        if name == "memory_summary_token_count" {
            has_column = true;
            break;
        }
    }

    if !has_column {
        let _ = conn.execute(
            "ALTER TABLE sessions ADD COLUMN memory_summary_token_count INTEGER NOT NULL DEFAULT 0",
            [],
        );
    }

    // Try to backfill token counts only if tokenizer is available
    // If tokenizer isn't available (embedding model not downloaded), skip backfill
    // Token counts will be calculated when memories/summaries are created
    let tokenizer_available = {
        use crate::embedding_model::embedding_model_dir;
        let model_dir = embedding_model_dir(app).ok();
        model_dir.map(|dir| dir.join("tokenizer.json").exists()).unwrap_or(false)
    };

    if !tokenizer_available {
        // Skip backfill - token counts will be 0 for existing memories
        // They'll get proper counts when edited or when new memories are added
        return Ok(());
    }

    use crate::tokenizer::count_tokens;

    // Backfill token counts for memory_embeddings
    let mut stmt = conn
        .prepare("SELECT id, memory_embeddings FROM sessions WHERE memory_embeddings IS NOT NULL AND memory_embeddings != '[]'")
        .map_err(|e| e.to_string())?;

    let session_rows: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Process each session
    for (session_id, embeddings_json) in session_rows {
        let mut embeddings: Vec<Value> = serde_json::from_str(&embeddings_json)
            .map_err(|e| format!("Failed to parse memory_embeddings for session {}: {}", session_id, e))?;

        let mut updated = false;

        for embedding in &mut embeddings {
            // Check if tokenCount already exists
            if embedding.get("tokenCount").is_some() {
                continue;
            }

            // Get the text field
            if let Some(text) = embedding.get("text").and_then(|v| v.as_str()) {
                // Calculate token count
                let token_count = count_tokens(app, text).unwrap_or(0);
                
                // Add tokenCount field
                if let Value::Object(map) = embedding {
                    map.insert("tokenCount".to_string(), Value::Number(token_count.into()));
                    updated = true;
                }
            }
        }

        // Update the session if any embeddings were modified
        if updated {
            let updated_json = serde_json::to_string(&embeddings)
                .map_err(|e| format!("Failed to serialize updated embeddings: {}", e))?;

            conn.execute(
                "UPDATE sessions SET memory_embeddings = ?1 WHERE id = ?2",
                [&updated_json, &session_id],
            )
            .map_err(|e| format!("Failed to update session {}: {}", session_id, e))?;
        }
    }

    // Backfill token counts for memory_summary
    let mut stmt = conn
        .prepare("SELECT id, memory_summary FROM sessions WHERE memory_summary IS NOT NULL AND memory_summary != '' AND memory_summary_token_count = 0")
        .map_err(|e| e.to_string())?;

    let summary_rows: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (session_id, summary) in summary_rows {
        let token_count = count_tokens(app, &summary).unwrap_or(0);
        
        conn.execute(
            "UPDATE sessions SET memory_summary_token_count = ?1 WHERE id = ?2",
            [&token_count.to_string(), &session_id],
        )
        .map_err(|e| format!("Failed to update summary token count for session {}: {}", session_id, e))?;
    }

    Ok(())
}

/// Migration v16 -> v17: add memory_tokens and summary_tokens columns to usage_records
fn migrate_v16_to_v17(app: &AppHandle) -> Result<(), String> {
    use crate::storage_manager::db::open_db;

    let conn = open_db(app)?;

    // Check if memory_tokens column exists
    let mut has_memory_tokens = false;
    let mut has_summary_tokens = false;
    let mut stmt = conn
        .prepare("PRAGMA table_info(usage_records)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(row.get::<_, String>(1)?))
        .map_err(|e| e.to_string())?;

    for col in rows {
        let name = col.map_err(|e| e.to_string())?;
        if name == "memory_tokens" {
            has_memory_tokens = true;
        }
        if name == "summary_tokens" {
            has_summary_tokens = true;
        }
    }

    if !has_memory_tokens {
        let _ = conn.execute(
            "ALTER TABLE usage_records ADD COLUMN memory_tokens INTEGER",
            [],
        );
    }

    if !has_summary_tokens {
        let _ = conn.execute(
            "ALTER TABLE usage_records ADD COLUMN summary_tokens INTEGER",
            [],
        );
    }

    Ok(())
}
