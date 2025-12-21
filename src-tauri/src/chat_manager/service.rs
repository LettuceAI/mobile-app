use tauri::AppHandle;
use uuid::Uuid;

use crate::models::{calculate_request_cost, get_model_pricing};
use crate::usage::{add_usage_record, RequestUsage};
use crate::utils::{log_error, log_info, log_warn, now_millis};

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
        build_system_prompt(
            &self.app,
            character,
            model,
            persona,
            session,
            &self.settings,
        )
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
    // Prefer inline api_key on the credential
    if let Some(ref key) = provider_cred.api_key {
        if !key.is_empty() {
            return Ok(key.clone());
        }
    }
    log_error(
        app,
        log_scope,
        format!(
            "provider credential {} missing API key",
            provider_cred.id.as_str()
        ),
    );
    Err("Provider credential missing API key".into())
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
    operation_type: &str,
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
        operation_type: operation_type.to_string(),
        prompt_tokens: usage_info.prompt_tokens,
        completion_tokens: usage_info.completion_tokens,
        total_tokens: usage_info.total_tokens,
        memory_tokens: None,  
        summary_tokens: None, 
        reasoning_tokens: usage_info.reasoning_tokens,
        image_tokens: usage_info.image_tokens,
        cost: None,
        success: true,
        error_message: None,
        metadata: Default::default(),
    };

    // Calculate memory and summary token counts
    let mut memory_token_count = 0u64;
    for emb in &session.memory_embeddings {
        memory_token_count += emb.token_count as u64;
    }

    let summary_token_count = session.memory_summary_token_count as u64;

    if memory_token_count > 0 {
        request_usage.memory_tokens = Some(memory_token_count);
    }

    if summary_token_count > 0 {
        request_usage.summary_tokens = Some(summary_token_count);
    }

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
                        log_info(
                            context.app(),
                            log_scope,
                            format!("calculated cost for request: ${:.6}", cost.total_cost),
                        );
                    }
                    None => {
                        log_error(
                            context.app(),
                            log_scope,
                            "failed to calculate request cost".to_string(),
                        );
                    }
                }
            }
            Ok(None) => {
                log_warn(
                    context.app(),
                    log_scope,
                    "no pricing found for model (might be free)".to_string(),
                );
            }
            Err(err) => {
                log_error(
                    context.app(),
                    log_scope,
                    format!("failed to fetch pricing: {}", err),
                );
            }
        }
    }

    if let Err(err) = add_usage_record(context.app(), request_usage) {
        log_error(
            context.app(),
            log_scope,
            format!("failed to save usage record: {}", err),
        );
    }
}

pub fn record_failed_usage(
    app: &tauri::AppHandle,
    usage: &Option<UsageSummary>,
    session: &Session,
    character: &Character,
    model: &Model,
    provider_cred: &ProviderCredential,
    operation_type: &str,
    error_message: &str,
    log_scope: &str,
) {
    let Some(usage_info) = usage else {
        return;
    };

    let request_usage = RequestUsage {
        id: Uuid::new_v4().to_string(),
        timestamp: now_millis().unwrap_or(0),
        session_id: session.id.clone(),
        character_id: character.id.clone(),
        character_name: character.name.clone(),
        model_id: model.id.clone(),
        model_name: model.name.clone(),
        provider_id: provider_cred.provider_id.clone(),
        provider_label: provider_cred.provider_id.clone(),
        operation_type: operation_type.to_string(),
        prompt_tokens: usage_info.prompt_tokens,
        completion_tokens: usage_info.completion_tokens,
        total_tokens: usage_info.total_tokens,
        memory_tokens: None,
        summary_tokens: None,
        reasoning_tokens: usage_info.reasoning_tokens,
        image_tokens: usage_info.image_tokens,
        cost: None,
        success: false,
        error_message: Some(error_message.to_string()),
        metadata: Default::default(),
    };

    log_info(
        app,
        log_scope,
        format!(
            "recording failed usage: tokens={:?} error={}",
            usage_info.total_tokens, error_message
        ),
    );

    if let Err(err) = add_usage_record(app, request_usage) {
        log_error(
            app,
            log_scope,
            format!("failed to save failed usage record: {}", err),
        );
    }
}