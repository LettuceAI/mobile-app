use serde_json::json;
use tauri::AppHandle;
use uuid::Uuid;

use crate::api::{api_request, ApiRequest};
use crate::utils::now_millis;

use super::request::{
    chat_completions_endpoint, ensure_assistant_variant, extract_error_message, extract_text,
    extract_usage, new_assistant_variant, normalize_headers, provider_base_url,
    system_role_for_provider,
};
use super::prompts;
use super::service::{
    append_system_message, push_message_for_api, record_usage_if_available, resolve_api_key,
    ChatContext,
};
use super::storage::{default_character_rules, recent_messages, save_session};
use super::types::{
    ChatCompletionArgs, ChatContinueArgs, ChatRegenerateArgs, ChatTurnResult, ContinueResult,
    Model, PromptScope, RegenerateResult, Session, Settings, StoredMessage, SystemPromptTemplate,
};
use crate::utils::{emit_debug, log_backend};

const FALLBACK_TEMPERATURE: f64 = 0.7;
const FALLBACK_TOP_P: f64 = 1.0;
const FALLBACK_MAX_OUTPUT_TOKENS: u32 = 1024;

fn resolve_temperature(session: &Session, model: &Model, settings: &Settings) -> f64 {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.temperature)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.temperature)
        })
        .or(settings.advanced_model_settings.temperature)
        .unwrap_or(FALLBACK_TEMPERATURE)
}

fn resolve_top_p(session: &Session, model: &Model, settings: &Settings) -> f64 {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.top_p)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.top_p)
        })
        .or(settings.advanced_model_settings.top_p)
        .unwrap_or(FALLBACK_TOP_P)
}

fn resolve_max_tokens(session: &Session, model: &Model, settings: &Settings) -> u32 {
    session
        .advanced_model_settings
        .as_ref()
        .and_then(|cfg| cfg.max_output_tokens)
        .or_else(|| {
            model
                .advanced_model_settings
                .as_ref()
                .and_then(|cfg| cfg.max_output_tokens)
        })
        .or(settings.advanced_model_settings.max_output_tokens)
        .unwrap_or(FALLBACK_MAX_OUTPUT_TOKENS)
}

