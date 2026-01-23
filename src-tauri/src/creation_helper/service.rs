use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use super::tools::{get_creation_helper_system_prompt, get_creation_helper_tools};
use super::types::*;
use crate::abort_manager::AbortRegistry;
use crate::api::{api_request, ApiRequest};
use crate::chat_manager::request as chat_request;
use crate::chat_manager::request_builder::build_chat_request;
use crate::chat_manager::sse::accumulate_tool_calls_from_sse;
use crate::chat_manager::tooling::{parse_tool_calls, ToolConfig};
use crate::image_generator::commands::generate_image;
use crate::image_generator::types::ImageGenerationRequest;
use crate::storage_manager::db::{now_ms, open_db};
use crate::storage_manager::lorebook as lorebook_storage;
use crate::storage_manager::personas as personas_storage;
use crate::storage_manager::settings::internal_read_settings;
use crate::usage::{
    add_usage_record,
    tracking::{RequestUsage, UsageFinishReason, UsageOperationType},
};
use crate::utils::{log_error, log_info, log_warn};

lazy_static::lazy_static! {
    static ref SESSIONS: Mutex<HashMap<String, CreationSession>> = Mutex::new(HashMap::new());
    static ref UPLOADED_IMAGES: Mutex<HashMap<String, HashMap<String, UploadedImage>>> = Mutex::new(HashMap::new());
}

