use serde_json::Value;
use tauri::AppHandle;
use uuid::Uuid;

use crate::models::{calculate_request_cost, get_model_pricing};
use crate::secrets::secret_for_cred_get;
use crate::usage::{add_usage_record, RequestUsage};
use crate::utils::{log_backend, now_millis};

use super::storage::{
    build_system_prompt, choose_persona, load_characters, load_personas, load_session,
    load_settings, select_model,
};
use super::types::{
    Character, Model, Persona, ProviderCredential, Session, Settings, UsageSummary,
};

pub struct ChatContext {
    app: AppHandle,
    pub settings: Settings,
    pub characters: Vec<Character>,
    pub personas: Vec<Persona>,
}

impl ChatContext {
    pub fn initialize(app: AppHandle) -> Result<Self, String> {
        let settings = load_settings(&app)?;
        let characters = load_characters(&app)?;
        let personas = load_personas(&app)?;

        Ok(Self {
            app,
            settings,
            characters,
            personas,
        })
    }

    pub fn app(&self) -> &AppHandle {
        &self.app
    }

    pub fn app_clone(&self) -> AppHandle {
        self.app.clone()
    }

    pub fn find_character(&self, character_id: &str) -> Result<Character, String> {
        self.characters
            .iter()
            .find(|c| c.id == character_id)
            .cloned()
            .ok_or_else(|| "Character not found".to_string())
    }

    pub fn select_model<'a>(
        &'a self,
        character: &Character,
    ) -> Result<(&'a Model, &'a ProviderCredential), String> {
        select_model(&self.settings, character)
    }

    pub fn load_session(&self, session_id: &str) -> Result<Option<Session>, String> {
        load_session(&self.app, session_id)
    }

    pub fn build_system_prompt(
        &self,
        character: &Character,
        model: &Model,
        persona: Option<&Persona>,
        session: &Session,
    ) -> Option<String> {
        build_system_prompt(&self.app, character, model, persona, session, &self.settings)
    }

    pub fn choose_persona(&self, explicit_persona_id: Option<&str>) -> Option<&Persona> {
        let owned = explicit_persona_id.map(|id| id.to_string());
        choose_persona(&self.personas, owned.as_ref())
    }
}

pub fn resolve_api_key(
    app: &AppHandle,
    provider_cred: &ProviderCredential,
    log_scope: &str,
) -> Result<String, String> {
    if let Some(ref api_ref) = provider_cred.api_key_ref {
        match secret_for_cred_get(
            app.clone(),
            api_ref.provider_id.clone(),
            api_ref
                .cred_id
                .clone()
                .unwrap_or_else(|| provider_cred.id.clone()),
            api_ref.key.clone(),
        ) {
            Ok(Some(value)) => Ok(value),
            Ok(None) => {
                log_backend(
                    app,
                    log_scope,
                    format!(
                        "missing API key for provider {} credential {}",
                        provider_cred.provider_id.as_str(),
                        provider_cred.id.as_str()
                    ),
                );
                Err("Missing API key".into())
            }
            Err(err) => {
                log_backend(app, log_scope, format!("failed to read API key: {}", err));
                Err(err)
            }
        }
    } else {
        log_backend(
            app,
            log_scope,
            format!(
                "provider credential {} missing API key reference",
                provider_cred.id.as_str()
            ),
        );
        Err("Provider credential missing API key reference".into())
    }
}

pub async fn record_usage_if_available(
    context: &ChatContext,
    usage: &Option<UsageSummary>,
    session: &Session,
    character: &Character,
    model: &Model,
    provider_cred: &ProviderCredential,
    api_key: &str,
    created_at: u64,
    log_scope: &str,
) {
    let Some(usage_info) = usage else {
        return;
    };

    let mut request_usage = RequestUsage {
        id: Uuid::new_v4().to_string(),
        timestamp: now_millis().unwrap_or(created_at),
        session_id: session.id.clone(),
        character_id: character.id.clone(),
        character_name: character.name.clone(),
        model_id: model.id.clone(),
        model_name: model.name.clone(),
        provider_id: provider_cred.provider_id.clone(),
        provider_label: provider_cred.provider_id.clone(),
        prompt_tokens: usage_info.prompt_tokens,
        completion_tokens: usage_info.completion_tokens,
        total_tokens: usage_info.total_tokens,
        cost: None,
        success: true,
        error_message: None,
        metadata: Default::default(),
    };

    if provider_cred.provider_id.eq_ignore_ascii_case("openrouter") {
        match get_model_pricing(
            context.app_clone(),
            &provider_cred.provider_id,
            &model.name,
            Some(api_key),
        )
        .await
        {
            Ok(Some(pricing)) => {
                match calculate_request_cost(
                    usage_info.prompt_tokens.unwrap_or(0),
                    usage_info.completion_tokens.unwrap_or(0),
                    &pricing,
                ) {
                    Some(cost) => {
                        request_usage.cost = Some(cost.clone());
                        log_backend(
                            context.app(),
                            log_scope,
                            format!("calculated cost for request: ${:.6}", cost.total_cost),
                        );
                    }
                    None => {
                        log_backend(
                            context.app(),
                            log_scope,
                            "failed to calculate request cost".to_string(),
                        );
                    }
                }
            }
            Ok(None) => {
                log_backend(
                    context.app(),
                    log_scope,
                    "no pricing found for model (might be free)".to_string(),
                );
            }
            Err(err) => {
                log_backend(
                    context.app(),
                    log_scope,
                    format!("failed to fetch pricing: {}", err),
                );
            }
        }
    }

    if let Err(err) = add_usage_record(context.app(), request_usage) {
        log_backend(
            context.app(),
            log_scope,
            format!("failed to save usage record: {}", err),
        );
    }
}

pub fn append_system_message(
    target: &mut Vec<Value>,
    system_role: &str,
    system_prompt: Option<String>,
) {
    if let Some(system) = system_prompt {
        target.push(serde_json::json!({ "role": system_role, "content": system }));
    }
}

pub fn push_message_for_api(target: &mut Vec<Value>, message: &super::types::StoredMessage) {
    if message.role == "scene" {
        return;
    }

    target.push(serde_json::json!({
        "role": message.role,
        "content": super::request::message_text_for_api(message)
    }));
}
