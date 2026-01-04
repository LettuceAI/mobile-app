use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::tools::{get_creation_helper_system_prompt, get_creation_helper_tools};
use super::types::*;
use crate::api::{api_request, ApiRequest};
use crate::chat_manager::request_builder::build_chat_request;
use crate::chat_manager::sse::usage_from_value;
use crate::chat_manager::tooling::{parse_tool_calls, ToolConfig};
use crate::storage_manager::db::{now_ms, open_db};
use crate::storage_manager::settings::internal_read_settings;
use crate::usage::{
    add_usage_record,
    tracking::{RequestUsage, UsageFinishReason, UsageOperationType},
};
use crate::utils::{log_error, log_info};

lazy_static::lazy_static! {
    static ref SESSIONS: Mutex<HashMap<String, CreationSession>> = Mutex::new(HashMap::new());
    static ref UPLOADED_IMAGES: Mutex<HashMap<String, HashMap<String, UploadedImage>>> = Mutex::new(HashMap::new());
}

pub fn start_session() -> Result<CreationSession, String> {
    let now = now_ms() as i64;
    let session_id = Uuid::new_v4().to_string();

    let session = CreationSession {
        id: session_id.clone(),
        messages: vec![],
        draft: DraftCharacter::default(),
        draft_history: vec![],
        status: CreationStatus::Active,
        created_at: now,
        updated_at: now,
    };

    let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    sessions.insert(session_id.clone(), session.clone());

    let mut images = UPLOADED_IMAGES.lock().map_err(|e| e.to_string())?;
    images.insert(session_id, HashMap::new());

    Ok(session)
}

pub fn get_session(session_id: &str) -> Result<Option<CreationSession>, String> {
    let sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    Ok(sessions.get(session_id).cloned())
}

pub fn save_uploaded_image(
    session_id: &str,
    image_id: String,
    data: String,
    mime_type: String,
) -> Result<(), String> {
    let mut images = UPLOADED_IMAGES.lock().map_err(|e| e.to_string())?;
    let session_images = images
        .entry(session_id.to_string())
        .or_insert_with(HashMap::new);
    session_images.insert(
        image_id.clone(),
        UploadedImage {
            id: image_id,
            data,
            mime_type,
        },
    );
    Ok(())
}

pub fn get_uploaded_image(
    session_id: &str,
    image_id: &str,
) -> Result<Option<UploadedImage>, String> {
    let images = UPLOADED_IMAGES.lock().map_err(|e| e.to_string())?;
    Ok(images
        .get(session_id)
        .and_then(|session_images| session_images.get(image_id))
        .cloned())
}

pub fn get_all_uploaded_images(session_id: &str) -> Result<Vec<UploadedImage>, String> {
    let images = UPLOADED_IMAGES.lock().map_err(|e| e.to_string())?;
    Ok(images
        .get(session_id)
        .map(|session_images| session_images.values().cloned().collect())
        .unwrap_or_default())
}

