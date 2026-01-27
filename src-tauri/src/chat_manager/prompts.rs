use super::types::{
    PromptEntryPosition, PromptEntryRole, PromptScope, SystemPromptEntry, SystemPromptTemplate,
};
use crate::{
    chat_manager::storage::{get_base_prompt, get_base_prompt_entries, PromptType},
    storage_manager::db::open_db,
};
use rusqlite::{params, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

pub const APP_DEFAULT_TEMPLATE_ID: &str = "prompt_app_default";
pub const APP_DYNAMIC_SUMMARY_TEMPLATE_ID: &str = "prompt_app_dynamic_summary";
pub const APP_DYNAMIC_MEMORY_TEMPLATE_ID: &str = "prompt_app_dynamic_memory";
pub const APP_HELP_ME_REPLY_TEMPLATE_ID: &str = "prompt_app_help_me_reply";
pub const APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID: &str =
    "prompt_app_help_me_reply_conversational";
pub const APP_GROUP_CHAT_TEMPLATE_ID: &str = "prompt_app_group_chat";
pub const APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID: &str = "prompt_app_group_chat_roleplay";
const APP_DEFAULT_TEMPLATE_NAME: &str = "App Default";
const APP_DYNAMIC_SUMMARY_TEMPLATE_NAME: &str = "Dynamic Memory: Summarizer";
const APP_DYNAMIC_MEMORY_TEMPLATE_NAME: &str = "Dynamic Memory: Memory Manager";
const APP_HELP_ME_REPLY_TEMPLATE_NAME: &str = "Reply Helper";
const APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_NAME: &str = "Reply Helper (Conversational)";

fn supports_entry_prompts(_id: &str) -> bool {
    true
}

fn default_modular_prompt_entries() -> Vec<SystemPromptEntry> {
    vec![
        SystemPromptEntry {
            id: "entry_base".to_string(),
            name: "Base Directive".to_string(),
            role: PromptEntryRole::System,
            content:
                "You are participating in an immersive roleplay. Your goal is to fully embody your character and create an engaging, authentic experience.".to_string(),
            enabled: true,
            injection_position: PromptEntryPosition::Relative,
            injection_depth: 0,
            system_prompt: true,
        },
        SystemPromptEntry {
            id: "entry_scenario".to_string(),
            name: "Scenario".to_string(),
            role: PromptEntryRole::System,
            content: "# Scenario\n{{scene}}\n\n# Scene Direction\n{{scene_direction}}\n\nThis is your hidden directive for how this scene should unfold. Guide the narrative toward this outcome naturally and organically through your character's actions, dialogue, and the world's events. NEVER explicitly mention or reveal this direction to {{persona.name}} - let it emerge through immersive roleplay."
                .to_string(),
            enabled: true,
            injection_position: PromptEntryPosition::Relative,
            injection_depth: 0,
            system_prompt: false,
        },
        SystemPromptEntry {
            id: "entry_character".to_string(),
            name: "Character Definition".to_string(),
            role: PromptEntryRole::System,
            content: "# Your Character: {{char.name}}\n{{char.desc}}\n\nEmbody {{char.name}}'s personality, mannerisms, and speech patterns completely. Stay true to their character traits, background, and motivations in every response.".to_string(),
            enabled: true,
            injection_position: PromptEntryPosition::Relative,
            injection_depth: 0,
            system_prompt: false,
        },
        SystemPromptEntry {
            id: "entry_persona".to_string(),
            name: "Persona Definition".to_string(),
            role: PromptEntryRole::System,
            content: "# {{persona.name}}'s Character\n{{persona.desc}}".to_string(),
            enabled: true,
            injection_position: PromptEntryPosition::Relative,
            injection_depth: 0,
            system_prompt: false,
        },
        SystemPromptEntry {
            id: "entry_world_info".to_string(),
            name: "World Information".to_string(),
            role: PromptEntryRole::System,
            content: "# World Information\n    The following is essential lore about this world, its characters, locations, items, and concepts. You MUST incorporate this information naturally into your roleplay when relevant. Treat this as established canon that shapes how characters behave, what they know, and how the world works.\n    {{lorebook}}"
                .to_string(),
            enabled: true,
            injection_position: PromptEntryPosition::Relative,
            injection_depth: 0,
            system_prompt: false,
        },
        SystemPromptEntry {
            id: "entry_context_summary".to_string(),
            name: "Context Summary".to_string(),
            role: PromptEntryRole::System,
            content: "# Context Summary\n{{context_summary}}".to_string(),
            enabled: true,
            injection_position: PromptEntryPosition::Relative,
            injection_depth: 0,
            system_prompt: false,
        },
        SystemPromptEntry {
            id: "entry_key_memories".to_string(),
            name: "Key Memories".to_string(),
            role: PromptEntryRole::System,
            content:
                "# Key Memories\nImportant facts to remember in this conversation:\n{{key_memories}}"
                    .to_string(),
            enabled: true,
            injection_position: PromptEntryPosition::Relative,
            injection_depth: 0,
            system_prompt: false,
        },
        SystemPromptEntry {
            id: "entry_instructions".to_string(),
            name: "Instructions".to_string(),
            role: PromptEntryRole::System,
            content: "# Instructions\n**Character & Roleplay:**\n- Write as {{char.name}} from their perspective, responding based on their personality, background, and current situation\n- You may also portray NPCs and background characters when relevant to the scene, but NEVER speak or act as {{persona.name}}\n- Show emotions through actions, body language, and dialogue - don't just state them\n- React authentically to {{persona.name}}'s actions and dialogue\n- Never break character unless {{persona.name}} explicitly asks you to step out of roleplay\n\n**World & Lore:**\n- ACTIVELY incorporate the World Information above when locations, characters, items, or concepts from the lore are relevant\n- Maintain consistency with established facts and the scenario\n\n**Pacing & Style:**\n- Keep responses concise and focused so {{persona.name}} can actively participate\n- Let scenes unfold naturally - avoid summarizing or rushing\n- Use vivid, sensory details for immersion\n- If you see [CONTINUE], continue exactly where you left off without restarting\n\n{{content_rules}}".to_string(),
            enabled: true,
            injection_position: PromptEntryPosition::Relative,
            injection_depth: 0,
            system_prompt: false,
        },
    ]
}

fn single_entry_from_content(content: &str) -> Vec<SystemPromptEntry> {
    vec![SystemPromptEntry {
        id: "entry_system".to_string(),
        name: "System Prompt".to_string(),
        role: PromptEntryRole::System,
        content: content.to_string(),
        enabled: true,
        injection_position: PromptEntryPosition::Relative,
        injection_depth: 0,
        system_prompt: true,
    }]
}

fn template_entries_to_content(entries: &[SystemPromptEntry]) -> String {
    let merged = entries
        .iter()
        .filter(|entry| entry.enabled && !entry.content.trim().is_empty())
        .map(|entry| entry.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    if merged.trim().is_empty() {
        String::new()
    } else {
        merged
    }
}

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
        APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID => vec![
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
        other => Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Unknown prompt scope: {}", other),
        )),
    }
}

