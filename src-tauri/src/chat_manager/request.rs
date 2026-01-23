use serde_json::{Map, Value};
use uuid::Uuid;

use super::types::{MessageVariant, ProviderCredential, StoredMessage, UsageSummary};
use crate::chat_manager::types::ProviderId;
use crate::providers;

pub fn provider_base_url(cred: &ProviderCredential) -> String {
    providers::resolve_base_url(
        &ProviderId(cred.provider_id.clone()),
        cred.base_url.as_deref(),
    )
}

// chat_completions_endpoint removed; endpoint selection is centralized in request_builder/provider_adapter.

// headers are constructed by provider adapters now

// system role resolution moved to provider adapters via request_builder::system_role_for

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

/// Extract reasoning tokens from API response (for thinking models)
/// Returns None if no reasoning was found
pub fn extract_reasoning(data: &Value, provider_id: Option<&str>) -> Option<String> {
    match data {
        Value::String(s) => {
            if s.contains("data:") {
                return super::sse::accumulate_reasoning_from_sse(s, provider_id);
            }
            None
        }
        Value::Object(map) => {
            // Check choices[0].message.reasoning or reasoning_content for non-streaming responses
            if let Some(choices) = map.get("choices").and_then(|c| c.as_array()) {
                if let Some(first) = choices.first() {
                    // Try reasoning field first
                    if let Some(reasoning) = first
                        .get("message")
                        .and_then(|m| m.get("reasoning"))
                        .and_then(|r| r.as_str())
                    {
                        if !reasoning.is_empty() {
                            return Some(reasoning.to_string());
                        }
                    }
                    // Try reasoning_content field (used by some models like ZhipuAI GLM)
                    if let Some(reasoning) = first
                        .get("message")
                        .and_then(|m| m.get("reasoning_content"))
                        .and_then(|r| r.as_str())
                    {
                        if !reasoning.is_empty() {
                            return Some(reasoning.to_string());
                        }
                    }
                }
            }
            None
        }
        _ => None,
    }
}

