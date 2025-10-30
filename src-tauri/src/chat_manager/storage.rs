use serde_json::{json, Value};
use tauri::AppHandle;

use crate::storage_manager::{
    storage_read_characters, storage_read_personas, storage_read_session, storage_read_settings,
    storage_write_session, storage_write_settings,
};
use crate::utils::emit_debug;

use super::prompts;
use super::types::{
    AdvancedModelSettings, Character, Model, Persona, ProviderCredential, Session, Settings,
    StoredMessage,
};

/// # Custom System Prompts
///
/// Users can customize system prompts at different levels with this priority order:
/// 1. **Session-level** (session.system_prompt) - Highest priority
/// 2. **Character-level** (character.system_prompt)
/// 3. **Model-level** (model.system_prompt)
/// 4. **App-wide** (settings.system_prompt)
/// 5. **Default** (default_system_prompt_template()) - Lowest priority
///
/// ## Template Variables
/// - `{{char.name}}` - Character name
/// - `{{char.desc}}` - Character description
/// - `{{scene}}` - Starting scene content (auto-formatted with header)
/// - `{{persona.name}}` - Persona name
/// - `{{persona.desc}}` - Persona description
/// - `{{rules}}` - Character rules (formatted as bullet list)
///
/// ## Important Notes
/// - **NSFW toggle is ignored when using custom prompts** - users must handle content filtering
///   in their custom prompt if desired
/// - Custom prompts should include at minimum: `{{char.name}}`, `{{char.desc}}`, and `{{scene}}`
/// - Legacy variables (`{{ai_name}}`, `{{ai_description}}`, etc.) are still supported for
///   backwards compatibility

/// Default system prompt template when no custom prompt is set
/// Template variables: {{char.name}}, {{char.desc}}, {{scene}}, {{persona.name}}, {{persona.desc}}, {{rules}}
pub fn default_system_prompt_template() -> String {
    let mut template = String::new();
    template.push_str("{{scene}}");
    template.push_str("# Character\nYou are {{char.name}}.\n\n{{char.desc}}");
    template.push_str("\n\n# User\n{{persona.desc}}");
    template.push_str("\n\n# Guidelines\n{{rules}}");
    template
}

pub fn default_character_rules(pure_mode_enabled: bool) -> Vec<String> {
    let mut rules = vec![
        "Embody the character naturally without breaking immersion".to_string(),
        "Respond based on your personality, background, and current situation".to_string(),
        "Show emotions and reactions authentically through your words".to_string(),
        "Engage with the conversation organically, not like an assistant".to_string(),
        "You may roleplay as background characters or NPCs in the scene when needed (e.g., if you're a police officer and a witness appears, you can act as that witness). However, NEVER roleplay as the user's character - only control your own character and third-party characters".to_string(),
    ];

    if pure_mode_enabled {
        rules.push("Keep all interactions appropriate and respectful".to_string());
        rules.push("Avoid sexual, adult, or NSFW content".to_string());
    }

    rules
}

pub fn load_settings(app: &AppHandle) -> Result<Settings, String> {
    let json = storage_read_settings(app.clone())?;
    if let Some(data) = json {
        serde_json::from_str(&data).map_err(|e| e.to_string())
    } else {
        let defaults = default_settings();
        storage_write_settings(
            app.clone(),
            serde_json::to_string(&defaults).map_err(|e| e.to_string())?,
        )?;
        Ok(defaults)
    }
}

fn default_settings() -> Settings {
    Settings {
        default_provider_credential_id: None,
        default_model_id: None,
        provider_credentials: Vec::new(),
        models: Vec::new(),
        app_state: serde_json::Value::Null,
        advanced_model_settings: AdvancedModelSettings::default(),
        prompt_template_id: None,
        system_prompt: None,
        migration_version: 0,
    }
}

pub fn load_characters(app: &AppHandle) -> Result<Vec<Character>, String> {
    let json = storage_read_characters(app.clone())?;
    if let Some(data) = json {
        serde_json::from_str(&data).map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

pub fn load_personas(app: &AppHandle) -> Result<Vec<Persona>, String> {
    let json = storage_read_personas(app.clone())?;
    if let Some(data) = json {
        serde_json::from_str(&data).map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

pub fn load_session(app: &AppHandle, session_id: &str) -> Result<Option<Session>, String> {
    let json = storage_read_session(app.clone(), session_id.to_string())?;
    if let Some(data) = json {
        let session: Session = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        Ok(Some(session))
    } else {
        Ok(None)
    }
}

pub fn save_session(app: &AppHandle, session: &Session) -> Result<(), String> {
    let payload = serde_json::to_string(session).map_err(|e| e.to_string())?;
    storage_write_session(app.clone(), session.id.clone(), payload)
}

pub fn select_model<'a>(
    settings: &'a Settings,
    character: &Character,
) -> Result<(&'a Model, &'a ProviderCredential), String> {
    let model_id = character
        .default_model_id
        .clone()
        .or_else(|| settings.default_model_id.clone())
        .ok_or_else(|| "No default model configured".to_string())?;

    let model = settings
        .models
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| "Model not found".to_string())?;

    let provider_cred = settings
        .provider_credentials
        .iter()
        .find(|cred| {
            Some(cred.id.clone()) == settings.default_provider_credential_id
                && cred.provider_id == model.provider_id
        })
        .or_else(|| {
            settings
                .provider_credentials
                .iter()
                .find(|cred| cred.provider_id == model.provider_id)
        })
        .ok_or_else(|| "Provider credential not found".to_string())?;

    Ok((model, provider_cred))
}

pub fn choose_persona<'a>(
    personas: &'a [Persona],
    explicit: Option<&String>,
) -> Option<&'a Persona> {
    if let Some(id) = explicit {
        if id.is_empty() {
            return None;
        }
        if let Some(p) = personas.iter().find(|p| &p.id == id) {
            return Some(p);
        }
    }
    personas.iter().find(|p| p.is_default)
}

