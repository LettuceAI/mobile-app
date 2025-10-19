use serde_json::{Map, Value};
use std::collections::HashMap;
use uuid::Uuid;

use super::types::{MessageVariant, ProviderCredential, StoredMessage, UsageSummary};
use crate::providers;

pub fn provider_base_url(cred: &ProviderCredential) -> String {
    providers::resolve_base_url(&cred.provider_id, cred.base_url.as_deref())
}

pub fn chat_completions_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        format!("{}/chat/completions", trimmed)
    } else {
        format!("{}/v1/chat/completions", trimmed)
    }
}

pub fn normalize_headers(cred: &ProviderCredential, api_key: &str) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = HashMap::new();
    out.insert("Authorization".into(), format!("Bearer {}", api_key));
    out.insert("Content-Type".into(), "application/json".into());
    out.insert("Accept".into(), "text/event-stream".into());
    if !out.contains_key("User-Agent") {
        out.insert("User-Agent".into(), "LettuceAI/0.1".into());
    }
    if let Some(extra) = &cred.headers {
        for (k, v) in extra {
            out.insert(k.clone(), v.clone());
        }
    }
    out
}

/// Determines the appropriate system role for the provider
/// Uses centralized config
pub fn system_role_for_provider(cred: &ProviderCredential) -> &'static str {
    providers::get_system_role(&cred.provider_id)
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

pub fn message_text_for_api(message: &StoredMessage) -> String {
    selected_variant(message)
        .map(|variant| variant.content.clone())
        .unwrap_or_else(|| message.content.clone())
}

pub fn extract_text(data: &Value) -> Option<String> {
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

fn join_text_fragments(value: &Value) -> Option<String> {
    let mut buffer = String::new();
    collect_text_fragments(value, &mut buffer);
    if buffer.trim().is_empty() {
        None
    } else {
        Some(buffer)
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
            for key in ["text", "content", "value", "message", "parts"] {
                if let Some(inner) = map.get(key) {
                    handled = true;
                    collect_text_fragments(inner, acc);
                }
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

pub fn extract_usage(data: &Value) -> Option<UsageSummary> {
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

fn usage_from_map(map: &Map<String, Value>) -> Option<UsageSummary> {
    fn take_first(map: &Map<String, Value>, keys: &[&str]) -> Option<u64> {
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

fn parse_token_value(value: &Value) -> Option<u64> {
    match value {
        Value::Number(num) => num.as_u64(),
        Value::String(text) => text.trim().parse::<u64>().ok(),
        _ => None,
    }
}

pub fn extract_error_message(data: &Value) -> Option<String> {
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

pub fn ensure_assistant_variant(message: &mut StoredMessage) {
    if message.variants.is_empty() {
        let id = Uuid::new_v4().to_string();
        message.variants.push(MessageVariant {
            id: id.clone(),
            content: message.content.clone(),
            created_at: message.created_at,
            usage: message.usage.clone(),
        });
        message.selected_variant_id = Some(id);
    } else if message.selected_variant_id.is_none() {
        if let Some(last) = message.variants.last() {
            message.selected_variant_id = Some(last.id.clone());
        }
    }
}

pub fn new_assistant_variant(
    content: String,
    usage: Option<UsageSummary>,
    created_at: u64,
) -> MessageVariant {
    MessageVariant {
        id: Uuid::new_v4().to_string(),
        content,
        created_at,
        usage,
    }
}
