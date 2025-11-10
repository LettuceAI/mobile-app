use serde_json::Value;

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

/// Pushes a user/assistant message to the API list, skipping scene messages, and performs
/// minimal placeholder replacements ({{char}} and {{persona}}) based on provided names.
pub fn push_user_or_assistant_message_with_context(
    target: &mut Vec<Value>,
    message: &super::types::StoredMessage,
    char_name: &str,
    persona_name: &str,
) {
    if message.role == "scene" {
        return;
    }

    let content = super::request::message_text_for_api(message)
        .replace("{{char}}", char_name)
        .replace("{{persona}}", persona_name);

    target.push(serde_json::json!({
        "role": message.role,
        "content": content
    }));
}

/// Final safety pass: replace simple placeholders in already-built API messages.
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
                }
            }
        }
    }
}