fn execute_tool(
    app: &AppHandle,
    session: &mut CreationSession,
    tool_call_id: &str,
    tool_name: &str,
    arguments: &Value,
) -> CreationToolResult {
    log_info(
        app,
        "creation_helper",
        format!(
            "Executing tool: {} with id: {} args: {}",
            tool_name, tool_call_id, arguments
        ),
    );

    let result = match tool_name {
        "set_character_name" => {
            if let Some(name) = arguments.get("name").and_then(|v| v.as_str()) {
                session.draft.name = Some(name.to_string());
                json!({ "success": true, "message": format!("Name set to '{}'", name) })
            } else {
                json!({ "success": false, "error": "Missing 'name' argument" })
            }
        }
        "set_character_description" => {
            if let Some(desc) = arguments.get("description").and_then(|v| v.as_str()) {
                session.draft.description = Some(desc.to_string());
                json!({ "success": true, "message": "Description updated" })
            } else {
                json!({ "success": false, "error": "Missing 'description' argument" })
            }
        }
        "add_scene" => {
            if let Some(content) = arguments.get("content").and_then(|v| v.as_str()) {
                let scene_id = Uuid::new_v4().to_string();
                let direction = arguments
                    .get("direction")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let scene = DraftScene {
                    id: scene_id.clone(),
                    content: content.to_string(),
                    direction,
                };
                session.draft.scenes.push(scene);

                if session.draft.default_scene_id.is_none() {
                    session.draft.default_scene_id = Some(scene_id.clone());
                }

                json!({ "success": true, "scene_id": scene_id, "message": "Scene added" })
            } else {
                json!({ "success": false, "error": "Missing 'content' argument" })
            }
        }
        "update_scene" => {
            let scene_id = arguments.get("scene_id").and_then(|v| v.as_str());
            let content = arguments.get("content").and_then(|v| v.as_str());

            if let (Some(scene_id), Some(content)) = (scene_id, content) {
                if let Some(scene) = session.draft.scenes.iter_mut().find(|s| s.id == scene_id) {
                    scene.content = content.to_string();
                    if let Some(dir) = arguments.get("direction").and_then(|v| v.as_str()) {
                        scene.direction = Some(dir.to_string());
                    }
                    json!({ "success": true, "message": "Scene updated" })
                } else {
                    json!({ "success": false, "error": "Scene not found" })
                }
            } else {
                json!({ "success": false, "error": "Missing required arguments" })
            }
        }
        "toggle_avatar_gradient" => {
            if let Some(enabled) = arguments.get("enabled").and_then(|v| v.as_bool()) {
                session.draft.disable_avatar_gradient = !enabled;
                json!({ "success": true, "message": format!("Avatar gradient {}", if enabled { "enabled" } else { "disabled" }) })
            } else {
                json!({ "success": false, "error": "Missing 'enabled' argument" })
            }
        }
        "set_default_model" => {
            if let Some(model_id) = arguments.get("model_id").and_then(|v| v.as_str()) {
                session.draft.default_model_id = Some(model_id.to_string());
                json!({ "success": true, "message": "Default model set" })
            } else {
                json!({ "success": false, "error": "Missing 'model_id' argument" })
            }
        }
        "set_system_prompt" => {
            if let Some(prompt_id) = arguments.get("prompt_id").and_then(|v| v.as_str()) {
                session.draft.prompt_template_id = Some(prompt_id.to_string());
                json!({ "success": true, "message": "System prompt set" })
            } else {
                json!({ "success": false, "error": "Missing 'prompt_id' argument" })
            }
        }
        "get_system_prompt_list" => match get_system_prompts(app) {
            Ok(prompts) => json!({ "success": true, "prompts": prompts }),
            Err(e) => json!({ "success": false, "error": e }),
        },
        "get_model_list" => match get_models(app) {
            Ok(models) => json!({ "success": true, "models": models }),
            Err(e) => json!({ "success": false, "error": e }),
        },
        "use_uploaded_image_as_avatar" => {
            if let Some(image_id) = arguments.get("image_id").and_then(|v| v.as_str()) {
                match get_uploaded_image(&session.id, image_id) {
                    Ok(Some(_)) => {
                        session.draft.avatar_path = Some(image_id.to_string());
                        json!({ "success": true, "message": "Avatar set from uploaded image" })
                    }
                    Ok(None) => json!({ "success": false, "error": "Image not found" }),
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'image_id' argument" })
            }
        }
        "use_uploaded_image_as_chat_background" => {
            if let Some(image_id) = arguments.get("image_id").and_then(|v| v.as_str()) {
                // Verify image exists but store only the ID
                match get_uploaded_image(&session.id, image_id) {
                    Ok(Some(_)) => {
                        session.draft.background_image_path = Some(image_id.to_string());
                        json!({ "success": true, "message": "Background set from uploaded image" })
                    }
                    Ok(None) => json!({ "success": false, "error": "Image not found" }),
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'image_id' argument" })
            }
        }
        "show_preview" => {
            session.status = CreationStatus::PreviewShown;
            let message = arguments
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Here's your character!");

            json!({
                "success": true,
                "action": "show_preview",
                "message": message,
                "draft": session.draft
            })
        }
        "request_confirmation" => {
            session.status = CreationStatus::PreviewShown;
            let message = arguments
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Are you happy with this character?");

            json!({
                "success": true,
                "action": "request_confirmation",
                "message": message,
                "draft": session.draft
            })
        }
        _ => {
            json!({ "success": false, "error": format!("Unknown tool: {}", tool_name) })
        }
    };

    let success = result
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    CreationToolResult {
        tool_call_id: tool_call_id.to_string(),
        result,
        success,
    }
}

fn get_system_prompts(app: &AppHandle) -> Result<Vec<SystemPromptInfo>, String> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare("SELECT id, name FROM prompt_templates ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let prompt_iter = stmt
        .query_map([], |r| {
            Ok(SystemPromptInfo {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut prompts = Vec::new();
    for prompt in prompt_iter {
        prompts.push(prompt.map_err(|e| e.to_string())?);
    }

    Ok(prompts)
}

fn get_models(app: &AppHandle) -> Result<Vec<ModelInfo>, String> {
    let settings_json = internal_read_settings(app)?;
    if let Some(json_str) = settings_json {
        let settings: Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
        if let Some(models) = settings.get("models").and_then(|v| v.as_array()) {
            let model_infos: Vec<ModelInfo> = models
                .iter()
                .filter_map(|m| {
                    Some(ModelInfo {
                        id: m.get("id")?.as_str()?.to_string(),
                        name: m.get("name")?.as_str()?.to_string(),
                        display_name: m.get("displayName")?.as_str()?.to_string(),
                    })
                })
                .collect();
            return Ok(model_infos);
        }
    }
    Ok(vec![])
}

pub async fn send_message(
    app: AppHandle,
    session_id: String,
    user_message: String,
    uploaded_images: Option<Vec<(String, String, String)>>, // (id, data, mime_type)
) -> Result<CreationSession, String> {
    let now = now_ms() as i64;

    let mut session = {
        let sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| "Session not found".to_string())?
    };

    if let Some(images) = uploaded_images {
        for (id, data, mime_type) in images {
            save_uploaded_image(&session_id, id, data, mime_type)?;
        }
    }

    let user_msg = CreationMessage {
        id: Uuid::new_v4().to_string(),
        role: CreationMessageRole::User,
        content: user_message.clone(),
        tool_calls: vec![],
        tool_results: vec![],
        created_at: now,
    };
    session.messages.push(user_msg);

    // Save state before assistant turn
    session.draft_history.push(session.draft.clone());
    if session.draft_history.len() > 20 {
        session.draft_history.remove(0);
    }

    process_assistant_turn(app, session_id, session).await
}

pub async fn regenerate_response(
    app: AppHandle,
    session_id: String,
) -> Result<CreationSession, String> {
    let mut session = {
        let sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| "Session not found".to_string())?
    };

    // Find last assistant message
    let last_assistant_idx = session
        .messages
        .iter()
        .rposition(|m| m.role == CreationMessageRole::Assistant);

    if let Some(idx) = last_assistant_idx {
        // Remove it
        session.messages.remove(idx);

        // Restore draft state if available
        if let Some(prev_draft) = session.draft_history.pop() {
            session.draft = prev_draft;
        }

        // Save state again before we start the new turn
        session.draft_history.push(session.draft.clone());
        if session.draft_history.len() > 20 {
            session.draft_history.remove(0);
        }

        process_assistant_turn(app, session_id, session).await
    } else {
        Err("No assistant message to regenerate".to_string())
    }
}

async fn process_assistant_turn(
    app: AppHandle,
    session_id: String,
    mut session: CreationSession,
) -> Result<CreationSession, String> {
    let settings_json =
        internal_read_settings(&app)?.ok_or_else(|| "No settings found".to_string())?;
    let settings: Value = serde_json::from_str(&settings_json).map_err(|e| e.to_string())?;

    let model_id = settings
        .get("advancedSettings")
        .and_then(|a| a.get("creationHelperModelId"))
        .and_then(|v| v.as_str())
        .or_else(|| settings.get("defaultModelId").and_then(|v| v.as_str()))
        .ok_or_else(|| "No model configured".to_string())?;

    let models = settings.get("models").and_then(|v| v.as_array());
    let model = models
        .and_then(|m| {
            m.iter()
                .find(|model| model.get("id").and_then(|v| v.as_str()) == Some(model_id))
        })
        .ok_or_else(|| "Model not found".to_string())?;

    let provider_id = model
        .get("providerId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let model_name = model.get("name").and_then(|v| v.as_str()).unwrap_or("");

    let credentials = settings
        .get("providerCredentials")
        .and_then(|v| v.as_array());
    let credential = credentials
        .and_then(|c| {
            c.iter()
                .find(|cred| cred.get("providerId").and_then(|v| v.as_str()) == Some(provider_id))
        })
        .ok_or_else(|| "No credentials found for provider".to_string())?;

    let api_key = credential
        .get("apiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let base_url = credential.get("baseUrl").and_then(|v| v.as_str());

    let provider_label = credential
        .get("label")
        .and_then(|v| v.as_str())
        .unwrap_or(provider_id);

    let mut api_messages = vec![json!({
        "role": "system",
        "content": get_creation_helper_system_prompt()
    })];

    for msg in &session.messages {
        let role = match msg.role {
            CreationMessageRole::User => "user",
            CreationMessageRole::Assistant => "assistant",
            CreationMessageRole::System => "system",
        };

        if msg.role == CreationMessageRole::Assistant && !msg.tool_calls.is_empty() {
            let tool_calls_json: Vec<Value> = msg
                .tool_calls
                .iter()
                .map(|tc| {
                    json!({
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": serde_json::to_string(&tc.arguments).unwrap_or_default()
                        }
                    })
                })
                .collect();

            api_messages.push(json!({
                "role": role,
                "content": if msg.content.is_empty() { Value::Null } else { json!(msg.content) },
                "tool_calls": tool_calls_json
            }));

            for result in &msg.tool_results {
                api_messages.push(json!({
                    "role": "tool",
                    "tool_call_id": result.tool_call_id,
                    "content": serde_json::to_string(&result.result).unwrap_or_default()
                }));
            }
        } else {
            api_messages.push(json!({
                "role": role,
                "content": msg.content
            }));
        }
    }

    let tools = get_creation_helper_tools();
    let tool_config = ToolConfig {
        tools,
        choice: None,
    };

    let cred = crate::chat_manager::types::ProviderCredential {
        id: credential
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        provider_id: provider_id.to_string(),
        label: credential
            .get("label")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        api_key: Some(api_key.to_string()),
        base_url: base_url.map(|s| s.to_string()),
        default_model: None,
        headers: None,
        config: None,
    };

    let built = build_chat_request(
        &cred,
        api_key,
        model_name,
        &api_messages,
        None,               // system_prompt (already in messages)
        0.7,                // temperature
        1.0,                // top_p
        4096,               // max_tokens
        false,              // not streaming for now
        None,               // request_id
        None,               // frequency_penalty
        None,               // presence_penalty
        None,               // top_k
        Some(&tool_config), // tool_config
        false,              // reasoning_enabled
        None,               // reasoning_effort
        None,               // reasoning_budget
    );

    log_info(
        &app,
        "creation_helper",
        format!("Sending request to {} with model {}", built.url, model_name),
    );

    let api_request_payload = ApiRequest {
        url: built.url,
        method: Some("POST".into()),
        headers: Some(built.headers),
        query: None,
        body: Some(built.body),
        timeout_ms: Some(120_000),
        stream: Some(false),
        request_id: None,
        provider_id: Some(provider_id.to_string()),
    };

    let api_response = api_request(app.clone(), api_request_payload).await?;

    if !api_response.ok {
        let full_error = serde_json::to_string_pretty(api_response.data()).unwrap_or_default();
        log_error(
            &app,
            "creation_helper",
            format!("API error response: {}", full_error),
        );
        let err = api_response
            .data()
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("API request failed");
        record_creation_usage(
            &app,
            api_response.data(),
            &session_id,
            model_id,
            model_name,
            provider_id,
            provider_label,
            session.draft.name.as_deref().unwrap_or(""),
            false,
            Some(err.to_string()),
        );
        log_error(&app, "creation_helper", format!("API error: {}", err));
        return Err(err.to_string());
    }

    let response_data = api_response.data();
    record_creation_usage(
        &app,
        response_data,
        &session_id,
        model_id,
        model_name,
        provider_id,
        provider_label,
        session.draft.name.as_deref().unwrap_or(""),
        true,
        None,
    );

    let mut content = response_data
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    let mut tool_calls = parse_tool_calls(provider_id, response_data);

    let mut all_tool_calls = Vec::new();
    let mut all_tool_results = Vec::new();

    let mut iteration = 0;
    const MAX_TOOL_ITERATIONS: i32 = 5;

    while !tool_calls.is_empty() && iteration < MAX_TOOL_ITERATIONS {
        iteration += 1;
        log_info(
            &app,
            "creation_helper",
            format!(
                "Processing {} tool calls (iteration {})",
                tool_calls.len(),
                iteration
            ),
        );

        for tc in &tool_calls {
            let creation_call = CreationToolCall {
                id: tc.id.clone(),
                name: tc.name.clone(),
                arguments: tc.arguments.clone(),
            };
            all_tool_calls.push(creation_call);

            let result = execute_tool(&app, &mut session, &tc.id, &tc.name, &tc.arguments);
            all_tool_results.push(result);
        }

        let tool_calls_json: Vec<Value> = tool_calls
            .iter()
            .map(|tc| {
                json!({
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": serde_json::to_string(&tc.arguments).unwrap_or_default()
                    }
                })
            })
            .collect();

        api_messages.push(json!({
            "role": "assistant",
            "content": if content.is_empty() { Value::Null } else { json!(content) },
            "tool_calls": tool_calls_json
        }));

        for result in &all_tool_results[all_tool_results.len() - tool_calls.len()..] {
            api_messages.push(json!({
                "role": "tool",
                "tool_call_id": result.tool_call_id,
                "content": serde_json::to_string(&result.result).unwrap_or_default()
            }));
        }

        log_info(
            &app,
            "creation_helper",
            format!(
                "Sending follow-up request after tool execution (iteration {})",
                iteration
            ),
        );

        let followup_built = build_chat_request(
            &cred,
            api_key,
            model_name,
            &api_messages,
            None,
            0.7,
            1.0,
            4096,
            false,
            None,
            None,
            None,
            None,
            Some(&tool_config),
            false,
            None,
            None,
        );

        let followup_request = ApiRequest {
            url: followup_built.url,
            method: Some("POST".into()),
            headers: Some(followup_built.headers),
            query: None,
            body: Some(followup_built.body),
            timeout_ms: Some(120_000),
            stream: Some(false),
            request_id: None,
            provider_id: Some(provider_id.to_string()),
        };

        let followup_response = api_request(app.clone(), followup_request).await?;

        if !followup_response.ok {
            let full_error =
                serde_json::to_string_pretty(followup_response.data()).unwrap_or_default();
            log_error(
                &app,
                "creation_helper",
                format!("Follow-up API error: {}", full_error),
            );
            let err = followup_response
                .data()
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("API request failed");
            record_creation_usage(
                &app,
                followup_response.data(),
                &session_id,
                model_id,
                model_name,
                provider_id,
                provider_label,
                session.draft.name.as_deref().unwrap_or(""),
                false,
                Some(err.to_string()),
            );
            return Err(err.to_string());
        }

        let followup_data = followup_response.data();
        record_creation_usage(
            &app,
            followup_data,
            &session_id,
            model_id,
            model_name,
            provider_id,
            provider_label,
            session.draft.name.as_deref().unwrap_or(""),
            true,
            None,
        );

        content = followup_data
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();

        tool_calls = parse_tool_calls(provider_id, followup_data);
    }

    if iteration >= MAX_TOOL_ITERATIONS {
        log_info(
            &app,
            "creation_helper",
            "Max tool iterations reached".to_string(),
        );
    }

    let assistant_msg = CreationMessage {
        id: Uuid::new_v4().to_string(),
        role: CreationMessageRole::Assistant,
        content,
        tool_calls: all_tool_calls,
        tool_results: all_tool_results,
        created_at: now_ms() as i64,
    };
    session.messages.push(assistant_msg);
    session.updated_at = now_ms() as i64;

    {
        let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
        sessions.insert(session_id.clone(), session.clone());
    }

    let _ = app.emit(
        "creation-helper-update",
        json!({
            "sessionId": session_id,
            "draft": session.draft,
            "status": session.status,
        }),
    );

    Ok(session)
}

pub fn get_draft(session_id: &str) -> Result<Option<DraftCharacter>, String> {
    let sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    Ok(sessions.get(session_id).map(|s| s.draft.clone()))
}

pub fn cancel_session(session_id: &str) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get_mut(session_id) {
        session.status = CreationStatus::Cancelled;
    }
    Ok(())
}

pub fn complete_session(session_id: &str) -> Result<DraftCharacter, String> {
    let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get_mut(session_id) {
        session.status = CreationStatus::Completed;
        let mut draft = session.draft.clone();

        // Resolve avatar path if it's an ID (not data URI)
        if let Some(ref path) = draft.avatar_path {
            if !path.starts_with("data:") {
                if let Ok(Some(img)) = get_uploaded_image(session_id, path) {
                    draft.avatar_path = Some(img.data);
                }
            }
        }

        // Resolve background path if it's an ID (not data URI)
        if let Some(ref path) = draft.background_image_path {
            if !path.starts_with("data:") {
                if let Ok(Some(img)) = get_uploaded_image(session_id, path) {
                    draft.background_image_path = Some(img.data);
                }
            }
        }

        return Ok(draft);
    }
    Err("Session not found".to_string())
}

#[allow(dead_code)]
pub fn cleanup_old_sessions(max_age_ms: i64) -> Result<usize, String> {
    let now = now_ms() as i64;
    let mut sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    let mut images = UPLOADED_IMAGES.lock().map_err(|e| e.to_string())?;

    let old_ids: Vec<String> = sessions
        .iter()
        .filter(|(_, s)| now - s.updated_at > max_age_ms)
        .map(|(id, _)| id.clone())
        .collect();

    let count = old_ids.len();
    for id in old_ids {
        sessions.remove(&id);
        images.remove(&id);
    }

    Ok(count)
}

fn record_creation_usage(
    app: &AppHandle,
    response_data: &Value,
    session_id: &str,
    model_id: &str,
    model_name: &str,
    provider_id: &str,
    provider_label: &str,
    character_name: &str,
    success: bool,
    error_message: Option<String>,
) {
    let usage_summary = usage_from_value(response_data);
    let request_id = Uuid::new_v4().to_string();

    let usage = RequestUsage {
        id: request_id,
        timestamp: now_ms() as u64,
        session_id: session_id.to_string(),
        character_id: "creation_helper".to_string(),
        character_name: if character_name.is_empty() {
            "New Character".to_string()
        } else {
            character_name.to_string()
        },
        model_id: model_id.to_string(),
        model_name: model_name.to_string(),
        provider_id: provider_id.to_string(),
        provider_label: provider_label.to_string(),
        operation_type: UsageOperationType::AICreator,
        finish_reason: usage_summary.as_ref().and_then(|u| {
            u.finish_reason
                .as_ref()
                .and_then(|s| UsageFinishReason::from_str(s))
        }),
        prompt_tokens: usage_summary.as_ref().and_then(|u| u.prompt_tokens),
        completion_tokens: usage_summary.as_ref().and_then(|u| u.completion_tokens),
        total_tokens: usage_summary.as_ref().and_then(|u| u.total_tokens),
        memory_tokens: None,
        summary_tokens: None,
        reasoning_tokens: usage_summary.as_ref().and_then(|u| u.reasoning_tokens),
        image_tokens: usage_summary.as_ref().and_then(|u| u.image_tokens),
        cost: None,
        success,
        error_message,
        metadata: HashMap::new(),
    };

    if let Err(e) = add_usage_record(app, usage) {
        log_error(
            app,
            "creation_helper",
            format!("Failed to record usage: {}", e),
        );
    }
}