pub fn build_system_prompt(
    app: &AppHandle,
    character: &Character,
    model: &Model,
    persona: Option<&Persona>,
    session: &Session,
    settings: &Settings,
) -> Option<String> {
    let mut debug_parts: Vec<Value> = Vec::new();

    // Priority: session > character template > model template > app-wide template > default
    let base_template = if let Some(session_prompt) = &session.system_prompt {
        debug_parts.push(json!({ "source": "session_override" }));
        session_prompt.clone()
    } else if let Some(char_template_id) = &character.prompt_template_id {
        // Resolve character prompt template
        if let Ok(Some(template)) = prompts::get_template(app, char_template_id) {
            debug_parts.push(json!({ "source": "character_template", "template_id": char_template_id }));
            template.content
        } else {
            debug_parts.push(json!({ "source": "character_template_not_found", "template_id": char_template_id, "fallback": "default" }));
            default_system_prompt_template()
        }
    } else if let Some(model_template_id) = &model.prompt_template_id {
        // Resolve model prompt template
        if let Ok(Some(template)) = prompts::get_template(app, model_template_id) {
            debug_parts.push(json!({ "source": "model_template", "template_id": model_template_id }));
            template.content
        } else {
            debug_parts.push(json!({ "source": "model_template_not_found", "template_id": model_template_id, "fallback": "default" }));
            default_system_prompt_template()
        }
    } else if let Some(app_template_id) = &settings.prompt_template_id {
        // Resolve app-wide prompt template
        if let Ok(Some(template)) = prompts::get_template(app, app_template_id) {
            debug_parts.push(json!({ "source": "app_wide_template", "template_id": app_template_id }));
            template.content
        } else {
            debug_parts.push(json!({ "source": "app_wide_template_not_found", "template_id": app_template_id, "fallback": "default" }));
            default_system_prompt_template()
        }
    } else {
        debug_parts.push(json!({ "source": "default_template" }));
        default_system_prompt_template()
    };

    // Build scene content if one is selected
    let scene_content = if let Some(selected_scene_id) = &session.selected_scene_id {
        if let Some(scene) = character.scenes.iter().find(|s| &s.id == selected_scene_id) {
            let content = if let Some(variant_id) = &scene.selected_variant_id {
                scene
                    .variants
                    .iter()
                    .find(|v| &v.id == variant_id)
                    .map(|v| v.content.as_str())
                    .unwrap_or(&scene.content)
            } else {
                &scene.content
            };

            if !content.trim().is_empty() {
                let formatted = format!(
                    "# Starting Scene\nThis is the starting scene for the roleplay. You must roleplay according to this scenario and stay in character at all times.\n\n{}\n\n",
                    content.trim()
                );
                debug_parts.push(json!({
                    "scene_id": selected_scene_id,
                    "scene_content": content,
                }));
                formatted
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // Get character info
    let char_name = &character.name;
    let char_desc = character
        .description
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("");

    // Get persona info
    let persona_name = persona.map(|p| p.title.as_str()).unwrap_or("");
    let persona_desc = persona
        .map(|p| p.description.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("");

    // Build rules - Note: NSFW toggle is ignored when using custom prompts
    let pure_mode_enabled = settings
        .app_state
        .get("pureModeEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let rules_to_use = if character.rules.is_empty() {
        default_character_rules(pure_mode_enabled)
    } else {
        character.rules.clone()
    };
    let rules_formatted = format!("- {}", rules_to_use.join("\n- "));

    // Replace all template variables
    let mut result = base_template;
    result = result.replace("{{scene}}", &scene_content);
    result = result.replace("{{char.name}}", char_name);
    result = result.replace("{{char.desc}}", char_desc);
    result = result.replace("{{persona.name}}", persona_name);
    result = result.replace("{{persona.desc}}", persona_desc);
    result = result.replace("{{rules}}", &rules_formatted);

    // Legacy template variable support (for backwards compatibility)
    result = result.replace("{{ai_name}}", char_name);
    result = result.replace("{{ai_description}}", char_desc);
    result = result.replace("{{ai_rules}}", &rules_formatted);
    result = result.replace("{{persona_name}}", persona_name);
    result = result.replace("{{persona_description}}", persona_desc);

    debug_parts.push(json!({
        "template_vars": {
            "char_name": char_name,
            "char_desc": char_desc,
            "persona_name": persona_name,
            "persona_desc": persona_desc,
            "scene_present": !scene_content.is_empty(),
        }
    }));

    emit_debug(
        app,
        "system_prompt_built",
        json!({ "debug": debug_parts }),
    );

    let trimmed = result.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn recent_messages(session: &Session) -> Vec<StoredMessage> {
    let mut recent_msgs: Vec<StoredMessage> =
        session.messages.iter().rev().take(50).cloned().collect();
    recent_msgs.reverse();
    recent_msgs
}