fn row_to_template(row: &rusqlite::Row<'_>) -> Result<SystemPromptTemplate, rusqlite::Error> {
    let id: String = row.get(0)?;
    let name: String = row.get(1)?;
    let scope_str: String = row.get(2)?;
    let target_ids_json: String = row.get(3)?;
    let content: String = row.get(4)?;
    let entries_json: String = row.get(5)?;
    let created_at: u64 = row.get(6)?;
    let updated_at: u64 = row.get(7)?;

    let scope = str_to_scope(&scope_str).map_err(|_| rusqlite::Error::InvalidQuery)?;
    let target_ids: Vec<String> = serde_json::from_str(&target_ids_json).unwrap_or_default();
    let entries: Vec<SystemPromptEntry> = serde_json::from_str(&entries_json).unwrap_or_default();
    let entries = if entries.is_empty() && supports_entry_prompts(&id) && !content.is_empty() {
        single_entry_from_content(&content)
    } else {
        entries
    };

    Ok(SystemPromptTemplate {
        id,
        name,
        scope,
        target_ids,
        content,
        entries,
        created_at,
        updated_at,
    })
}

pub fn load_templates(app: &AppHandle) -> Result<Vec<SystemPromptTemplate>, String> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, scope, target_ids, content, entries, created_at, updated_at FROM prompt_templates ORDER BY created_at ASC",
        )
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let rows = stmt
        .query_map([], |row| row_to_template(row))
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?);
    }
    if out.is_empty() {
        // Guarantee existence of App Default template even if setup call was skipped
        let _ = ensure_app_default_template(app)?;
        // Reload
        let mut stmt2 = conn
            .prepare(
                "SELECT id, name, scope, target_ids, content, entries, created_at, updated_at FROM prompt_templates ORDER BY created_at ASC",
            )
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        let rows2 = stmt2
            .query_map([], |row| row_to_template(row))
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        out.clear();
        for r in rows2 {
            out.push(r.map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?);
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
    entries: Option<Vec<SystemPromptEntry>>,
) -> Result<SystemPromptTemplate, String> {
    let conn = open_db(app)?;
    let id = generate_id();
    let now = now();
    let target_ids_json = serde_json::to_string(&target_ids)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let entries = entries.unwrap_or_else(|| {
        if supports_entry_prompts(&id) && !content.is_empty() {
            single_entry_from_content(&content)
        } else {
            Vec::new()
        }
    });
    let entries_json = serde_json::to_string(&entries)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    conn.execute(
        "INSERT INTO prompt_templates (id, name, scope, target_ids, content, entries, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            id,
            name,
            scope_to_str(&scope),
            target_ids_json,
            content,
            entries_json,
            now
        ],
    )
    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    get_template(app, &id).map(|opt| opt.expect("inserted row should exist"))
}

