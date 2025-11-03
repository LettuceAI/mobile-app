// no direct serde_json usage here
use tauri::AppHandle;

use crate::storage_manager::{
    storage_read_characters, storage_read_personas, storage_read_session, storage_read_settings,
    storage_write_session, storage_write_settings,
};
// emit_debug no longer used here; prompt_engine handles debug emission

// prompts not used directly here after delegating to prompt_engine
use super::prompt_engine;
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
/// ### Character Description Placeholders
/// In the character description field itself, you can also use:
/// - `{{char}}` → Replaced with the character's name
/// - `{{persona}}` → Replaced with the selected persona's name (empty string if none)
///
/// ## Important Notes
/// - **NSFW toggle is ignored when using custom prompts** - users must handle content filtering
///   in their custom prompt if desired
/// - Custom prompts should include at minimum: `{{char.name}}`, `{{char.desc}}`, and `{{scene}}`
/// - Legacy variables (`{{ai_name}}`, `{{ai_description}}`, etc.) are still supported for
///   backwards compatibility

/// Default system prompt template when no custom prompt is set
/// Delegates to the centralized prompt engine.
pub fn default_system_prompt_template() -> String {
    prompt_engine::default_system_prompt_template()
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
    prompt_engine::build_system_prompt(app, character, model, persona, session, settings)
}

pub fn recent_messages(session: &Session) -> Vec<StoredMessage> {
    let mut recent_msgs: Vec<StoredMessage> =
        session.messages.iter().rev().take(50).cloned().collect();
    recent_msgs.reverse();
    recent_msgs
}
