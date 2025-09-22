use serde_json::json;
use tauri::AppHandle;
use uuid::Uuid;

use crate::api::{api_request, ApiRequest};
use crate::secrets::secret_for_cred_get;
use crate::utils::now_millis;

use super::emit_debug;
use super::request::{
    chat_completions_endpoint, ensure_assistant_variant, extract_error_message, extract_text,
    extract_usage, message_text_for_api, new_assistant_variant, normalize_headers,
    provider_base_url,
};
use super::storage::{
    build_system_prompt, choose_persona, load_characters, load_personas, load_session,
    load_settings, recent_messages, save_session, select_model,
};
use super::types::{
    ChatCompletionArgs, ChatRegenerateArgs, ChatTurnResult, RegenerateResult, StoredMessage,
};

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

    let settings = load_settings(&app)?;
    let characters = load_characters(&app)?;
    let personas = load_personas(&app)?;

    emit_debug(
        &app,
        "loading_character",
        json!({ "characterId": character_id.clone() }),
    );

    let character = characters
        .into_iter()
        .find(|c| c.id == character_id)
        .ok_or_else(|| "Character not found".to_string())?;

    let persona = choose_persona(&personas, persona_id.as_ref());

    let mut session =
        load_session(&app, &session_id)?.ok_or_else(|| "Session not found".to_string())?;

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

    let (model, provider_cred) = select_model(&settings, &character)?;

    emit_debug(
        &app,
        "model_selected",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "credentialId": provider_cred.id,
        }),
    );

    let api_key = if let Some(ref api_ref) = provider_cred.api_key_ref {
        secret_for_cred_get(
            app.clone(),
            api_ref.provider_id.clone(),
            api_ref
                .cred_id
                .clone()
                .unwrap_or_else(|| provider_cred.id.clone()),
            api_ref.key.clone(),
        )?
        .ok_or_else(|| "Missing API key".to_string())?
    } else {
        return Err("Provider credential missing API key reference".into());
    };

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

    let system_prompt = build_system_prompt(&character, persona, &session);

    let recent_msgs = recent_messages(&session);

    let mut messages_for_api = Vec::new();
    if let Some(system) = &system_prompt {
        messages_for_api.push(json!({ "role": "system", "content": system }));
    }
    for msg in &recent_msgs {
        messages_for_api.push(json!({
            "role": msg.role,
            "content": message_text_for_api(msg)
        }));
    }

    let should_stream = stream.unwrap_or(true);
    let request_id = if should_stream {
        request_id.or_else(|| Some(Uuid::new_v4().to_string()))
    } else {
        None
    };

    let base_url = provider_base_url(provider_cred);
    let endpoint = chat_completions_endpoint(&base_url);
    let headers = normalize_headers(provider_cred, &api_key);

    let body = json!({
        "model": model.name,
        "messages": messages_for_api,
        "stream": should_stream,
        "temperature": 0.7,
        "top_p": 1.0,
        "max_tokens": 1024,
    });

    emit_debug(
        &app,
        "sending_request",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "stream": should_stream,
            "requestId": request_id,
            "endpoint": endpoint,
        }),
    );

    let api_response = api_request(
        app.clone(),
        ApiRequest {
            url: endpoint,
            method: Some("POST".into()),
            headers: Some(headers),
            query: None,
            body: Some(body),
            timeout_ms: Some(120_000),
            stream: Some(should_stream),
            request_id: request_id.clone(),
        },
    )
    .await?;

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

    let settings = load_settings(&app)?;
    let characters = load_characters(&app)?;
    let personas = load_personas(&app)?;

    let mut session =
        load_session(&app, &session_id)?.ok_or_else(|| "Session not found".to_string())?;

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
    if session.messages[preceding_index].role != "user" {
        return Err("Expected preceding user message before assistant response".into());
    }

    if session.messages[target_index].role != "assistant" {
        return Err("Selected message is not an assistant response".into());
    }

    let character = characters
        .into_iter()
        .find(|c| c.id == session.character_id)
        .ok_or_else(|| "Character not found".to_string())?;

    let persona = choose_persona(&personas, None);

    let (model, provider_cred) = select_model(&settings, &character)?;

    emit_debug(
        &app,
        "regenerate_model_selected",
        json!({
            "providerId": provider_cred.provider_id,
            "model": model.name,
            "credentialId": provider_cred.id,
        }),
    );

    let api_key = if let Some(ref api_ref) = provider_cred.api_key_ref {
        secret_for_cred_get(
            app.clone(),
            api_ref.provider_id.clone(),
            api_ref
                .cred_id
                .clone()
                .unwrap_or_else(|| provider_cred.id.clone()),
            api_ref.key.clone(),
        )?
        .ok_or_else(|| "Missing API key".to_string())?
    } else {
        return Err("Provider credential missing API key reference".into());
    };

    let system_prompt = build_system_prompt(&character, persona, &session);

    let messages_for_api = {
        let mut out = Vec::new();
        if let Some(system) = &system_prompt {
            out.push(json!({ "role": "system", "content": system }));
        }
        for (idx, msg) in session.messages.iter().enumerate() {
            if idx > target_index {
                break;
            }
            if idx == target_index {
                continue;
            }
            out.push(json!({
                "role": msg.role,
                "content": message_text_for_api(msg),
            }));
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

    let base_url = provider_base_url(provider_cred);
    let endpoint = chat_completions_endpoint(&base_url);
    let headers = normalize_headers(provider_cred, &api_key);

    let body = json!({
        "model": model.name,
        "messages": messages_for_api,
        "stream": should_stream,
        "temperature": 0.7,
        "top_p": 1.0,
        "max_tokens": 1024,
    });

    emit_debug(
        &app,
        "regenerate_request",
        json!({
            "sessionId": session.id,
            "messageId": message_id,
            "requestId": request_id,
            "endpoint": endpoint,
        }),
    );

    let api_response = api_request(
        app.clone(),
        ApiRequest {
            url: endpoint,
            method: Some("POST".into()),
            headers: Some(headers),
            query: None,
            body: Some(body),
            timeout_ms: Some(120_000),
            stream: Some(should_stream),
            request_id: request_id.clone(),
        },
    )
    .await?;

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

    Ok(RegenerateResult {
        session_id: session.id,
        request_id,
        assistant_message: assistant_clone,
    })
}
