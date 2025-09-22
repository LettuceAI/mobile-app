use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

use crate::api::{api_request, ApiRequest};
use crate::secrets::secret_for_cred_get;
use crate::storage_manager::{
    storage_read_characters, storage_read_personas, storage_read_session, storage_read_settings,
    storage_write_session, storage_write_settings,
};
use crate::utils::now_millis;

fn emit_debug(app: &AppHandle, phase: &str, payload: Value) {
    let event = json!({
        "phase": phase,
        "payload": payload,
    });
    let _ = app.emit("chat://debug", event);
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SecretRef {
    provider_id: String,
    key: String,
    cred_id: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
struct ProviderCredential {
    id: String,
    provider_id: String,
    label: String,
    api_key_ref: Option<SecretRef>,
    base_url: Option<String>,
    default_model: Option<String>,
    headers: Option<HashMap<String, String>>,
}

#[derive(Deserialize, Serialize, Clone)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
struct Model {
    id: String,
    name: String,
    provider_id: String,
    provider_label: String,
    display_name: String,
    created_at: u64,
}

#[derive(Deserialize, Serialize, Clone)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
struct Settings {
    default_provider_credential_id: Option<String>,
    default_model_id: Option<String>,
    provider_credentials: Vec<ProviderCredential>,
    models: Vec<Model>,
    #[serde(default)]
    app_state: Value,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    id: String,
    role: String,
    content: String,
    created_at: u64,
    #[serde(default)]
    usage: Option<UsageSummary>,
    #[serde(default)]
    variants: Vec<MessageVariant>,
    #[serde(default)]
    selected_variant_id: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MessageVariant {
    id: String,
    content: String,
    created_at: u64,
    #[serde(default)]
    usage: Option<UsageSummary>,
}

#[derive(Deserialize, Serialize, Clone)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
struct Session {
    id: String,
    character_id: String,
    title: String,
    #[serde(default)]
    system_prompt: Option<String>,
    #[serde(default)]
    messages: Vec<StoredMessage>,
    #[serde(default)]
    archived: bool,
    created_at: u64,
    updated_at: u64,
}

#[derive(Deserialize, Serialize, Clone)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
struct Character {
    id: String,
    name: String,
    #[serde(default)]
    avatar_path: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    style: Option<String>,
    #[serde(default)]
    boundaries: Option<String>,
    #[serde(default)]
    default_model_id: Option<String>,
    created_at: u64,
    updated_at: u64,
}

#[derive(Deserialize, Serialize, Clone)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
struct Persona {
    id: String,
    title: String,
    description: String,
    #[serde(default)]
    is_default: bool,
    created_at: u64,
    updated_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurnResult {
    pub session_id: String,
    pub request_id: Option<String>,
    pub user_message: StoredMessage,
    pub assistant_message: StoredMessage,
    pub usage: Option<UsageSummary>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCompletionArgs {
    #[serde(alias = "sessionId")]
    session_id: String,
    #[serde(alias = "characterId")]
    character_id: String,
    #[serde(alias = "userMessage")]
    user_message: String,
    #[serde(alias = "personaId")]
    persona_id: Option<String>,
    stream: Option<bool>,
    #[serde(alias = "requestId")]
    request_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRegenerateArgs {
    #[serde(alias = "sessionId")]
    session_id: String,
    #[serde(alias = "messageId")]
    message_id: String,
    stream: Option<bool>,
    #[serde(alias = "requestId")]
    request_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerateResult {
    pub session_id: String,
    pub request_id: Option<String>,
    pub assistant_message: StoredMessage,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
}

fn load_settings(app: &AppHandle) -> Result<Settings, String> {
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
        app_state: Value::Null,
    }
}

fn load_characters(app: &AppHandle) -> Result<Vec<Character>, String> {
    let json = storage_read_characters(app.clone())?;
    if let Some(data) = json {
        serde_json::from_str(&data).map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

fn load_personas(app: &AppHandle) -> Result<Vec<Persona>, String> {
    let json = storage_read_personas(app.clone())?;
    if let Some(data) = json {
        serde_json::from_str(&data).map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

fn load_session(app: &AppHandle, session_id: &str) -> Result<Option<Session>, String> {
    let json = storage_read_session(app.clone(), session_id.to_string())?;
    if let Some(data) = json {
        let session: Session = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        Ok(Some(session))
    } else {
        Ok(None)
    }
}

fn save_session(app: &AppHandle, session: &Session) -> Result<(), String> {
    let payload = serde_json::to_string(session).map_err(|e| e.to_string())?;
    storage_write_session(app.clone(), session.id.clone(), payload)
}

fn select_model<'a>(
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

fn choose_persona<'a>(personas: &'a [Persona], explicit: Option<&String>) -> Option<&'a Persona> {
    if let Some(id) = explicit {
        if let Some(p) = personas.iter().find(|p| &p.id == id) {
            return Some(p);
        }
    }
    personas.iter().find(|p| p.is_default)
}

fn build_system_prompt(
    character: &Character,
    persona: Option<&Persona>,
    session: &Session,
) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Some(p) = persona {
        parts.push(format!("Persona: {}", p.description));
    }
    if let Some(desc) = &character.description {
        if !desc.trim().is_empty() {
            parts.push(format!("Character description: {}", desc));
        }
    }
    if let Some(style) = &character.style {
        if !style.trim().is_empty() {
            parts.push(format!("Style guidance: {}", style));
        }
    }
    if let Some(boundaries) = &character.boundaries {
        if !boundaries.trim().is_empty() {
            parts.push(format!("Boundaries: {}", boundaries));
        }
    }
    if let Some(base) = &session.system_prompt {
        if !base.trim().is_empty() {
            parts.push(base.clone());
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n\n"))
    }
}

fn collect_text_fragments(value: &Value, acc: &mut String) {
    match value {
        Value::String(s) => acc.push_str(s),
        Value::Array(items) => {
            for item in items {
                collect_text_fragments(item, acc);
            }
        }
        Value::Object(map) => {
            let mut handled = false;
            if let Some(inner) = map.get("text") {
                handled = true;
                collect_text_fragments(inner, acc);
            }
            if let Some(inner) = map.get("content") {
                handled = true;
                collect_text_fragments(inner, acc);
            }
            if let Some(inner) = map.get("value") {
                handled = true;
                collect_text_fragments(inner, acc);
            }
            if let Some(inner) = map.get("message") {
                handled = true;
                collect_text_fragments(inner, acc);
            }
            if let Some(inner) = map.get("parts") {
                handled = true;
                collect_text_fragments(inner, acc);
            }
            if !handled {
                for inner in map.values() {
                    collect_text_fragments(inner, acc);
                }
            }
        }
        _ => {}
    }
}

fn join_text_fragments(value: &Value) -> Option<String> {
    let mut buffer = String::new();
    collect_text_fragments(value, &mut buffer);
    if buffer.trim().is_empty() {
        None
    } else {
        Some(buffer)
    }
}

fn extract_message_content(value: &Value) -> Option<String> {
    match value {
        Value::Object(map) => {
            if let Some(content) = map.get("content") {
                if let Some(text) = join_text_fragments(content) {
                    return Some(text);
                }
            }
            if let Some(text) = map.get("text") {
                if let Some(text) = join_text_fragments(text) {
                    return Some(text);
                }
            }
            join_text_fragments(value)
        }
        _ => join_text_fragments(value),
    }
}

fn extract_text(data: &Value) -> Option<String> {
    match data {
        Value::String(s) => {
            if s.contains("data:") {
                let mut collected = String::new();
                for raw in s.lines() {
                    let line = raw.trim();
                    if !line.starts_with("data:") {
                        continue;
                    }
                    let payload = line[5..].trim();
                    if payload.is_empty() || payload == "[DONE]" {
                        continue;
                    }
                    if let Ok(json) = serde_json::from_str::<Value>(payload) {
                        if let Some(piece) = extract_text(&json) {
                            collected.push_str(&piece);
                        }
                    }
                }
                if !collected.is_empty() {
                    return Some(collected);
                }
            }
            Some(s.clone())
        }
        Value::Array(items) => {
            let mut combined = String::new();
            for item in items {
                if let Some(part) = extract_text(item) {
                    combined.push_str(&part);
                }
            }
            if combined.is_empty() {
                None
            } else {
                Some(combined)
            }
        }
        Value::Object(map) => {
            if let Some(Value::Array(choices)) = map.get("choices") {
                for choice in choices {
                    if let Value::Object(choice_map) = choice {
                        if let Some(message) = choice_map.get("message") {
                            if let Some(text) = extract_message_content(message) {
                                if !text.trim().is_empty() {
                                    return Some(text);
                                }
                            }
                        }
                        if let Some(delta) = choice_map.get("delta") {
                            if let Some(text) = extract_message_content(delta) {
                                if !text.trim().is_empty() {
                                    return Some(text);
                                }
                            }
                        }
                        if let Some(content) = choice_map.get("content") {
                            if let Some(text) = extract_message_content(content) {
                                if !text.trim().is_empty() {
                                    return Some(text);
                                }
                            }
                        }
                    }
                }
            }
            if let Some(Value::Array(candidates)) = map.get("candidates") {
                for candidate in candidates {
                    if let Some(text) = extract_message_content(candidate) {
                        if !text.trim().is_empty() {
                            return Some(text);
                        }
                    }
                }
            }
            if let Some(text) = map.get("message").and_then(extract_message_content) {
                if !text.trim().is_empty() {
                    return Some(text);
                }
            }
            if let Some(text) = map.get("content").and_then(join_text_fragments) {
                if !text.trim().is_empty() {
                    return Some(text);
                }
            }
            if let Some(text) = map.get("text").and_then(join_text_fragments) {
                if !text.trim().is_empty() {
                    return Some(text);
                }
            }
            None
        }
        _ => None,
    }
}

fn extract_error_message(data: &Value) -> Option<String> {
    match data {
        Value::Object(map) => {
            if let Some(err) = map.get("error") {
                if let Some(text) = join_text_fragments(err) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
            if let Some(Value::String(message)) = map.get("message") {
                let trimmed = message.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        Value::String(s) => {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        _ => {}
    }
    join_text_fragments(data)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn parse_token_value(value: &Value) -> Option<u64> {
    match value {
        Value::Number(num) => num.as_u64(),
        Value::String(text) => text.trim().parse::<u64>().ok(),
        _ => None,
    }
}

fn usage_from_map(map: &serde_json::Map<String, Value>) -> Option<UsageSummary> {
    fn take_first(map: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<u64> {
        for key in keys {
            if let Some(value) = map.get(*key) {
                if let Some(parsed) = parse_token_value(value) {
                    return Some(parsed);
                }
            }
        }
        None
    }

    let prompt_tokens = take_first(
        map,
        &[
            "prompt_tokens",
            "input_tokens",
            "promptTokens",
            "inputTokens",
        ],
    );
    let completion_tokens = take_first(
        map,
        &[
            "completion_tokens",
            "output_tokens",
            "completionTokens",
            "outputTokens",
        ],
    );
    let total_tokens = take_first(map, &["total_tokens", "totalTokens"]).or_else(|| {
        match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        }
    });

    if prompt_tokens.is_none() && completion_tokens.is_none() && total_tokens.is_none() {
        None
    } else {
        Some(UsageSummary {
            prompt_tokens,
            completion_tokens,
            total_tokens,
        })
    }
}

fn extract_usage(data: &Value) -> Option<UsageSummary> {
    match data {
        Value::String(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return None;
            }
            if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
                if let Some(summary) = extract_usage(&parsed) {
                    return Some(summary);
                }
            }
            let mut found: Option<UsageSummary> = None;
            for line in raw.lines() {
                let piece = line.trim();
                if !piece.starts_with("data:") {
                    continue;
                }
                let payload = piece[5..].trim();
                if payload.is_empty() || payload == "[DONE]" {
                    continue;
                }
                if let Ok(parsed) = serde_json::from_str::<Value>(payload) {
                    if let Some(summary) = extract_usage(&parsed) {
                        found = Some(summary);
                    }
                }
            }
            found
        }
        Value::Array(items) => {
            for item in items {
                if let Some(summary) = extract_usage(item) {
                    return Some(summary);
                }
            }
            None
        }
        Value::Object(map) => {
            if let Some(usage_value) = map.get("usage") {
                if let Some(summary) = match usage_value {
                    Value::Object(obj) => usage_from_map(obj),
                    _ => extract_usage(usage_value),
                } {
                    return Some(summary);
                }
            }
            if let Some(summary) = usage_from_map(map) {
                return Some(summary);
            }
            for value in map.values() {
                if let Some(summary) = extract_usage(value) {
                    return Some(summary);
                }
            }
            None
        }
        _ => None,
    }
}

fn provider_base_url(cred: &ProviderCredential) -> String {
    if let Some(base) = &cred.base_url {
        if !base.is_empty() {
            return base.trim_end_matches('/').to_string();
        }
    }
    match cred.provider_id.as_str() {
        "openai" => "https://api.openai.com".to_string(),
        "anthropic" => "https://api.anthropic.com".to_string(),
        "openrouter" => "https://openrouter.ai/api".to_string(),
        "google" => "https://generativelanguage.googleapis.com".to_string(),
        _ => "https://api.openai.com".to_string(),
    }
}

fn selected_variant<'a>(message: &'a StoredMessage) -> Option<&'a MessageVariant> {
    if let Some(selected_id) = &message.selected_variant_id {
        message
            .variants
            .iter()
            .find(|variant| &variant.id == selected_id)
    } else {
        None
    }
}

fn message_text_for_api(message: &StoredMessage) -> String {
    selected_variant(message)
        .map(|variant| variant.content.clone())
        .unwrap_or_else(|| message.content.clone())
}

fn chat_completions_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        format!("{}/chat/completions", trimmed)
    } else {
        format!("{}/v1/chat/completions", trimmed)
    }
}

fn normalize_headers(cred: &ProviderCredential, api_key: &str) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = HashMap::new();
    out.insert("Authorization".into(), format!("Bearer {}", api_key));
    out.insert("Content-Type".into(), "application/json".into());
    if let Some(extra) = &cred.headers {
        for (k, v) in extra {
            out.insert(k.clone(), v.clone());
        }
    }
    out
}

#[tauri::command]
pub async fn chat_completion(
    app: tauri::AppHandle,
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

    let mut recent_msgs: Vec<StoredMessage> =
        session.messages.iter().rev().take(50).cloned().collect();
    recent_msgs.reverse();

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
        request_id.or_else(|| Some(uuid::Uuid::new_v4().to_string()))
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

    let variant_id = uuid::Uuid::new_v4().to_string();
    let assistant_created_at = now_millis()?;
    let variant = MessageVariant {
        id: variant_id.clone(),
        content: text.clone(),
        created_at: assistant_created_at,
        usage: usage.clone(),
    };

    let assistant_message = StoredMessage {
        id: uuid::Uuid::new_v4().to_string(),
        role: "assistant".into(),
        content: text.clone(),
        created_at: assistant_created_at,
        usage: usage.clone(),
        variants: vec![variant],
        selected_variant_id: Some(variant_id.clone()),
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
    app: tauri::AppHandle,
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
        request_id.or_else(|| Some(uuid::Uuid::new_v4().to_string()))
    } else {
        None
    };

    {
        let assistant_message = session
            .messages
            .get_mut(target_index)
            .ok_or_else(|| "Assistant message not accessible".to_string())?;

        if assistant_message.variants.is_empty() {
            let existing_variant_id = uuid::Uuid::new_v4().to_string();
            assistant_message.variants.push(MessageVariant {
                id: existing_variant_id.clone(),
                content: assistant_message.content.clone(),
                created_at: assistant_message.created_at,
                usage: assistant_message.usage.clone(),
            });
            assistant_message.selected_variant_id = Some(existing_variant_id);
        } else if assistant_message.selected_variant_id.is_none() {
            if let Some(last) = assistant_message.variants.last() {
                assistant_message.selected_variant_id = Some(last.id.clone());
            }
        }
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

    let variant_id = uuid::Uuid::new_v4().to_string();
    let created_at = now_millis()?;
    let new_variant = MessageVariant {
        id: variant_id.clone(),
        content: text.clone(),
        created_at,
        usage: usage.clone(),
    };

    let assistant_clone = {
        let assistant_message = session
            .messages
            .get_mut(target_index)
            .ok_or_else(|| "Assistant message not accessible".to_string())?;

        assistant_message.content = text.clone();
        assistant_message.usage = usage.clone();
        assistant_message.variants.push(new_variant);
        assistant_message.selected_variant_id = Some(variant_id.clone());
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
            "variantId": variant_id,
            "variantCount": assistant_clone.variants.len(),
        }),
    );

    Ok(RegenerateResult {
        session_id: session.id,
        request_id,
        assistant_message: assistant_clone,
    })
}