pub fn start_session(creation_goal: CreationGoal) -> Result<CreationSession, String> {
    let now = now_ms() as i64;
    let session_id = Uuid::new_v4().to_string();

    let session = CreationSession {
        id: session_id.clone(),
        messages: vec![],
        draft: DraftCharacter::default(),
        draft_history: vec![],
        creation_goal,
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

async fn execute_tool(
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
        "set_character_definition" | "set_character_description" => {
            let value = arguments
                .get("definition")
                .or_else(|| arguments.get("description"))
                .and_then(|v| v.as_str());
            if let Some(def) = value {
                session.draft.definition = Some(def.to_string());
                json!({ "success": true, "message": "Definition updated" })
            } else {
                json!({ "success": false, "error": "Missing 'definition' argument" })
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
        "generate_image" => {
            let prompt = arguments.get("prompt").and_then(|v| v.as_str());
            if let Some(prompt) = prompt {
                match build_image_request(app, prompt, arguments) {
                    Ok(request) => match generate_image(app.clone(), request).await {
                        Ok(response) => {
                            if let Some(image) = response.images.first() {
                                match fs::read(&image.file_path) {
                                    Ok(bytes) => {
                                        let encoded = general_purpose::STANDARD.encode(bytes);
                                        let data_url = format!("data:image/png;base64,{}", encoded);
                                        let image_id = short_image_id();
                                        if let Err(err) = save_uploaded_image(
                                            &session.id,
                                            image_id.clone(),
                                            data_url,
                                            "image/png".to_string(),
                                        ) {
                                            json!({ "success": false, "error": err })
                                        } else {
                                            json!({
                                                "success": true,
                                                "image_id": image_id,
                                                "message": "Image generated"
                                            })
                                        }
                                    }
                                    Err(err) => {
                                        json!({ "success": false, "error": err.to_string() })
                                    }
                                }
                            } else {
                                json!({ "success": false, "error": "No image returned" })
                            }
                        }
                        Err(err) => json!({ "success": false, "error": err }),
                    },
                    Err(err) => json!({ "success": false, "error": err }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'prompt' argument" })
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
        "list_personas" => match personas_storage::personas_list(app.clone()) {
            Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                Ok(personas) => json!({ "success": true, "personas": personas }),
                Err(e) => json!({ "success": false, "error": e.to_string() }),
            },
            Err(e) => json!({ "success": false, "error": e }),
        },
        "upsert_persona" => {
            let title = arguments.get("title").and_then(|v| v.as_str());
            let description = arguments.get("description").and_then(|v| v.as_str());
            if let (Some(title), Some(description)) = (title, description) {
                let now = now_ms() as i64;
                let persona_json = json!({
                    "id": arguments.get("id").and_then(|v| v.as_str()),
                    "title": title,
                    "description": description,
                    "avatarPath": arguments.get("avatar_path").and_then(|v| v.as_str()),
                    "isDefault": arguments.get("is_default").and_then(|v| v.as_bool()).unwrap_or(false),
                    "createdAt": now,
                    "updatedAt": now,
                });
                match personas_storage::persona_upsert(app.clone(), persona_json.to_string()) {
                    Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                        Ok(persona) => json!({ "success": true, "persona": persona }),
                        Err(e) => json!({ "success": false, "error": e.to_string() }),
                    },
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing required persona fields" })
            }
        }
        "delete_persona" => {
            if let Some(id) = arguments.get("id").and_then(|v| v.as_str()) {
                match personas_storage::persona_delete(app.clone(), id.to_string()) {
                    Ok(()) => json!({ "success": true }),
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'id' argument" })
            }
        }
        "get_default_persona" => match personas_storage::persona_default_get(app.clone()) {
            Ok(Some(raw)) => match serde_json::from_str::<Value>(&raw) {
                Ok(persona) => json!({ "success": true, "persona": persona }),
                Err(e) => json!({ "success": false, "error": e.to_string() }),
            },
            Ok(None) => json!({ "success": true, "persona": Value::Null }),
            Err(e) => json!({ "success": false, "error": e }),
        },
        "use_uploaded_image_as_persona_avatar" => {
            let persona_id = arguments.get("persona_id").and_then(|v| v.as_str());
            let image_id = arguments.get("image_id").and_then(|v| v.as_str());
            if let (Some(persona_id), Some(image_id)) = (persona_id, image_id) {
                match get_uploaded_image(&session.id, image_id) {
                    Ok(Some(image)) => match personas_storage::personas_list(app.clone()) {
                        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                            Ok(Value::Array(personas)) => {
                                if let Some(persona) = personas.iter().find_map(|p| {
                                    let id = p.get("id")?.as_str()?;
                                    if id != persona_id {
                                        return None;
                                    }
                                    Some(p)
                                }) {
                                    let title = persona.get("title").and_then(|v| v.as_str());
                                    let description =
                                        persona.get("description").and_then(|v| v.as_str());
                                    let is_default =
                                        persona.get("isDefault").and_then(|v| v.as_bool());
                                    if let (Some(title), Some(description)) = (title, description) {
                                        let persona_json = json!({
                                            "id": persona_id,
                                            "title": title,
                                            "description": description,
                                            "avatarPath": image.data,
                                            "isDefault": is_default.unwrap_or(false),
                                        });
                                        match personas_storage::persona_upsert(
                                            app.clone(),
                                            persona_json.to_string(),
                                        ) {
                                            Ok(updated) => {
                                                match serde_json::from_str::<Value>(&updated) {
                                                    Ok(persona) => {
                                                        json!({ "success": true, "persona": persona })
                                                    }
                                                    Err(e) => {
                                                        json!({ "success": false, "error": e.to_string() })
                                                    }
                                                }
                                            }
                                            Err(e) => json!({ "success": false, "error": e }),
                                        }
                                    } else {
                                        json!({ "success": false, "error": "Persona missing title or description" })
                                    }
                                } else {
                                    json!({ "success": false, "error": "Persona not found" })
                                }
                            }
                            Ok(_) => {
                                json!({ "success": false, "error": "Unexpected persona list format" })
                            }
                            Err(e) => json!({ "success": false, "error": e.to_string() }),
                        },
                        Err(e) => json!({ "success": false, "error": e }),
                    },
                    Ok(None) => json!({ "success": false, "error": "Image not found" }),
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'persona_id' or 'image_id' argument" })
            }
        }
        "list_lorebooks" => match lorebook_storage::lorebooks_list(app.clone()) {
            Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                Ok(lorebooks) => json!({ "success": true, "lorebooks": lorebooks }),
                Err(e) => json!({ "success": false, "error": e.to_string() }),
            },
            Err(e) => json!({ "success": false, "error": e }),
        },
        "upsert_lorebook" => {
            if let Some(name) = arguments.get("name").and_then(|v| v.as_str()) {
                let now = now_ms() as i64;
                let lorebook_id = arguments
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| Uuid::new_v4().to_string());
                let lorebook_json = json!({
                    "id": lorebook_id,
                    "name": name,
                    "createdAt": now,
                    "updatedAt": now,
                });
                match lorebook_storage::lorebook_upsert(app.clone(), lorebook_json.to_string()) {
                    Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                        Ok(lorebook) => json!({ "success": true, "lorebook": lorebook }),
                        Err(e) => json!({ "success": false, "error": e.to_string() }),
                    },
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'name' argument" })
            }
        }
        "delete_lorebook" => {
            if let Some(id) = arguments.get("lorebook_id").and_then(|v| v.as_str()) {
                match lorebook_storage::lorebook_delete(app.clone(), id.to_string()) {
                    Ok(()) => json!({ "success": true }),
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'lorebook_id' argument" })
            }
        }
        "list_lorebook_entries" => {
            if let Some(id) = arguments.get("lorebook_id").and_then(|v| v.as_str()) {
                match lorebook_storage::lorebook_entries_list(app.clone(), id.to_string()) {
                    Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                        Ok(entries) => json!({ "success": true, "entries": entries }),
                        Err(e) => json!({ "success": false, "error": e.to_string() }),
                    },
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'lorebook_id' argument" })
            }
        }
        "get_lorebook_entry" => {
            if let Some(id) = arguments.get("entry_id").and_then(|v| v.as_str()) {
                match lorebook_storage::lorebook_entry_get(app.clone(), id.to_string()) {
                    Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                        Ok(entry) => json!({ "success": true, "entry": entry }),
                        Err(e) => json!({ "success": false, "error": e.to_string() }),
                    },
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'entry_id' argument" })
            }
        }
        "upsert_lorebook_entry" => {
            let lorebook_id = arguments.get("lorebook_id").and_then(|v| v.as_str());
            let title = arguments.get("title").and_then(|v| v.as_str());
            let content = arguments.get("content").and_then(|v| v.as_str());
            if let (Some(lorebook_id), Some(title), Some(content)) = (lorebook_id, title, content) {
                let now = now_ms() as i64;
                let entry_id = arguments
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| Uuid::new_v4().to_string());
                let keywords: Vec<String> = arguments
                    .get("keywords")
                    .and_then(|v| v.as_array())
                    .map(|values| {
                        values
                            .iter()
                            .filter_map(|value| value.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();
                let entry_json = json!({
                    "id": entry_id,
                    "lorebookId": lorebook_id,
                    "title": title,
                    "enabled": arguments.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
                    "alwaysActive": arguments.get("always_active").and_then(|v| v.as_bool()).unwrap_or(false),
                    "keywords": keywords,
                    "caseSensitive": arguments.get("case_sensitive").and_then(|v| v.as_bool()).unwrap_or(false),
                    "content": content,
                    "priority": arguments.get("priority").and_then(|v| v.as_i64()).unwrap_or(0),
                    "displayOrder": arguments.get("display_order").and_then(|v| v.as_i64()).unwrap_or(0),
                    "createdAt": now,
                    "updatedAt": now,
                });
                match lorebook_storage::lorebook_entry_upsert(app.clone(), entry_json.to_string()) {
                    Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                        Ok(entry) => json!({ "success": true, "entry": entry }),
                        Err(e) => json!({ "success": false, "error": e.to_string() }),
                    },
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing required lorebook entry fields" })
            }
        }
        "delete_lorebook_entry" => {
            if let Some(id) = arguments.get("entry_id").and_then(|v| v.as_str()) {
                match lorebook_storage::lorebook_entry_delete(app.clone(), id.to_string()) {
                    Ok(()) => json!({ "success": true }),
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'entry_id' argument" })
            }
        }
        "create_blank_lorebook_entry" => {
            if let Some(id) = arguments.get("lorebook_id").and_then(|v| v.as_str()) {
                match lorebook_storage::lorebook_entry_create_blank(app.clone(), id.to_string()) {
                    Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                        Ok(entry) => json!({ "success": true, "entry": entry }),
                        Err(e) => json!({ "success": false, "error": e.to_string() }),
                    },
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'lorebook_id' argument" })
            }
        }
        "reorder_lorebook_entries" => {
            if let Some(updates) = arguments.get("updates").and_then(|v| v.as_array()) {
                let mapped: Vec<(String, i32)> = updates
                    .iter()
                    .filter_map(|entry| {
                        let entry_id = entry.get("entry_id").and_then(|v| v.as_str())?;
                        let display_order = entry.get("display_order").and_then(|v| v.as_i64())?;
                        Some((entry_id.to_string(), display_order as i32))
                    })
                    .collect();
                match lorebook_storage::lorebook_entries_reorder(
                    app.clone(),
                    serde_json::to_string(&mapped).unwrap_or_default(),
                ) {
                    Ok(()) => json!({ "success": true }),
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'updates' argument" })
            }
        }
        "list_character_lorebooks" => {
            if let Some(id) = arguments.get("character_id").and_then(|v| v.as_str()) {
                match lorebook_storage::character_lorebooks_list(app.clone(), id.to_string()) {
                    Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                        Ok(lorebooks) => json!({ "success": true, "lorebooks": lorebooks }),
                        Err(e) => json!({ "success": false, "error": e.to_string() }),
                    },
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing 'character_id' argument" })
            }
        }
        "set_character_lorebooks" => {
            let character_id = arguments.get("character_id").and_then(|v| v.as_str());
            let lorebook_ids = arguments.get("lorebook_ids").and_then(|v| v.as_array());
            if let (Some(character_id), Some(lorebook_ids)) = (character_id, lorebook_ids) {
                let ids: Vec<String> = lorebook_ids
                    .iter()
                    .filter_map(|v| v.as_str().map(|id| id.to_string()))
                    .collect();
                match lorebook_storage::character_lorebooks_set(
                    app.clone(),
                    character_id.to_string(),
                    serde_json::to_string(&ids).unwrap_or_default(),
                ) {
                    Ok(()) => json!({ "success": true }),
                    Err(e) => json!({ "success": false, "error": e }),
                }
            } else {
                json!({ "success": false, "error": "Missing character or lorebook IDs" })
            }
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

fn short_image_id() -> String {
    let compact = Uuid::new_v4().to_string().replace('-', "");
    compact.chars().take(8).collect()
}

fn build_image_request(
    app: &AppHandle,
    prompt: &str,
    arguments: &Value,
) -> Result<ImageGenerationRequest, String> {
    let settings_json =
        internal_read_settings(app)?.ok_or_else(|| "No settings found".to_string())?;
    let settings: Value = serde_json::from_str(&settings_json).map_err(|e| e.to_string())?;
    let advanced = settings.get("advancedSettings");
    let image_model_id = advanced
        .and_then(|a| a.get("creationHelperImageModelId"))
        .and_then(|v| v.as_str());

    let models = settings
        .get("models")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No models configured".to_string())?;

    let image_models: Vec<&Value> = models
        .iter()
        .filter(|model| {
            model
                .get("outputScopes")
                .and_then(|v| v.as_array())
                .map(|scopes| scopes.iter().any(|s| s.as_str() == Some("image")))
                .unwrap_or(false)
        })
        .collect();

    let model = if let Some(id) = image_model_id {
        image_models
            .iter()
            .find(|m| m.get("id").and_then(|v| v.as_str()) == Some(id))
            .copied()
    } else {
        image_models.first().copied()
    }
    .ok_or_else(|| "No image generation model configured".to_string())?;

    let model_name = model
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Image model name missing".to_string())?;
    let provider_id = model
        .get("providerId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Image model provider missing".to_string())?;
    let provider_label = model.get("providerLabel").and_then(|v| v.as_str());

    let credentials = settings
        .get("providerCredentials")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "No provider credentials configured".to_string())?;
    let credential = credentials
        .iter()
        .find(|cred| {
            let matches_label = provider_label
                .map(|label| cred.get("label").and_then(|v| v.as_str()) == Some(label))
                .unwrap_or(true);
            cred.get("providerId").and_then(|v| v.as_str()) == Some(provider_id) && matches_label
        })
        .or_else(|| {
            credentials
                .iter()
                .find(|cred| cred.get("providerId").and_then(|v| v.as_str()) == Some(provider_id))
        })
        .ok_or_else(|| "No credentials found for image model provider".to_string())?;

    let credential_id = credential
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Credential ID missing".to_string())?;

    Ok(ImageGenerationRequest {
        prompt: prompt.to_string(),
        model: model_name.to_string(),
        provider_id: provider_id.to_string(),
        credential_id: credential_id.to_string(),
        size: arguments
            .get("size")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| Some("1024x1024".to_string())),
        quality: arguments
            .get("quality")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        style: arguments
            .get("style")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        n: Some(1),
    })
}

pub async fn send_message(
    app: AppHandle,
    session_id: String,
    user_message: String,
    uploaded_images: Option<Vec<(String, String, String)>>, // (id, data, mime_type)
    request_id: Option<String>,
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

    process_assistant_turn(app, session_id, session, request_id).await
}

pub async fn regenerate_response(
    app: AppHandle,
    session_id: String,
    request_id: Option<String>,
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

        process_assistant_turn(app, session_id, session, request_id).await
    } else {
        Err("No assistant message to regenerate".to_string())
    }
}

async fn process_assistant_turn(
    app: AppHandle,
    session_id: String,
    mut session: CreationSession,
    request_id: Option<String>,
) -> Result<CreationSession, String> {
    let settings_json =
        internal_read_settings(&app)?.ok_or_else(|| "No settings found".to_string())?;
    let settings: Value = serde_json::from_str(&settings_json).map_err(|e| e.to_string())?;

    let advanced_settings = settings.get("advancedSettings");

    let model_id = advanced_settings
        .and_then(|a| a.get("creationHelperModelId"))
        .and_then(|v| v.as_str())
        .or_else(|| settings.get("defaultModelId").and_then(|v| v.as_str()))
        .ok_or_else(|| "No model configured".to_string())?;

    let streaming_enabled = advanced_settings
        .and_then(|a| a.get("creationHelperStreaming"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let stream_request_id =
        request_id.unwrap_or_else(|| format!("creation-helper-{}-{}", session_id, Uuid::new_v4()));

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

    let smart_tool_selection = advanced_settings
        .and_then(|a| a.get("creationHelperSmartToolSelection"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let enabled_tools: Option<Vec<String>> = advanced_settings
        .and_then(|a| a.get("creationHelperEnabledTools"))
        .and_then(|v| v.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        });

    let mut api_messages = vec![json!({
        "role": "system",
        "content": get_creation_helper_system_prompt(&session.creation_goal, smart_tool_selection)
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

    let tools = get_creation_helper_tools(&session.creation_goal, smart_tool_selection);
    let tools = if let Some(enabled_tools) = enabled_tools {
        tools
            .into_iter()
            .filter(|tool| enabled_tools.contains(&tool.name))
            .collect()
    } else {
        tools
    };
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

    log_info(
        &app,
        "creation_helper",
        format!("Streaming enabled: {}", streaming_enabled),
    );

    let built = build_chat_request(
        &cred,
        api_key,
        model_name,
        &api_messages,
        None,              // system_prompt (already in messages)
        0.7,               // temperature
        1.0,               // top_p
        20480,             // max_tokens
        streaming_enabled, // streaming based on settings
        if streaming_enabled {
            Some(stream_request_id.clone())
        } else {
            None
        },
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
        stream: Some(streaming_enabled),
        request_id: if streaming_enabled {
            Some(stream_request_id.clone())
        } else {
            None
        },
        provider_id: Some(provider_id.to_string()),
    };

    // Register this request for abort capability
    let mut abort_rx = {
        let registry = app.state::<AbortRegistry>();
        registry.register(session_id.clone())
    };

    let api_response = tokio::select! {
        _ = &mut abort_rx => {
             log_warn(
                &app,
                "creation_helper",
                format!("[creation_helper] request aborted by user for session {}", session_id),
            );
            return Err("Request aborted by user".to_string());
        }
        res = api_request(app.clone(), api_request_payload) => res?
    };

    // Unregister after completion
    {
        let registry = app.state::<AbortRegistry>();
        registry.unregister(&session_id);
    }

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

    let mut content =
        chat_request::extract_text(response_data, Some(provider_id)).unwrap_or_default();
    let mut tool_calls = if response_data.is_string() {
        accumulate_tool_calls_from_sse(response_data.as_str().unwrap(), provider_id)
    } else {
        parse_tool_calls(provider_id, response_data)
    };

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

            let result = execute_tool(&app, &mut session, &tc.id, &tc.name, &tc.arguments).await;
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
            20480,
            streaming_enabled,
            if streaming_enabled {
                Some(stream_request_id.clone())
            } else {
                None
            },
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
            stream: Some(streaming_enabled),
            request_id: if streaming_enabled {
                Some(stream_request_id.clone())
            } else {
                None
            },
            provider_id: Some(provider_id.to_string()),
        };

        // Register this request for abort capability
        let mut abort_rx = {
            let registry = app.state::<AbortRegistry>();
            registry.register(session_id.clone())
        };

        let followup_response = tokio::select! {
            _ = &mut abort_rx => {
                 log_warn(
                    &app,
                    "creation_helper",
                    format!("[creation_helper] follow-up request aborted by user for session {}", session_id),
                );
                return Err("Request aborted by user".to_string());
            }
            res = api_request(app.clone(), followup_request) => res?
        };

        // Unregister after completion
        {
            let registry = app.state::<AbortRegistry>();
            registry.unregister(&session_id);
        }

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

        let new_content =
            chat_request::extract_text(followup_data, Some(provider_id)).unwrap_or_default();
        if !new_content.is_empty() {
            if !content.is_empty() {
                if streaming_enabled {
                    crate::transport::emit_normalized(
                        &app,
                        &stream_request_id,
                        crate::chat_manager::types::NormalizedEvent::Delta {
                            text: "\n\n".to_string(),
                        },
                    );
                }
                content.push_str("\n\n");
            }
            content.push_str(&new_content);
        }
        tool_calls = if followup_data.is_string() {
            accumulate_tool_calls_from_sse(followup_data.as_str().unwrap(), provider_id)
        } else {
            parse_tool_calls(provider_id, followup_data)
        };
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
            "messages": session.messages,
        }),
    );

    Ok(session)
}

pub fn get_draft(session_id: &str) -> Result<Option<DraftCharacter>, String> {
    let sessions = SESSIONS.lock().map_err(|e| e.to_string())?;
    Ok(sessions.get(session_id).map(|s| s.draft.clone()))
}

pub fn cancel_session(app: &AppHandle, session_id: &str) -> Result<(), String> {
    // First, abort any ongoing request via the AbortRegistry
    let registry = app.state::<AbortRegistry>();
    match registry.abort(session_id) {
        Ok(_) => log_info(
            app,
            "creation_helper",
            format!("Aborted request for session {}", session_id),
        ),
        Err(e) => log_warn(
            app,
            "creation_helper",
            format!(
                "No active request to abort for session {}: {}",
                session_id, e
            ),
        ),
    }

    // Then update the session status
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
    let usage_summary = chat_request::extract_usage(response_data);
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