pub fn update_template(
    app: &AppHandle,
    id: String,
    name: Option<String>,
    scope: Option<PromptScope>,
    target_ids: Option<Vec<String>>,
    content: Option<String>,
    entries: Option<Vec<SystemPromptEntry>>,
) -> Result<SystemPromptTemplate, String> {
    // Prevent changing scope of app default
    if is_app_default_template(&id) {
        if let Some(s) = &scope {
            // Need the current template to compare, but keeping restriction consistent
            if *s != PromptScope::AppWide {
                return Err(crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    "Cannot change scope of App Default template",
                ));
            }
        }
    }

    let conn = open_db(app)?;
    let current = get_template(app, &id)?.ok_or_else(|| format!("Template not found: {}", id))?;
    let new_name = name.unwrap_or(current.name);
    let new_scope = scope.unwrap_or(current.scope);
    let new_target_ids = target_ids.unwrap_or(current.target_ids);
    let new_content = content.unwrap_or(current.content);
    let new_entries = entries.unwrap_or(current.entries);

    // Validate required variables for protected templates
    if is_app_default_template(&id) {
        let validation_text = if new_entries.is_empty() {
            new_content.clone()
        } else {
            new_entries
                .iter()
                .map(|entry| entry.content.as_str())
                .collect::<Vec<_>>()
                .join("\n")
        };
        if let Err(missing) = validate_required_variables(&id, &validation_text) {
            return Err(format!(
                "Protected template must contain required variables: {}",
                missing.join(", ")
            ));
        }
    }
    let updated_at = now();
    let target_ids_json = serde_json::to_string(&new_target_ids)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let entries_json = serde_json::to_string(&new_entries)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    conn.execute(
        "UPDATE prompt_templates SET name = ?1, scope = ?2, target_ids = ?3, content = ?4, entries = ?5, updated_at = ?6 WHERE id = ?7",
        params![
            new_name,
            scope_to_str(&new_scope),
            target_ids_json,
            new_content,
            entries_json,
            updated_at,
            id
        ],
    )
    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    get_template(app, &id).map(|opt| opt.expect("updated row should exist"))
}

pub fn delete_template(app: &AppHandle, id: String) -> Result<(), String> {
    if is_app_default_template(&id) {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            "This template is protected and cannot be deleted",
        ));
    }

    if get_template(app, &id)?.is_none() {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            "Template not found",
        ));
    }

    let conn = open_db(app)?;
    conn.execute("DELETE FROM prompt_templates WHERE id = ?1", params![id])
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    Ok(())
}

