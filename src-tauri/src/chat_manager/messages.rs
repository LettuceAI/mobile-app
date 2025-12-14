use serde_json::{json, Value};

use super::types::ImageAttachment;

/// Pushes a system message to the API message list if present.
/// Uses the provider-specific system role.
pub fn push_system_message(
    target: &mut Vec<Value>,
    system_role: &str,
    system_prompt: Option<String>,
) {
    if let Some(system) = system_prompt {
        target.push(serde_json::json!({ "role": system_role, "content": system }));
    }
}

pub fn build_multimodal_content(text: &str, attachments: &[ImageAttachment]) -> Value {
    let mut content_parts: Vec<Value> = Vec::new();

    if !text.is_empty() {
        content_parts.push(json!({
            "type": "text",
            "text": text
        }));
    }

    for attachment in attachments {
        if attachment.data.is_empty() {
            continue;
        }

        let image_url = if attachment.data.starts_with("http://")
            || attachment.data.starts_with("https://")
            || attachment.data.starts_with("data:")
        {
            attachment.data.clone()
        } else {
            format!("data:{};base64,{}", attachment.mime_type, attachment.data)
        };

        content_parts.push(json!({
            "type": "image_url",
            "image_url": {
                "url": image_url,
                "detail": "auto"
            }
        }));
    }

    if content_parts.is_empty() {
        content_parts.push(json!({
            "type": "text",
            "text": " "
        }));
    }

    Value::Array(content_parts)
}

/// Pushes a user/assistant message to the API list, skipping scene messages, and performs
/// minimal placeholder replacements ({{char}} and {{persona}}) based on provided names.
pub fn push_user_or_assistant_message_with_context(
    target: &mut Vec<Value>,
    message: &super::types::StoredMessage,
    char_name: &str,
    persona_name: &str,
    allow_image_input: bool,
) {
    if message.role == "scene" {
        return;
    }

    let text = super::request::message_text_for_api(message)
        .replace("{{char}}", char_name)
        .replace("{{persona}}", persona_name);

    if allow_image_input && !message.attachments.is_empty() && message.role == "user" {
        let content = build_multimodal_content(&text, &message.attachments);
        target.push(json!({
            "role": message.role,
            "content": content
        }));
    } else {
        target.push(json!({
            "role": message.role,
            "content": text
        }));
    }
}

pub fn sanitize_placeholders_in_api_messages(
    messages: &mut Vec<serde_json::Value>,
    char_name: &str,
    persona_name: &str,
) {
    for msg in messages.iter_mut() {
        if let Some(obj) = msg.as_object_mut() {
            if let Some(content) = obj.get_mut("content") {
                if let Some(s) = content.as_str() {
                    let updated = s
                        .replace("{{char}}", char_name)
                        .replace("{{persona}}", persona_name);
                    *content = serde_json::Value::String(updated);
                } else if let Some(arr) = content.as_array_mut() {
                    for part in arr.iter_mut() {
                        if let Some(part_obj) = part.as_object_mut() {
                            if part_obj.get("type").and_then(|t| t.as_str()) == Some("text") {
                                if let Some(text) = part_obj.get_mut("text") {
                                    if let Some(s) = text.as_str() {
                                        let updated = s
                                            .replace("{{char}}", char_name)
                                            .replace("{{persona}}", persona_name);
                                        *text = Value::String(updated);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
