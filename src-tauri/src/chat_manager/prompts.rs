use super::types::{PromptScope, SystemPromptTemplate};
use crate::storage_manager::db::open_db;
use rusqlite::{params, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

pub const APP_DEFAULT_TEMPLATE_ID: &str = "prompt_app_default";
const APP_DEFAULT_TEMPLATE_NAME: &str = "App Default";

fn get_app_default_content() -> String {
    use super::storage::default_system_prompt_template;
    default_system_prompt_template()
}

fn generate_id() -> String {
    format!("prompt_{}", uuid::Uuid::new_v4().to_string())
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn scope_to_str(scope: &PromptScope) -> &'static str {
    match scope {
        PromptScope::AppWide => "AppWide",
        PromptScope::ModelSpecific => "ModelSpecific",
        PromptScope::CharacterSpecific => "CharacterSpecific",
    }
}

fn str_to_scope(s: &str) -> Result<PromptScope, String> {
    match s {
        "AppWide" => Ok(PromptScope::AppWide),
        "ModelSpecific" => Ok(PromptScope::ModelSpecific),
        "CharacterSpecific" => Ok(PromptScope::CharacterSpecific),
        other => Err(format!("Unknown prompt scope: {}", other)),
    }
}

fn row_to_template(row: &rusqlite::Row<'_>) -> Result<SystemPromptTemplate, rusqlite::Error> {
    let id: String = row.get(0)?;
    let name: String = row.get(1)?;
    let scope_str: String = row.get(2)?;
    let target_ids_json: String = row.get(3)?;
    let content: String = row.get(4)?;
    let created_at: u64 = row.get(5)?;
    let updated_at: u64 = row.get(6)?;

    let scope = str_to_scope(&scope_str).map_err(|_| rusqlite::Error::InvalidQuery)?;
    let target_ids: Vec<String> = serde_json::from_str(&target_ids_json).unwrap_or_default();

    Ok(SystemPromptTemplate {
        id,
        name,
        scope,
        target_ids,
        content,
        created_at,
        updated_at,
    })
}

pub fn load_templates(app: &AppHandle) -> Result<Vec<SystemPromptTemplate>, String> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, scope, target_ids, content, created_at, updated_at FROM prompt_templates ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row_to_template(row))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn create_template(
    app: &AppHandle,
    name: String,
    scope: PromptScope,
    target_ids: Vec<String>,
    content: String,
) -> Result<SystemPromptTemplate, String> {
    let conn = open_db(app)?;
    let id = generate_id();
    let now = now();
    let target_ids_json = serde_json::to_string(&target_ids).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO prompt_templates (id, name, scope, target_ids, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, name, scope_to_str(&scope), target_ids_json, content, now],
    )
    .map_err(|e| e.to_string())?;
    get_template(app, &id).map(|opt| opt.expect("inserted row should exist"))
}

pub fn update_template(
    app: &AppHandle,
    id: String,
    name: Option<String>,
    scope: Option<PromptScope>,
    target_ids: Option<Vec<String>>,
    content: Option<String>,
) -> Result<SystemPromptTemplate, String> {
    // Prevent changing scope of app default
    if is_app_default_template(&id) {
        if let Some(s) = &scope {
            // Need the current template to compare, but keeping restriction consistent
            if *s != PromptScope::AppWide {
                return Err("Cannot change scope of App Default template".to_string());
            }
        }
    }

    let conn = open_db(app)?;
    let current = get_template(app, &id)?.ok_or_else(|| format!("Template not found: {}", id))?;
    let new_name = name.unwrap_or(current.name);
    let new_scope = scope.unwrap_or(current.scope);
    let new_target_ids = target_ids.unwrap_or(current.target_ids);
    let new_content = content.unwrap_or(current.content);
    let updated_at = now();
    let target_ids_json = serde_json::to_string(&new_target_ids).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE prompt_templates SET name = ?1, scope = ?2, target_ids = ?3, content = ?4, updated_at = ?5 WHERE id = ?6",
        params![new_name, scope_to_str(&new_scope), target_ids_json, new_content, updated_at, id],
    )
    .map_err(|e| e.to_string())?;

    get_template(app, &id).map(|opt| opt.expect("updated row should exist"))
}

pub fn delete_template(app: &AppHandle, id: String) -> Result<(), String> {
    if is_app_default_template(&id) {
        return Err("Cannot delete the App Default template".to_string());
    }
    let conn = open_db(app)?;
    conn.execute("DELETE FROM prompt_templates WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_template(app: &AppHandle, id: &str) -> Result<Option<SystemPromptTemplate>, String> {
    let conn = open_db(app)?;
    conn
        .query_row(
            "SELECT id, name, scope, target_ids, content, created_at, updated_at FROM prompt_templates WHERE id = ?1",
            params![id],
            |row| row_to_template(row),
        )
        .optional()
        .map_err(|e| e.to_string())
}

pub fn ensure_app_default_template(app: &AppHandle) -> Result<String, String> {
    // Check existence
    if let Some(existing) = get_template(app, APP_DEFAULT_TEMPLATE_ID)? {
        return Ok(existing.id);
    }
    // Insert default
    let conn = open_db(app)?;
    let now = now();
    let content = get_app_default_content();
    conn.execute(
        "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?5)",
        params![APP_DEFAULT_TEMPLATE_ID, APP_DEFAULT_TEMPLATE_NAME, scope_to_str(&PromptScope::AppWide), content, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(APP_DEFAULT_TEMPLATE_ID.to_string())
}

pub fn is_app_default_template(id: &str) -> bool {
    id == APP_DEFAULT_TEMPLATE_ID
}

pub fn reset_app_default_template(app: &AppHandle) -> Result<SystemPromptTemplate, String> {
    update_template(
        app,
        APP_DEFAULT_TEMPLATE_ID.to_string(),
        None,
        None,
        None,
        Some(get_app_default_content()),
    )
}
