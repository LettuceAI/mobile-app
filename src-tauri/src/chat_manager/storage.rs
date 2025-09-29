use serde_json::{json, Value};
use tauri::AppHandle;

use crate::storage_manager::{
    storage_read_characters, storage_read_personas, storage_read_session, storage_read_settings,
    storage_write_session, storage_write_settings,
};
use crate::utils::emit_debug;

use super::types::{
    Character, Model, Persona, ProviderCredential, Session, Settings, StoredMessage,
};

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
        if let Some(p) = personas.iter().find(|p| &p.id == id) {
            return Some(p);
        }
    }
    personas.iter().find(|p| p.is_default)
}

pub fn build_system_prompt(
    app: &AppHandle,
    character: &Character,
    persona: Option<&Persona>,
    session: &Session,
) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    let mut debug_parts: Vec<Value> = Vec::new();

    if let Some(p) = persona {
        let description = p.description.trim();
        if !description.is_empty() {
            parts.push(format!("Persona: {}", description));
            debug_parts.push(json!({
                "source": "persona",
                "personaId": p.id,
                "title": p.title,
                "content": description,
            }));
        }
    }

    if let Some(desc) = &character.description {
        let trimmed = desc.trim();
        if !trimmed.is_empty() {
            parts.push(format!("Character description: {}", trimmed));
            debug_parts.push(json!({
                "source": "character_description",
                "content": trimmed,
            }));
        }
    }

    if let Some(style) = &character.style {
        let trimmed = style.trim();
        if !trimmed.is_empty() {
            parts.push(format!("Style guidance: {}", trimmed));
            debug_parts.push(json!({
                "source": "character_style",
                "content": trimmed,
            }));
        }
    }

    if let Some(boundaries) = &character.boundaries {
        let trimmed = boundaries.trim();
        if !trimmed.is_empty() {
            parts.push(format!("Boundaries: {}", trimmed));
            debug_parts.push(json!({
                "source": "character_boundaries",
                "content": trimmed,
            }));
        }
    }

    if let Some(base) = &session.system_prompt {
        let trimmed = base.trim();
        if !trimmed.is_empty() {
            parts.push(trimmed.to_string());
            debug_parts.push(json!({
                "source": "session_system_prompt",
                "content": trimmed,
            }));
        }
    }

    let result = if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n\n"))
    };

    emit_debug(
        app,
        "system_prompt_built",
        json!({
            "sessionId": session.id,
            "characterId": character.id,
            "personaId": persona.map(|p| p.id.clone()),
            "partCount": parts.len(),
            "parts": debug_parts,
            "preview": result.as_ref().map(|prompt| {
                if prompt.len() > 400 {
                    format!("{}…", &prompt[..400])
                } else {
                    prompt.clone()
                }
            }),
        }),
    );

    result
}

pub fn recent_messages(session: &Session) -> Vec<StoredMessage> {
    let mut recent_msgs: Vec<StoredMessage> =
        session.messages.iter().rev().take(50).cloned().collect();
    recent_msgs.reverse();
    recent_msgs
}