pub fn extract_text(data: &Value, provider_id: Option<&str>) -> Option<String> {
    match data {
        Value::String(s) => {
            if s.contains("data:") {
                return Some(
                    super::sse::accumulate_text_from_sse(s, provider_id).unwrap_or_default(),
                );
            }
            Some(s.clone())
        }
        Value::Array(items) => {
            let mut combined = String::new();
            for item in items {
                if let Some(part) = extract_text(item, provider_id) {
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
        Value::String(s) => {
            if s.starts_with("data:image/") {
                return;
            }
            acc.push_str(s);
        }
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
            if let Some(summary) = super::sse::usage_from_sse(raw) {
                return Some(summary);
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
    let reasoning_tokens = take_first(
        map,
        &[
            "reasoning_tokens",
            "reasoningTokens",
            "thinking_tokens",
            "thinkingTokens",
        ],
    )
    .or_else(|| {
        // Some providers nest reasoning tokens in completion_tokens_details
        map.get("completion_tokens_details")
            .and_then(|v| v.as_object())
            .and_then(|details| take_first(details, &["reasoning_tokens", "reasoningTokens"]))
    });
    let image_tokens = take_first(map, &["image_tokens", "imageTokens"]).or_else(|| {
        // Some providers nest image tokens in prompt_tokens_details or completion_tokens_details
        map.get("prompt_tokens_details")
            .and_then(|v| v.as_object())
            .and_then(|details| {
                take_first(details, &["image_tokens", "imageTokens", "cached_tokens"])
            })
            .or_else(|| {
                map.get("completion_tokens_details")
                    .and_then(|v| v.as_object())
                    .and_then(|details| take_first(details, &["image_tokens", "imageTokens"]))
            })
    });
    let total_tokens = take_first(map, &["total_tokens", "totalTokens"]).or_else(|| {
        match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        }
    });

    let finish_reason = map
        .get("finish_reason")
        .or_else(|| map.get("finishReason"))
        .and_then(|r| r.as_str())
        .map(|s| s.to_string());

    if prompt_tokens.is_none() && completion_tokens.is_none() && total_tokens.is_none() {
        None
    } else {
        Some(UsageSummary {
            prompt_tokens,
            completion_tokens,
            total_tokens,
            reasoning_tokens,
            image_tokens,
            finish_reason,
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
            if let Some(prompt_feedback) = map.get("promptFeedback") {
                if let Some(block_reason) =
                    prompt_feedback.get("blockReason").and_then(|v| v.as_str())
                {
                    return Some(format_gemini_block_reason(block_reason));
                }
            }
            if let Some(candidates) = map.get("candidates").and_then(|c| c.as_array()) {
                for candidate in candidates {
                    if let Some(finish_reason) =
                        candidate.get("finishReason").and_then(|v| v.as_str())
                    {
                        if let Some(msg) = format_gemini_finish_reason_error(finish_reason) {
                            return Some(msg);
                        }
                    }
                }
            }
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

fn format_gemini_block_reason(reason: &str) -> String {
    match reason {
        "BLOCK_REASON_UNSPECIFIED" => {
            "Content was blocked by Gemini for an unspecified reason.".to_string()
        }
        "SAFETY" => {
            "Content was blocked by Gemini safety filters. Try adjusting your prompt or safety settings.".to_string()
        }
        "OTHER" => "Content was blocked by Gemini for an uncategorized reason.".to_string(),
        "BLOCKLIST" => {
            "Content was blocked: the prompt contains terms from the blocklist.".to_string()
        }
        "PROHIBITED_CONTENT" => {
            "Content was blocked by Gemini: prohibited content detected (e.g., CSAM or policy violation).".to_string()
        }
        "IMAGE_SAFETY" => {
            "Content was blocked by Gemini: the image failed safety checks.".to_string()
        }
        _ => format!(
            "Content was blocked by Gemini: {}",
            reason.replace('_', " ").to_lowercase()
        ),
    }
}

fn format_gemini_finish_reason_error(reason: &str) -> Option<String> {
    match reason {
        "STOP" | "MAX_TOKENS" | "FINISH_REASON_UNSPECIFIED" => None,
        // Error finish reasons
        "SAFETY" => Some("Response was blocked by Gemini safety filters.".to_string()),
        "RECITATION" => Some(
            "Response was blocked due to recitation concerns (potential copyright issues)."
                .to_string(),
        ),
        "LANGUAGE" => Some("Response was blocked: unsupported language detected.".to_string()),
        "OTHER" => Some("Response was blocked by Gemini for an uncategorized reason.".to_string()),
        "BLOCKLIST" => {
            Some("Response was blocked: output contains terms from the blocklist.".to_string())
        }
        "PROHIBITED_CONTENT" => {
            Some("Response was blocked: prohibited content detected.".to_string())
        }
        "SPII" => Some(
            "Response was blocked: sensitive personally identifiable information (SPII) detected."
                .to_string(),
        ),
        "MALFORMED_FUNCTION_CALL" => {
            Some("Response generation failed: malformed function call.".to_string())
        }
        "IMAGE_SAFETY" => Some("Image generation was blocked by safety filters.".to_string()),
        "IMAGE_PROHIBITED_CONTENT" => {
            Some("Image generation was blocked: prohibited content detected.".to_string())
        }
        "IMAGE_OTHER" => {
            Some("Image generation was blocked for an uncategorized reason.".to_string())
        }
        "NO_IMAGE" => Some("Image generation failed: no image was produced.".to_string()),
        "IMAGE_RECITATION" => {
            Some("Image generation was blocked due to recitation concerns.".to_string())
        }
        "UNEXPECTED_TOOL_CALL" => {
            Some("Response generation failed: unexpected tool call.".to_string())
        }
        "TOO_MANY_TOOL_CALLS" => {
            Some("Response generation failed: too many tool calls.".to_string())
        }
        "MISSING_THOUGHT_SIGNATURE" => {
            Some("Response generation failed: missing thought signature.".to_string())
        }
        _ => Some(format!(
            "Response was blocked by Gemini: {}",
            reason.replace('_', " ").to_lowercase()
        )),
    }
}

pub fn ensure_assistant_variant(message: &mut StoredMessage) {
    if message.variants.is_empty() {
        let id = Uuid::new_v4().to_string();
        message.variants.push(MessageVariant {
            id: id.clone(),
            content: message.content.clone(),
            created_at: message.created_at,
            usage: message.usage.clone(),
            attachments: Vec::new(),
            reasoning: None,
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
        attachments: Vec::new(),
        reasoning: None,
    }
}