#[tauri::command]
pub async fn chat_completion(
    app: AppHandle,
    args: ChatCompletionArgs,
) -> Result<ChatTurnResult, String> {
    let ChatCompletionArgs {
        session_id,
        character_id,
        user_message,
        persona_id,
        stream,
        request_id,
    } = args;

    log_backend(
        &app,
        "chat_completion",
        format!(
            "start session={} character={} stream={:?} request_id={:?}",
            &session_id, &character_id, stream, request_id
        ),
    );

    let context = ChatContext::initialize(app.clone())?;
    let settings = &context.settings;

    emit_debug(
        &app,
        "loading_character",
        json!({ "characterId": character_id.clone() }),
    );

    let character = match context.find_character(&character_id) {
        Ok(found) => found,
        Err(err) => {
            log_backend(
                &app,
                "chat_completion",
                format!("character {} not found", &character_id),
            );
            return Err(err);
        }
    };

    let mut session = match context.load_session(&session_id)? {
        Some(s) => s,
        None => {
            log_backend(
                &app,
                "chat_completion",
                format!("session {} not found", &session_id),
            );
            return Err("Session not found".to_string());
        }
    };

    // Prefer session's persona_id, fallback to explicitly passed persona_id
    let effective_persona_id = session.persona_id.as_ref().or(persona_id.as_ref());
    let persona = context.choose_persona(effective_persona_id.map(|id| id.as_str()));

    emit_debug(
        &app,
        "session_loaded",
        json!({
            "sessionId": session.id,
            "messageCount": session.messages.len(),
            "updatedAt": session.updated_at,
        }),
    );

    if session.character_id != character.id {
        session.character_id = character.id.clone();
    }

    let (model, provider_cred) = context.select_model(&character)?;

    log_backend(
        &app,
        "chat_completion",
        format!(
            "selected provider={} model={} credential={}",
            provider_cred.provider_id.as_str(),
            model.name.as_str(),
            provider_cred.id.as_str()
        ),
    );

    emit_debug(
        &app,
        "model_selected",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "credentialId": provider_cred.id,
        }),
    );

    let api_key = resolve_api_key(&app, provider_cred, "chat_completion")?;

    let now = now_millis()?;

    let user_msg = StoredMessage {
        id: uuid::Uuid::new_v4().to_string(),
        role: "user".into(),
        content: user_message.clone(),
        created_at: now,
        usage: None,
        variants: Vec::new(),
        selected_variant_id: None,
    };
    session.messages.push(user_msg.clone());
    session.updated_at = now;
    save_session(&app, &session)?;

    emit_debug(
        &app,
        "session_saved",
        json!({
            "stage": "after_user_message",
            "sessionId": session.id,
            "messageCount": session.messages.len(),
            "updatedAt": session.updated_at,
        }),
    );

    let system_prompt = context.build_system_prompt(&character, model, persona, &session);
    let recent_msgs = recent_messages(&session);

    let system_role = system_role_for_provider(provider_cred);
    let mut messages_for_api = Vec::new();
    append_system_message(&mut messages_for_api, system_role, system_prompt);
    for msg in &recent_msgs {
        push_message_for_api(&mut messages_for_api, msg);
    }

    let should_stream = stream.unwrap_or(true);
    let request_id = if should_stream {
        request_id.or_else(|| Some(Uuid::new_v4().to_string()))
    } else {
        None
    };

    let temperature = resolve_temperature(&session, &model, &settings);
    let top_p = resolve_top_p(&session, &model, &settings);
    let max_tokens = resolve_max_tokens(&session, &model, &settings);

    // Build provider-specific request using the request_builder
    let built = super::request_builder::build_chat_request(
        provider_cred,
        &api_key,
        &model.name,
        &messages_for_api,
        None,
        temperature,
        top_p,
        max_tokens,
        should_stream,
        request_id.clone(),
    );

    log_backend(
        &app,
        "chat_completion",
        format!(
            "request prepared endpoint={} stream={} request_id={:?}",
            built.url.as_str(),
            should_stream,
            &request_id
        ),
    );

    emit_debug(
        &app,
        "sending_request",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "stream": should_stream,
            "requestId": request_id,
            "endpoint": built.url,
        }),
    );

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(120_000),
        stream: Some(built.stream),
        request_id: built.request_id.clone(),
    };

    let api_response = match api_request(app.clone(), api_request_payload).await {
        Ok(resp) => resp,
        Err(err) => {
            log_backend(
                &app,
                "chat_completion",
                format!("api_request failed: {}", err),
            );
            return Err(err);
        }
    };

    emit_debug(
        &app,
        "response",
        json!({
            "status": api_response.status,
            "ok": api_response.ok,
        }),
    );

    if !api_response.ok {
        let fallback = format!("Provider returned status {}", api_response.status);
        let err_message = extract_error_message(api_response.data()).unwrap_or(fallback.clone());
        emit_debug(
            &app,
            "provider_error",
            json!({
                "status": api_response.status,
                "message": err_message,
            }),
        );
        let combined_error = if err_message == fallback {
            err_message
        } else {
            format!("{} (status {})", err_message, api_response.status)
        };
        log_backend(
            &app,
            "chat_completion",
            format!("provider error: {}", &combined_error),
        );
        return Err(combined_error);
    }

    let text = extract_text(api_response.data())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            let preview =
                serde_json::to_string(api_response.data()).unwrap_or_else(|_| "<non-json>".into());
            log_backend(
                &app,
                "chat_completion",
                format!("empty response from provider, preview={}", &preview),
            );
            emit_debug(&app, "empty_response", json!({ "preview": preview }));
            "Empty response from provider".to_string()
        })?;

    emit_debug(
        &app,
        "assistant_reply",
        json!({
            "length": text.len(),
        }),
    );

    let usage = extract_usage(api_response.data());

    let assistant_created_at = now_millis()?;
    let variant = new_assistant_variant(text.clone(), usage.clone(), assistant_created_at);
    let variant_id = variant.id.clone();

    let assistant_message = StoredMessage {
        id: Uuid::new_v4().to_string(),
        role: "assistant".into(),
        content: text.clone(),
        created_at: assistant_created_at,
        usage: usage.clone(),
        variants: vec![variant],
        selected_variant_id: Some(variant_id),
    };

    session.messages.push(assistant_message.clone());
    session.updated_at = now_millis()?;
    save_session(&app, &session)?;

    log_backend(
        &app,
        "chat_completion",
        format!(
            "assistant response saved message_id={} length={} total_messages={}",
            assistant_message.id.as_str(),
            assistant_message.content.len(),
            session.messages.len()
        ),
    );

    emit_debug(
        &app,
        "session_saved",
        json!({
            "stage": "after_assistant_message",
            "sessionId": session.id,
            "messageCount": session.messages.len(),
            "updatedAt": session.updated_at,
        }),
    );

    record_usage_if_available(
        &context,
        &usage,
        &session,
        &character,
        model,
        provider_cred,
        &api_key,
        assistant_created_at,
        "chat_completion",
    )
    .await;

    Ok(ChatTurnResult {
        session_id: session.id,
        request_id,
        user_message: user_msg,
        assistant_message,
        usage,
    })
}

