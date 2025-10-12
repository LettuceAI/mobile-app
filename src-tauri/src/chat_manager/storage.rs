use serde_json::{json, Value};
use tauri::AppHandle;

use crate::storage_manager::{
    storage_read_characters, storage_read_personas, storage_read_session, storage_read_settings,
    storage_write_session, storage_write_settings,
};
use crate::utils::emit_debug;

use super::types::{
    AdvancedModelSettings, Character, Model, Persona, ProviderCredential, Session, Settings,
    StoredMessage,
};

pub fn default_character_rules(pure_mode_enabled: bool) -> Vec<String> {
    let mut rules = vec![
        "Embody the character naturally without breaking immersion".to_string(),
        "Respond based on your personality, background, and current situation".to_string(),
        "Show emotions and reactions authentically through your words".to_string(),
        "Engage with the conversation organically, not like an assistant".to_string(),
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
    persona: Option<&Persona>,
    session: &Session,
    settings: &Settings,
) -> Option<String> {
    let mut template = String::new();
    let mut debug_parts: Vec<Value> = Vec::new();

    // Add starting scene if one is selected
    if let Some(selected_scene_id) = &session.selected_scene_id {
        if let Some(scene) = character.scenes.iter().find(|s| &s.id == selected_scene_id) {
            // Get the active content (variant or original)
            let scene_content = if let Some(variant_id) = &scene.selected_variant_id {
                scene.variants.iter()
                    .find(|v| &v.id == variant_id)
                    .map(|v| v.content.as_str())
                    .unwrap_or(&scene.content)
            } else {
                &scene.content
            };
            
            if !scene_content.trim().is_empty() {
                template.push_str("# Starting Scene\nThis is the starting scene for the roleplay. You must roleplay according to this scenario and stay in character at all times.\n\n");
                template.push_str(scene_content.trim());
                template.push_str("\n\n");
                debug_parts.push(json!({
                    "source": "starting_scene",
                    "content": scene_content,
                }));
            }
        }
    }

    if let Some(base) = &session.system_prompt {
        let trimmed = base.trim();
        if !trimmed.is_empty() {
            template.push_str(trimmed);
            template.push_str("\n\n");
            debug_parts.push(json!({
                "source": "session_system_prompt",
                "content": trimmed,
            }));
        }
    } else {
        template.push_str("# Character\nYou are {{ai_name}}.\n\n{{ai_description}}");
        if persona.is_some() {
            template.push_str("\n\n# User\n{{persona_description}}");
        }
        template.push_str("\n\n# Guidelines\n{{ai_rules}}");
        template.push_str("\n\n");
        debug_parts.push(json!({
            "source": "default_template",
            "content": template.clone(),
        }));
    }

    let ai_name = character.name.clone();
    let ai_description = character
        .description
        .as_ref()
        .map(|s| s.trim())
        .unwrap_or("");

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
    let ai_rules = rules_to_use.join("\n- ");
    let ai_rules = format!("- {}", ai_rules);

    template = template.replace("{{ai_name}}", &ai_name);
    template = template.replace("{{ai_description}}", ai_description);
    template = template.replace("{{ai_rules}}", &ai_rules);

    if let Some(p) = persona {
        template = template.replace("{{persona_name}}", &p.title);
        template = template.replace("{{persona_description}}", p.description.trim());
    } else {
        template = template.replace("{{persona_name}}", "");
        template = template.replace("{{persona_description}}", "");
    }

    debug_parts.push(json!({
        "source": "placeholder_replacement",
        "ai_name": ai_name,
        "ai_description": ai_description,
        "ai_rules": ai_rules,
        "persona": persona.map(|p| json!({
            "name": p.title,
            "description": p.description,
        })),
    }));

    let result = if template.trim().is_empty() {
        None
    } else {
        Some(template.trim().to_string())
    };

    emit_debug(
        app,
        "system_prompt_built",
        json!({
            "sessionId": session.id,
            "characterId": character.id,
            "personaId": persona.map(|p| p.id.clone()),
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
