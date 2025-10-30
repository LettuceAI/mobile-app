use super::types::{PromptScope, SystemPromptTemplate};
use crate::utils::ensure_lettuce_dir;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const PROMPTS_FILE: &str = "prompt_templates.json";
pub const APP_DEFAULT_TEMPLATE_ID: &str = "prompt_app_default";
const APP_DEFAULT_TEMPLATE_NAME: &str = "App Default";

fn get_app_default_content() -> String {
    use super::storage::default_system_prompt_template;
    default_system_prompt_template()
}

/// Get the path to the prompts file
fn prompts_file_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(ensure_lettuce_dir(app)?.join(PROMPTS_FILE))
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PromptTemplatesFile {
    templates: Vec<SystemPromptTemplate>,
}

impl Default for PromptTemplatesFile {
    fn default() -> Self {
        Self {
            templates: Vec::new(),
        }
    }
}

/// Generate a unique ID for prompt templates
fn generate_id() -> String {
    format!("prompt_{}", uuid::Uuid::new_v4().to_string())
}

/// Get current timestamp in milliseconds
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/// Load all prompt templates from storage
pub fn load_templates(app: &AppHandle) -> Result<Vec<SystemPromptTemplate>, String> {
    let path = prompts_file_path(app)?;
    
    if !path.exists() {
        return Ok(Vec::new());
    }
    
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read prompts file: {}", e))?;
    
    let file: PromptTemplatesFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse prompt templates: {}", e))?;
    
    Ok(file.templates)
}

/// Save all prompt templates to storage
fn save_templates(app: &AppHandle, templates: &[SystemPromptTemplate]) -> Result<(), String> {
    let path = prompts_file_path(app)?;
    
    let file = PromptTemplatesFile {
        templates: templates.to_vec(),
    };
    let content = serde_json::to_string_pretty(&file)
        .map_err(|e| format!("Failed to serialize templates: {}", e))?;
    
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write prompts file: {}", e))?;
    
    Ok(())
}

/// Create a new prompt template
pub fn create_template(
    app: &AppHandle,
    name: String,
    scope: PromptScope,
    target_ids: Vec<String>,
    content: String,
) -> Result<SystemPromptTemplate, String> {
    let mut templates = load_templates(app)?;
    
    let template = SystemPromptTemplate {
        id: generate_id(),
        name,
        scope,
        target_ids,
        content,
        created_at: now(),
        updated_at: now(),
    };
    
    templates.push(template.clone());
    save_templates(app, &templates)?;
    
    Ok(template)
}

/// Update an existing prompt template
pub fn update_template(
    app: &AppHandle,
    id: String,
    name: Option<String>,
    scope: Option<PromptScope>,
    target_ids: Option<Vec<String>>,
    content: Option<String>,
) -> Result<SystemPromptTemplate, String> {
    let mut templates = load_templates(app)?;
    
    let template = templates
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Template not found: {}", id))?;
    
    // Prevent changing scope of app default template (only if trying to change to a different scope)
    if is_app_default_template(&id) {
        if let Some(s) = &scope {
            if *s != template.scope {
                return Err("Cannot change scope of App Default template".to_string());
            }
        }
    }
    
    if let Some(n) = name {
        template.name = n;
    }
    if let Some(s) = scope {
        template.scope = s;
    }
    if let Some(t) = target_ids {
        template.target_ids = t;
    }
    if let Some(c) = content {
        template.content = c;
    }
    template.updated_at = now();
    
    let updated = template.clone();
    save_templates(app, &templates)?;
    
    Ok(updated)
}

/// Delete a prompt template
pub fn delete_template(app: &AppHandle, id: String) -> Result<(), String> {
    // Prevent deletion of app default template
    if is_app_default_template(&id) {
        return Err("Cannot delete the App Default template".to_string());
    }
    
    let mut templates = load_templates(app)?;
    templates.retain(|t| t.id != id);
    save_templates(app, &templates)?;
    Ok(())
}

/// Get a specific template by ID
pub fn get_template(app: &AppHandle, id: &str) -> Result<Option<SystemPromptTemplate>, String> {
    let templates = load_templates(app)?;
    Ok(templates.into_iter().find(|t| t.id == id))
}

/// Get templates applicable to a specific character
pub fn get_applicable_for_character(app: &AppHandle, character_id: &str) -> Result<Vec<SystemPromptTemplate>, String> {
    let templates = load_templates(app)?;
    Ok(templates
        .into_iter()
        .filter(|t| match &t.scope {
            PromptScope::AppWide => true,
            PromptScope::CharacterSpecific => t.target_ids.contains(&character_id.to_string()),
            PromptScope::ModelSpecific => false,
        })
        .collect())
}

/// Get templates applicable to a specific model
pub fn get_applicable_for_model(app: &AppHandle, model_id: &str) -> Result<Vec<SystemPromptTemplate>, String> {
    let templates = load_templates(app)?;
    Ok(templates
        .into_iter()
        .filter(|t| match &t.scope {
            PromptScope::AppWide => true,
            PromptScope::ModelSpecific => t.target_ids.contains(&model_id.to_string()),
            PromptScope::CharacterSpecific => false,
        })
        .collect())
}

/// Ensure the "App Default" template exists, creating it if necessary
/// Returns the ID of the app default template
pub fn ensure_app_default_template(app: &AppHandle) -> Result<String, String> {
    let mut templates = load_templates(app)?;
    
    // Check if app default already exists
    if let Some(existing) = templates.iter().find(|t| t.id == APP_DEFAULT_TEMPLATE_ID) {
        return Ok(existing.id.clone());
    }
    
    // Create the app default template
    let template = SystemPromptTemplate {
        id: APP_DEFAULT_TEMPLATE_ID.to_string(),
        name: APP_DEFAULT_TEMPLATE_NAME.to_string(),
        scope: PromptScope::AppWide,
        target_ids: vec![],
        content: get_app_default_content(),
        created_at: now(),
        updated_at: now(),
    };
    
    templates.push(template.clone());
    save_templates(app, &templates)?;
    
    Ok(template.id)
}

/// Check if a template is the app default (protected from deletion)
pub fn is_app_default_template(id: &str) -> bool {
    id == APP_DEFAULT_TEMPLATE_ID
}

/// Reset the App Default template to its original content
pub fn reset_app_default_template(app: &AppHandle) -> Result<SystemPromptTemplate, String> {
    update_template(
        app,
        APP_DEFAULT_TEMPLATE_ID.to_string(),
        None, // Keep name
        None, // Keep scope
        None, // Keep target_ids
        Some(get_app_default_content()), // Reset content
    )
}