#[tauri::command]
pub async fn chat_regenerate(
    app: AppHandle,
    args: ChatRegenerateArgs,
) -> Result<RegenerateResult, String> {
    let ChatRegenerateArgs {
        session_id,
        message_id,
        stream,
        request_id,
    } = args;

    let context = ChatContext::initialize(app.clone())?;
    let settings = &context.settings;

    log_backend(
        &app,
        "chat_regenerate",
        format!(
            "start session={} message={} stream={:?} request_id={:?}",
            &session_id, &message_id, stream, request_id
        ),
    );

    let mut session = match context.load_session(&session_id)? {
        Some(s) => s,
        None => {
            log_backend(
                &app,
                "chat_regenerate",
                format!("session {} not found", &session_id),
            );
            return Err("Session not found".to_string());
        }
    };

    emit_debug(
        &app,
        "regenerate_start",
        json!({
            "sessionId": session.id,
            "messageId": message_id,
            "messageCount": session.messages.len(),
        }),
    );

    if session.messages.is_empty() {
        return Err("No messages available for regeneration".into());
    }

    let target_index = session
        .messages
        .iter()
        .position(|msg| msg.id == message_id)
        .ok_or_else(|| "Assistant message not found".to_string())?;

    if target_index + 1 != session.messages.len() {
        return Err("Can only regenerate the latest assistant response".into());
    }

    if target_index == 0 {
        return Err("Assistant message has no preceding user prompt".into());
    }

    let preceding_index = target_index - 1;
    // Allow regeneration of continue messages (assistant messages that follow other assistant messages)
    // or normal assistant messages (that follow user messages)
    let preceding_message = &session.messages[preceding_index];
    if preceding_message.role != "user"
        && preceding_message.role != "assistant"
        && preceding_message.role != "scene"
    {
        return Err(
            "Expected preceding user, assistant, or scene message before assistant response".into(),
        );
    }

    if session.messages[target_index].role != "assistant"
        && session.messages[target_index].role != "scene"
    {
        return Err("Selected message is not an assistant or scene response".into());
    }

    let character = match context.find_character(&session.character_id) {
        Ok(found) => found,
        Err(err) => {
            log_backend(
                &app,
                "chat_regenerate",
                format!("character {} not found", &session.character_id),
            );
            return Err(err);
        }
    };

    let persona = context.choose_persona(None);

    let (model, provider_cred) = context.select_model(&character)?;

    log_backend(
        &app,
        "chat_regenerate",
        format!(
            "selected provider={} model={} credential={}",
            provider_cred.provider_id.as_str(),
            model.name.as_str(),
            provider_cred.id.as_str()
        ),
    );

    emit_debug(
        &app,
        "regenerate_model_selected",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "credentialId": provider_cred.id,
        }),
    );

    let api_key = resolve_api_key(&app, provider_cred, "chat_regenerate")?;

    let system_prompt = context.build_system_prompt(&character, model, persona, &session);

    let system_role = system_role_for_provider(provider_cred);
    let messages_for_api = {
        let mut out = Vec::new();
        append_system_message(&mut out, system_role, system_prompt);
        for (idx, msg) in session.messages.iter().enumerate() {
            if idx > target_index {
                break;
            }
            if idx == target_index {
                continue;
            }
            push_message_for_api(&mut out, msg);
        }
        out
    };

    let should_stream = stream.unwrap_or(true);
    let request_id = if should_stream {
        request_id.or_else(|| Some(Uuid::new_v4().to_string()))
    } else {
        None
    };

    {
        let message = session
            .messages
            .get_mut(target_index)
            .ok_or_else(|| "Assistant message not accessible".to_string())?;
        ensure_assistant_variant(message);
    }

    let temperature = resolve_temperature(&session, &model, &settings);
    let top_p = resolve_top_p(&session, &model, &settings);
    let max_tokens = resolve_max_tokens(&session, &model, &settings);

    let built = super::request_builder::build_chat_request(
        provider_cred,
        &api_key,
        &model.name,
        &messages_for_api,
        None,
        temperature,
        top_p,
        max_tokens,
        should_stream,
        request_id.clone(),
    );

    emit_debug(
        &app,
        "regenerate_request",
        json!({
            "sessionId": session.id,
            "messageId": message_id,
            "requestId": request_id,
            "endpoint": built.url,
        }),
    );

    log_backend(
        &app,
        "chat_regenerate",
        format!(
            "request prepared endpoint={} stream={} request_id={:?}",
            built.url.as_str(),
            should_stream,
            &request_id
        ),
    );

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(120_000),
        stream: Some(built.stream),
        request_id: built.request_id.clone(),
    };

    let api_response = match api_request(app.clone(), api_request_payload).await {
        Ok(resp) => resp,
        Err(err) => {
            log_backend(
                &app,
                "chat_regenerate",
                format!("api_request failed: {}", err),
            );
            return Err(err);
        }
    };

    emit_debug(
        &app,
        "regenerate_response",
        json!({
            "status": api_response.status,
            "ok": api_response.ok,
        }),
    );

    if !api_response.ok {
        let fallback = format!("Provider returned status {}", api_response.status);
        let err_message = extract_error_message(api_response.data()).unwrap_or(fallback.clone());
        emit_debug(
            &app,
            "regenerate_provider_error",
            json!({
                "status": api_response.status,
                "message": err_message,
            }),
        );
        return if err_message == fallback {
            Err(err_message)
        } else {
            Err(format!("{} (status {})", err_message, api_response.status))
        };
    }

    let text = extract_text(api_response.data())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            let preview =
                serde_json::to_string(api_response.data()).unwrap_or_else(|_| "<non-json>".into());
            emit_debug(
                &app,
                "regenerate_empty_response",
                json!({ "preview": preview }),
            );
            "Empty response from provider".to_string()
        })?;

    let usage = extract_usage(api_response.data());
    let created_at = now_millis()?;
    let new_variant = new_assistant_variant(text.clone(), usage.clone(), created_at);

    let assistant_clone = {
        let assistant_message = session
            .messages
            .get_mut(target_index)
            .ok_or_else(|| "Assistant message not accessible".to_string())?;

        assistant_message.content = text.clone();
        assistant_message.usage = usage.clone();
        assistant_message.variants.push(new_variant);
        if let Some(last) = assistant_message.variants.last() {
            assistant_message.selected_variant_id = Some(last.id.clone());
        }
        assistant_message.clone()
    };

    session.updated_at = now_millis()?;
    save_session(&app, &session)?;

    emit_debug(
        &app,
        "regenerate_saved",
        json!({
            "sessionId": session.id,
            "messageId": message_id,
            "variantId": assistant_clone
                .selected_variant_id
                .clone()
                .unwrap_or_default(),
            "variantCount": assistant_clone.variants.len(),
        }),
    );

    log_backend(
        &app,
        "chat_regenerate",
        format!(
            "completed messageId={} variants={} request_id={:?}",
            assistant_clone.id.as_str(),
            assistant_clone.variants.len(),
            &request_id
        ),
    );

    record_usage_if_available(
        &context,
        &usage,
        &session,
        &character,
        model,
        provider_cred,
        &api_key,
        created_at,
        "chat_regenerate",
    )
    .await;

    Ok(RegenerateResult {
        session_id: session.id,
        request_id,
        assistant_message: assistant_clone,
    })
}

