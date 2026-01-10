use super::types::{PromptScope, SystemPromptTemplate};
use crate::{
    chat_manager::storage::get_base_prompt, chat_manager::storage::PromptType,
    storage_manager::db::open_db,
};
use rusqlite::{params, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

pub const APP_DEFAULT_TEMPLATE_ID: &str = "prompt_app_default";
pub const APP_DYNAMIC_SUMMARY_TEMPLATE_ID: &str = "prompt_app_dynamic_summary";
pub const APP_DYNAMIC_MEMORY_TEMPLATE_ID: &str = "prompt_app_dynamic_memory";
pub const APP_HELP_ME_REPLY_TEMPLATE_ID: &str = "prompt_app_help_me_reply";
pub const APP_GROUP_CHAT_TEMPLATE_ID: &str = "prompt_app_group_chat";
pub const APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID: &str = "prompt_app_group_chat_roleplay";
const APP_DEFAULT_TEMPLATE_NAME: &str = "App Default";
const APP_DYNAMIC_SUMMARY_TEMPLATE_NAME: &str = "Dynamic Memory: Summarizer";
const APP_DYNAMIC_MEMORY_TEMPLATE_NAME: &str = "Dynamic Memory: Memory Manager";
const APP_HELP_ME_REPLY_TEMPLATE_NAME: &str = "Reply Helper";

/// Get required variables for a specific template ID
pub fn get_required_variables(template_id: &str) -> Vec<String> {
    match template_id {
        APP_DEFAULT_TEMPLATE_ID => vec![
            "{{scene}}".to_string(),
            "{{scene_direction}}".to_string(),
            "{{char.name}}".to_string(),
            "{{char.desc}}".to_string(),
            "{{context_summary}}".to_string(),
            "{{key_memories}}".to_string(),
        ],
        APP_DYNAMIC_SUMMARY_TEMPLATE_ID => vec!["{{prev_summary}}".to_string()],
        APP_DYNAMIC_MEMORY_TEMPLATE_ID => vec!["{{max_entries}}".to_string()],
        APP_HELP_ME_REPLY_TEMPLATE_ID => vec![
            "{{char.name}}".to_string(),
            "{{char.desc}}".to_string(),
            "{{persona.name}}".to_string(),
            "{{persona.desc}}".to_string(),
            "{{current_draft}}".to_string(),
        ],
        APP_GROUP_CHAT_TEMPLATE_ID => vec![
            "{{char.name}}".to_string(),
            "{{char.desc}}".to_string(),
            "{{persona.name}}".to_string(),
            "{{persona.desc}}".to_string(),
            "{{group_characters}}".to_string(),
        ],
        APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID => vec![
            "{{scene}}".to_string(),
            "{{scene_direction}}".to_string(),
            "{{char.name}}".to_string(),
            "{{char.desc}}".to_string(),
            "{{persona.name}}".to_string(),
            "{{persona.desc}}".to_string(),
            "{{group_characters}}".to_string(),
            "{{context_summary}}".to_string(),
            "{{key_memories}}".to_string(),
        ],
        _ => vec![],
    }
}

/// Validate that all required variables exist in the content
pub fn validate_required_variables(template_id: &str, content: &str) -> Result<(), Vec<String>> {
    let required = get_required_variables(template_id);
    if required.is_empty() {
        return Ok(());
    }

    let missing: Vec<String> = required
        .into_iter()
        .filter(|var| !content.contains(var))
        .collect();

    if missing.is_empty() {
        Ok(())
    } else {
        Err(missing)
    }
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
    if out.is_empty() {
        // Guarantee existence of App Default template even if setup call was skipped
        let _ = ensure_app_default_template(app)?;
        // Reload
        let mut stmt2 = conn
            .prepare(
                "SELECT id, name, scope, target_ids, content, created_at, updated_at FROM prompt_templates ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows2 = stmt2
            .query_map([], |row| row_to_template(row))
            .map_err(|e| e.to_string())?;
        out.clear();
        for r in rows2 {
            out.push(r.map_err(|e| e.to_string())?);
        }
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

    // Validate required variables for protected templates
    if is_app_default_template(&id) {
        if let Err(missing) = validate_required_variables(&id, &new_content) {
            return Err(format!(
                "Protected template must contain required variables: {}",
                missing.join(", ")
            ));
        }
    }
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
        return Err("This template is protected and cannot be deleted".to_string());
    }

    if get_template(app, &id)?.is_none() {
        return Err("Template not found".to_string());
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
    let content = get_base_prompt(PromptType::SystemPrompt);
    conn.execute(
        "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?5)",
        params![APP_DEFAULT_TEMPLATE_ID, APP_DEFAULT_TEMPLATE_NAME, scope_to_str(&PromptScope::AppWide), content, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(APP_DEFAULT_TEMPLATE_ID.to_string())
}

pub fn ensure_dynamic_memory_templates(app: &AppHandle) -> Result<(), String> {
    let conn = open_db(app)?;
    let now = now();

    // Summarizer template
    if get_template(app, APP_DYNAMIC_SUMMARY_TEMPLATE_ID)?.is_none() {
        conn.execute(
            "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?5)",
            params![
                APP_DYNAMIC_SUMMARY_TEMPLATE_ID,
                APP_DYNAMIC_SUMMARY_TEMPLATE_NAME,
                scope_to_str(&PromptScope::AppWide),
                get_base_prompt(PromptType::DynamicSummaryPrompt),
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Memory manager template
    if get_template(app, APP_DYNAMIC_MEMORY_TEMPLATE_ID)?.is_none() {
        conn.execute(
            "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?5)",
            params![
                APP_DYNAMIC_MEMORY_TEMPLATE_ID,
                APP_DYNAMIC_MEMORY_TEMPLATE_NAME,
                scope_to_str(&PromptScope::AppWide),
                get_base_prompt(PromptType::DynamicMemoryPrompt),
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn is_app_default_template(id: &str) -> bool {
    id == APP_DEFAULT_TEMPLATE_ID
        || id == APP_DYNAMIC_SUMMARY_TEMPLATE_ID
        || id == APP_DYNAMIC_MEMORY_TEMPLATE_ID
        || id == APP_HELP_ME_REPLY_TEMPLATE_ID
}

pub fn reset_app_default_template(app: &AppHandle) -> Result<SystemPromptTemplate, String> {
    update_template(
        app,
        APP_DEFAULT_TEMPLATE_ID.to_string(),
        None,
        None,
        None,
        Some(get_base_prompt(PromptType::SystemPrompt)),
    )
}

pub fn reset_dynamic_summary_template(app: &AppHandle) -> Result<SystemPromptTemplate, String> {
    update_template(
        app,
        APP_DYNAMIC_SUMMARY_TEMPLATE_ID.to_string(),
        None,
        None,
        None,
        Some(get_base_prompt(PromptType::DynamicSummaryPrompt)),
    )
}

pub fn reset_dynamic_memory_template(app: &AppHandle) -> Result<SystemPromptTemplate, String> {
    update_template(
        app,
        APP_DYNAMIC_MEMORY_TEMPLATE_ID.to_string(),
        None,
        None,
        None,
        Some(get_base_prompt(PromptType::DynamicMemoryPrompt)),
    )
}

pub fn ensure_help_me_reply_template(app: &AppHandle) -> Result<(), String> {
    if get_template(app, APP_HELP_ME_REPLY_TEMPLATE_ID)?.is_none() {
        let conn = open_db(app)?;
        let now = now();
        conn.execute(
            "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?5)",
            params![
                APP_HELP_ME_REPLY_TEMPLATE_ID,
                APP_HELP_ME_REPLY_TEMPLATE_NAME,
                scope_to_str(&PromptScope::AppWide),
                get_base_prompt(PromptType::HelpMeReplyPrompt),
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn reset_help_me_reply_template(app: &AppHandle) -> Result<SystemPromptTemplate, String> {
    update_template(
        app,
        APP_HELP_ME_REPLY_TEMPLATE_ID.to_string(),
        None,
        None,
        None,
        Some(get_base_prompt(PromptType::HelpMeReplyPrompt)),
    )
}

/// Get the Help Me Reply template from DB, falling back to default if not found
pub fn get_help_me_reply_prompt(app: &AppHandle) -> String {
    match get_template(app, APP_HELP_ME_REPLY_TEMPLATE_ID) {
        Ok(Some(template)) => template.content,
        _ => get_base_prompt(PromptType::HelpMeReplyPrompt),
    }
}

/// Get the Group Chat template from DB, falling back to default if not found
pub fn get_group_chat_prompt(app: &AppHandle) -> String {
    match get_template(app, APP_GROUP_CHAT_TEMPLATE_ID) {
        Ok(Some(template)) => template.content,
        _ => get_base_prompt(PromptType::GroupChatPrompt),
    }
}

/// Get the Group Chat Roleplay template from DB, falling back to default if not found
pub fn get_group_chat_roleplay_prompt(app: &AppHandle) -> String {
    match get_template(app, APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID) {
        Ok(Some(template)) => template.content,
        _ => get_base_prompt(PromptType::GroupChatRoleplayPrompt),
    }
}
