use tauri::AppHandle;

use crate::storage_manager::{
    characters::characters_list,
    personas::personas_list,
    sessions::{
        messages_list, messages_list_pinned, messages_upsert_batch, session_get_meta,
        session_upsert_meta,
    },
    settings::{storage_read_settings, storage_write_settings},
};

use super::prompt_engine;
use super::types::{
    AccessibilitySettings, AccessibilitySoundSettings, AdvancedModelSettings, AdvancedSettings,
    Character, Model, Persona, ProviderCredential, Session, Settings, StoredMessage,
    SystemPromptEntry,
};

#[derive(Debug, Clone, Copy)]
pub enum PromptType {
    SystemPrompt,
    DynamicMemoryPrompt,
    DynamicSummaryPrompt,
    HelpMeReplyPrompt,
    HelpMeReplyConversationalPrompt,
    GroupChatPrompt,
    GroupChatRoleplayPrompt,
}

pub fn get_base_prompt(prompt_type: PromptType) -> String {
    match prompt_type {
        PromptType::SystemPrompt => prompt_engine::default_system_prompt_template(),
        PromptType::DynamicMemoryPrompt => prompt_engine::default_dynamic_memory_prompt(),
        PromptType::DynamicSummaryPrompt => prompt_engine::default_dynamic_summary_prompt(),
        PromptType::HelpMeReplyPrompt => prompt_engine::default_help_me_reply_prompt(),
        PromptType::HelpMeReplyConversationalPrompt => {
            prompt_engine::default_help_me_reply_conversational_prompt()
        }
        PromptType::GroupChatPrompt => prompt_engine::default_group_chat_system_prompt_template(),
        PromptType::GroupChatRoleplayPrompt => {
            prompt_engine::default_group_chat_roleplay_prompt_template()
        }
    }
}

pub fn get_base_prompt_entries(prompt_type: PromptType) -> Vec<SystemPromptEntry> {
    match prompt_type {
        PromptType::SystemPrompt => prompt_engine::default_modular_prompt_entries(),
        PromptType::DynamicMemoryPrompt => prompt_engine::default_dynamic_memory_entries(),
        PromptType::DynamicSummaryPrompt => prompt_engine::default_dynamic_summary_entries(),
        PromptType::HelpMeReplyPrompt => prompt_engine::default_help_me_reply_entries(),
        PromptType::HelpMeReplyConversationalPrompt => {
            prompt_engine::default_help_me_reply_conversational_entries()
        }
        PromptType::GroupChatPrompt => prompt_engine::default_group_chat_entries(),
        PromptType::GroupChatRoleplayPrompt => prompt_engine::default_group_chat_roleplay_entries(),
    }
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
        serde_json::from_str(&data)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
    } else {
        let defaults = default_settings();
        storage_write_settings(
            app.clone(),
            serde_json::to_string(&defaults)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?,
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
        advanced_settings: Some(AdvancedSettings {
            summarisation_model_id: None,
            creation_helper_enabled: None,
            creation_helper_model_id: None,
            help_me_reply_enabled: None,
            help_me_reply_model_id: None,
            help_me_reply_streaming: None,
            help_me_reply_max_tokens: None,
            help_me_reply_style: None,
            dynamic_memory: None,
            group_dynamic_memory: None,
            manual_mode_context_window: None,
            embedding_max_tokens: None,
            accessibility: Some(AccessibilitySettings {
                send: AccessibilitySoundSettings {
                    enabled: false,
                    volume: 0.5,
                },
                success: AccessibilitySoundSettings {
                    enabled: false,
                    volume: 0.6,
                },
                failure: AccessibilitySoundSettings {
                    enabled: false,
                    volume: 0.6,
                },
            }),
        }),
        prompt_template_id: None,
        system_prompt: None,
        migration_version: 0,
    }
}

pub fn load_characters(app: &AppHandle) -> Result<Vec<Character>, String> {
    let data = characters_list(app.clone())?;
    serde_json::from_str(&data).map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
}

pub fn load_personas(app: &AppHandle) -> Result<Vec<Persona>, String> {
    let data = personas_list(app.clone())?;
    serde_json::from_str(&data).map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
}

pub fn load_session(app: &AppHandle, session_id: &str) -> Result<Option<Session>, String> {
    let meta = session_get_meta(app.clone(), session_id.to_string())?;
    let Some(meta_json) = meta else {
        return Ok(None);
    };
    let mut session: Session = serde_json::from_str(&meta_json)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    let recent_json = messages_list(app.clone(), session_id.to_string(), 120, None, None)?;
    let pinned_json = messages_list_pinned(app.clone(), session_id.to_string())?;
    let recent: Vec<StoredMessage> = serde_json::from_str(&recent_json)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let pinned: Vec<StoredMessage> = serde_json::from_str(&pinned_json)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    let mut by_id = std::collections::HashMap::<String, StoredMessage>::new();
    for m in pinned.into_iter().chain(recent.into_iter()) {
        by_id.insert(m.id.clone(), m);
    }
    let mut merged: Vec<StoredMessage> = by_id.into_values().collect();
    merged.sort_by(|a, b| {
        a.created_at
            .cmp(&b.created_at)
            .then_with(|| a.id.cmp(&b.id))
    });
    session.messages = merged;
    Ok(Some(session))
}

pub fn save_session(app: &AppHandle, session: &Session) -> Result<(), String> {
    let mut meta = session.clone();
    meta.messages = Vec::new();
    let meta_json = serde_json::to_string(&meta)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    session_upsert_meta(app.clone(), meta_json)?;

    if let Some(last) = session.messages.last() {
        let payload = serde_json::to_string(&vec![last])
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        messages_upsert_batch(app.clone(), session.id.clone(), payload)?;
    }
    Ok(())
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
) -> Vec<SystemPromptEntry> {
    prompt_engine::build_system_prompt_entries(app, character, model, persona, session, settings)
}

pub fn recent_messages(session: &Session, limit: usize) -> Vec<StoredMessage> {
    let mut recent_msgs: Vec<StoredMessage> =
        session.messages.iter().rev().take(limit).cloned().collect();
    recent_msgs.reverse();
    recent_msgs
}