#[tauri::command]
pub async fn chat_continue(
    app: AppHandle,
    args: ChatContinueArgs,
) -> Result<ContinueResult, String> {
    let ChatContinueArgs {
        session_id,
        character_id,
        persona_id,
        stream,
        request_id,
    } = args;

    let context = ChatContext::initialize(app.clone())?;
    let settings = &context.settings;

    log_backend(
        &app,
        "chat_continue",
        format!(
            "start session={} character={} stream={:?} request_id={:?}",
            &session_id, &character_id, stream, request_id
        ),
    );

    let mut session = match context.load_session(&session_id)? {
        Some(s) => s,
        None => {
            log_backend(
                &app,
                "chat_continue",
                format!("session {} not found", &session_id),
            );
            return Err("Session not found".to_string());
        }
    };

    emit_debug(
        &app,
        "continue_start",
        json!({
            "sessionId": session.id,
            "characterId": character_id,
            "messageCount": session.messages.len(),
        }),
    );

    let character = match context.find_character(&character_id) {
        Ok(found) => found,
        Err(err) => {
            log_backend(
                &app,
                "chat_continue",
                format!("character {} not found", &character_id),
            );
            return Err(err);
        }
    };

    // Prefer session's persona_id, fallback to explicitly passed persona_id
    let effective_persona_id = session.persona_id.as_ref().or(persona_id.as_ref());
    let persona = context.choose_persona(effective_persona_id.map(|id| id.as_str()));

    let (model, provider_cred) = context.select_model(&character)?;

    log_backend(
        &app,
        "chat_continue",
        format!(
            "selected provider={} model={} credential={}",
            provider_cred.provider_id.as_str(),
            model.name.as_str(),
            provider_cred.id.as_str()
        ),
    );

    emit_debug(
        &app,
        "continue_model_selected",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "credentialId": provider_cred.id,
        }),
    );

    let api_key = resolve_api_key(&app, provider_cred, "chat_continue")?;

    let system_prompt = context.build_system_prompt(&character, model, persona, &session);
    let recent_msgs = recent_messages(&session);

    let system_role = system_role_for_provider(provider_cred);
    let mut messages_for_api = Vec::new();
    append_system_message(&mut messages_for_api, system_role, system_prompt);
    for msg in &recent_msgs {
        push_message_for_api(&mut messages_for_api, msg);
    }

    messages_for_api.push(json!({
        "role": "user",
        "content": "[Continue the scene/roleplay. Do not regenerate or rewrite your previous message. Instead, continue naturally from where you left off, advancing the story, action, or dialogue forward.]"
    }));

    let should_stream = stream.unwrap_or(true);
    let request_id = if should_stream {
        request_id.or_else(|| Some(Uuid::new_v4().to_string()))
    } else {
        None
    };

    let temperature = resolve_temperature(&session, &model, &settings);
    let top_p = resolve_top_p(&session, &model, &settings);
    let max_tokens = resolve_max_tokens(&session, &model, &settings);

    let built = super::request_builder::build_chat_request(
        provider_cred,
        &api_key,
        &model.name,
        &messages_for_api,
        None,
        temperature,
        top_p,
        max_tokens,
        should_stream,
        request_id.clone(),
    );

    emit_debug(
        &app,
        "continue_request",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "stream": should_stream,
            "requestId": request_id,
            "endpoint": built.url,
        }),
    );

    log_backend(
        &app,
        "chat_continue",
        format!(
            "request prepared endpoint={} stream={} request_id={:?}",
            built.url.as_str(),
            should_stream,
            &request_id
        ),
    );

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(120_000),
        stream: Some(built.stream),
        request_id: built.request_id.clone(),
    };

    let api_response = match api_request(app.clone(), api_request_payload).await {
        Ok(resp) => resp,
        Err(err) => {
            log_backend(
                &app,
                "chat_continue",
                format!("api_request failed: {}", err),
            );
            return Err(err);
        }
    };

    emit_debug(
        &app,
        "continue_response",
        json!({
            "status": api_response.status,
            "ok": api_response.ok,
        }),
    );

    if !api_response.ok {
        let fallback = format!("Provider returned status {}", api_response.status);
        let err_message = extract_error_message(api_response.data()).unwrap_or(fallback.clone());
        log_backend(
            &app,
            "chat_continue",
            format!(
                "provider returned error status={} message={}",
                api_response.status, &err_message
            ),
        );
        emit_debug(
            &app,
            "continue_provider_error",
            json!({
                "status": api_response.status,
                "message": err_message,
            }),
        );
        return if err_message == fallback {
            Err(err_message)
        } else {
            Err(format!("{} (status {})", err_message, api_response.status))
        };
    }

    let text = extract_text(api_response.data())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            let preview =
                serde_json::to_string(api_response.data()).unwrap_or_else(|_| "<non-json>".into());
            log_backend(
                &app,
                "chat_continue",
                format!("empty response from provider, preview={}", &preview),
            );
            emit_debug(
                &app,
                "continue_empty_response",
                json!({ "preview": preview }),
            );
            "Empty response from provider".to_string()
        })?;

    emit_debug(
        &app,
        "continue_assistant_reply",
        json!({
            "length": text.len(),
        }),
    );

    let usage = extract_usage(api_response.data());

    let assistant_created_at = now_millis()?;
    let variant = new_assistant_variant(text.clone(), usage.clone(), assistant_created_at);
    let variant_id = variant.id.clone();

    let assistant_message = StoredMessage {
        id: Uuid::new_v4().to_string(),
        role: "assistant".into(),
        content: text.clone(),
        created_at: assistant_created_at,
        usage: usage.clone(),
        variants: vec![variant],
        selected_variant_id: Some(variant_id),
    };

    session.messages.push(assistant_message.clone());
    session.updated_at = now_millis()?;
    save_session(&app, &session)?;

    emit_debug(
        &app,
        "continue_session_saved",
        json!({
            "sessionId": session.id,
            "messageCount": session.messages.len(),
            "updatedAt": session.updated_at,
        }),
    );

    log_backend(
        &app,
        "chat_continue",
        format!(
            "assistant continuation saved message_id={} total_messages={} request_id={:?}",
            assistant_message.id.as_str(),
            session.messages.len(),
            &request_id
        ),
    );

    record_usage_if_available(
        &context,
        &usage,
        &session,
        &character,
        model,
        provider_cred,
        &api_key,
        assistant_created_at,
        "chat_continue",
    )
    .await;

    Ok(ContinueResult {
        session_id: session.id,
        request_id,
        assistant_message,
    })
}