pub fn get_template(app: &AppHandle, id: &str) -> Result<Option<SystemPromptTemplate>, String> {
    let conn = open_db(app)?;
    conn
        .query_row(
            "SELECT id, name, scope, target_ids, content, entries, created_at, updated_at FROM prompt_templates WHERE id = ?1",
            params![id],
            |row| row_to_template(row),
        )
        .optional()
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
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
    let entries_json = serde_json::to_string(&default_modular_prompt_entries())
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    conn.execute(
        "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, entries, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?6, ?6)",
        params![
            APP_DEFAULT_TEMPLATE_ID,
            APP_DEFAULT_TEMPLATE_NAME,
            scope_to_str(&PromptScope::AppWide),
            content,
            entries_json,
            now
        ],
    )
    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    Ok(APP_DEFAULT_TEMPLATE_ID.to_string())
}

pub fn ensure_dynamic_memory_templates(app: &AppHandle) -> Result<(), String> {
    let conn = open_db(app)?;
    let now = now();

    // Summarizer template
    if get_template(app, APP_DYNAMIC_SUMMARY_TEMPLATE_ID)?.is_none() {
        let content = get_base_prompt(PromptType::DynamicSummaryPrompt);
        let entries = get_base_prompt_entries(PromptType::DynamicSummaryPrompt);
        let entries_json = serde_json::to_string(&entries)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        conn.execute(
            "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, entries, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?6, ?6)",
            params![
                APP_DYNAMIC_SUMMARY_TEMPLATE_ID,
                APP_DYNAMIC_SUMMARY_TEMPLATE_NAME,
                scope_to_str(&PromptScope::AppWide),
                content,
                entries_json,
                now
            ],
        )
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    }

    // Memory manager template
    if get_template(app, APP_DYNAMIC_MEMORY_TEMPLATE_ID)?.is_none() {
        let content = get_base_prompt(PromptType::DynamicMemoryPrompt);
        let entries = get_base_prompt_entries(PromptType::DynamicMemoryPrompt);
        let entries_json = serde_json::to_string(&entries)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        conn.execute(
            "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, entries, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?6, ?6)",
            params![
                APP_DYNAMIC_MEMORY_TEMPLATE_ID,
                APP_DYNAMIC_MEMORY_TEMPLATE_NAME,
                scope_to_str(&PromptScope::AppWide),
                content,
                entries_json,
                now
            ],
        )
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    }

    Ok(())
}

pub fn is_app_default_template(id: &str) -> bool {
    id == APP_DEFAULT_TEMPLATE_ID
        || id == APP_DYNAMIC_SUMMARY_TEMPLATE_ID
        || id == APP_DYNAMIC_MEMORY_TEMPLATE_ID
        || id == APP_HELP_ME_REPLY_TEMPLATE_ID
        || id == APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID
}

pub fn reset_app_default_template(app: &AppHandle) -> Result<SystemPromptTemplate, String> {
    let content = get_base_prompt(PromptType::SystemPrompt);
    update_template(
        app,
        APP_DEFAULT_TEMPLATE_ID.to_string(),
        None,
        None,
        None,
        Some(content.clone()),
        Some(default_modular_prompt_entries()),
    )
}

pub fn reset_dynamic_summary_template(app: &AppHandle) -> Result<SystemPromptTemplate, String> {
    let content = get_base_prompt(PromptType::DynamicSummaryPrompt);
    let entries = get_base_prompt_entries(PromptType::DynamicSummaryPrompt);
    update_template(
        app,
        APP_DYNAMIC_SUMMARY_TEMPLATE_ID.to_string(),
        None,
        None,
        None,
        Some(content.clone()),
        Some(entries),
    )
}

pub fn reset_dynamic_memory_template(app: &AppHandle) -> Result<SystemPromptTemplate, String> {
    let content = get_base_prompt(PromptType::DynamicMemoryPrompt);
    let entries = get_base_prompt_entries(PromptType::DynamicMemoryPrompt);
    update_template(
        app,
        APP_DYNAMIC_MEMORY_TEMPLATE_ID.to_string(),
        None,
        None,
        None,
        Some(content.clone()),
        Some(entries),
    )
}

pub fn ensure_help_me_reply_template(app: &AppHandle) -> Result<(), String> {
    if get_template(app, APP_HELP_ME_REPLY_TEMPLATE_ID)?.is_none() {
        let conn = open_db(app)?;
        let now = now();
        let content = get_base_prompt(PromptType::HelpMeReplyPrompt);
        let entries = get_base_prompt_entries(PromptType::HelpMeReplyPrompt);
        let entries_json = serde_json::to_string(&entries)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        conn.execute(
            "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, entries, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?6, ?6)",
            params![
                APP_HELP_ME_REPLY_TEMPLATE_ID,
                APP_HELP_ME_REPLY_TEMPLATE_NAME,
                scope_to_str(&PromptScope::AppWide),
                content,
                entries_json,
                now
            ],
        )
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    }

    // Also ensure conversational template exists
    if get_template(app, APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID)?.is_none() {
        let conn = open_db(app)?;
        let now = now();
        let content = get_base_prompt(PromptType::HelpMeReplyConversationalPrompt);
        let entries = get_base_prompt_entries(PromptType::HelpMeReplyConversationalPrompt);
        let entries_json = serde_json::to_string(&entries)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        conn.execute(
            "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, entries, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?6, ?6)",
            params![
                APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID,
                APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_NAME,
                scope_to_str(&PromptScope::AppWide),
                content,
                entries_json,
                now
            ],
        )
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    }
    Ok(())
}

pub fn reset_help_me_reply_template(app: &AppHandle) -> Result<SystemPromptTemplate, String> {
    let content = get_base_prompt(PromptType::HelpMeReplyPrompt);
    let entries = get_base_prompt_entries(PromptType::HelpMeReplyPrompt);
    update_template(
        app,
        APP_HELP_ME_REPLY_TEMPLATE_ID.to_string(),
        None,
        None,
        None,
        Some(content.clone()),
        Some(entries),
    )
}

pub fn reset_help_me_reply_conversational_template(
    app: &AppHandle,
) -> Result<SystemPromptTemplate, String> {
    let content = get_base_prompt(PromptType::HelpMeReplyConversationalPrompt);
    let entries = get_base_prompt_entries(PromptType::HelpMeReplyConversationalPrompt);
    update_template(
        app,
        APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID.to_string(),
        None,
        None,
        None,
        Some(content.clone()),
        Some(entries),
    )
}

/// Get the Help Me Reply template from DB, falling back to default if not found
pub fn get_help_me_reply_prompt(app: &AppHandle, style: &str) -> String {
    let template_id = if style == "conversational" {
        APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID
    } else {
        APP_HELP_ME_REPLY_TEMPLATE_ID
    };

    let prompt_type = if style == "conversational" {
        PromptType::HelpMeReplyConversationalPrompt
    } else {
        PromptType::HelpMeReplyPrompt
    };

    match get_template(app, template_id) {
        Ok(Some(template)) => {
            let merged = template_entries_to_content(&template.entries);
            if merged.is_empty() {
                template.content
            } else {
                merged
            }
        }
        _ => get_base_prompt(prompt_type),
    }
}

/// Get the Group Chat template from DB, falling back to default if not found
#[allow(dead_code)]
pub fn get_group_chat_prompt(app: &AppHandle) -> String {
    match get_template(app, APP_GROUP_CHAT_TEMPLATE_ID) {
        Ok(Some(template)) => {
            let merged = template_entries_to_content(&template.entries);
            if merged.is_empty() {
                template.content
            } else {
                merged
            }
        }
        _ => get_base_prompt(PromptType::GroupChatPrompt),
    }
}

/// Get the Group Chat Roleplay template from DB, falling back to default if not found
#[allow(dead_code)]
pub fn get_group_chat_roleplay_prompt(app: &AppHandle) -> String {
    match get_template(app, APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID) {
        Ok(Some(template)) => {
            let merged = template_entries_to_content(&template.entries);
            if merged.is_empty() {
                template.content
            } else {
                merged
            }
        }
        _ => get_base_prompt(PromptType::GroupChatRoleplayPrompt),
    }
}