#[tauri::command]
pub fn get_default_character_rules(pure_mode_enabled: bool) -> Vec<String> {
    default_character_rules(pure_mode_enabled)
}

#[tauri::command]
pub fn get_default_system_prompt_template() -> String {
    use super::storage::default_system_prompt_template;
    default_system_prompt_template()
}

// ==================== Prompt Template Commands ====================

#[tauri::command]
pub fn list_prompt_templates(app: AppHandle) -> Result<Vec<SystemPromptTemplate>, String> {
    prompts::load_templates(&app)
}

#[tauri::command]
pub fn create_prompt_template(
    app: AppHandle,
    name: String,
    scope: PromptScope,
    target_ids: Vec<String>,
    content: String,
) -> Result<SystemPromptTemplate, String> {
    prompts::create_template(&app, name, scope, target_ids, content)
}

#[tauri::command]
pub fn update_prompt_template(
    app: AppHandle,
    id: String,
    name: Option<String>,
    scope: Option<PromptScope>,
    target_ids: Option<Vec<String>>,
    content: Option<String>,
) -> Result<SystemPromptTemplate, String> {
    prompts::update_template(&app, id, name, scope, target_ids, content)
}

#[tauri::command]
pub fn delete_prompt_template(app: AppHandle, id: String) -> Result<(), String> {
    prompts::delete_template(&app, id)
}

#[tauri::command]
pub fn get_prompt_template(app: AppHandle, id: String) -> Result<Option<SystemPromptTemplate>, String> {
    prompts::get_template(&app, &id)
}

#[tauri::command]
pub fn get_app_default_template_id() -> String {
    prompts::APP_DEFAULT_TEMPLATE_ID.to_string()
}

#[tauri::command]
pub fn is_app_default_template(id: String) -> bool {
    prompts::is_app_default_template(&id)
}

#[tauri::command]
pub fn reset_app_default_template(app: AppHandle) -> Result<SystemPromptTemplate, String> {
    prompts::reset_app_default_template(&app)
}

#[tauri::command]
pub fn get_applicable_prompts_for_character(
    app: AppHandle,
    character_id: String,
) -> Result<Vec<SystemPromptTemplate>, String> {
    prompts::get_applicable_for_character(&app, &character_id)
}

#[tauri::command]
pub fn get_applicable_prompts_for_model(
    app: AppHandle,
    model_id: String,
) -> Result<Vec<SystemPromptTemplate>, String> {
    prompts::get_applicable_for_model(&app, &model_id)
}
