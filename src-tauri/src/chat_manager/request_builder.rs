use std::collections::HashMap;

use serde_json::{json, Value};

use super::request::{normalize_headers, provider_base_url};
use super::types::ProviderCredential;

pub struct BuiltRequest {
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Value,
    pub stream: bool,
    pub request_id: Option<String>,
}

/// Build a provider-specific chat API request (endpoint, headers, body).
/// This function accepts messages already normalized into OpenAI-style
/// role/content objects and adapts them for each provider.
pub fn build_chat_request(
    provider_cred: &ProviderCredential,
    api_key: &str,
    model_name: &str,
    messages_for_api: &Vec<Value>,
    system_prompt: Option<String>,
    temperature: f64,
    top_p: f64,
    max_tokens: u32,
    should_stream: bool,
    request_id: Option<String>,
) -> BuiltRequest {
    let base_url = provider_base_url(provider_cred);
    let headers = normalize_headers(provider_cred, api_key);

    let provider_id = provider_cred.provider_id.as_str();
    let endpoint = match provider_id {
        // Mistral Conversations API
        "mistral" => {
            let trimmed = base_url.trim_end_matches('/');
            if trimmed.ends_with("/v1") {
                format!("{}/conversations", trimmed)
            } else {
                format!("{}/v1/conversations", trimmed)
            }
        }
        // Groq OpenAI-compatible endpoint (documented under /openai/v1/...)
        "groq" => {
            let trimmed = base_url.trim_end_matches('/');
            if trimmed.ends_with("/openai") {
                format!("{}/v1/chat/completions", trimmed)
            } else {
                format!("{}/openai/v1/chat/completions", trimmed)
            }
        }
        // Default OpenAI-compatible providers
        _ => {
            let trimmed = base_url.trim_end_matches('/');
            if trimmed.ends_with("/v1") {
                format!("{}/chat/completions", trimmed)
            } else {
                format!("{}/v1/chat/completions", trimmed)
            }
        }
    };

    let body = match provider_id {
        // Mistral: instructions + inputs + completion_args
        "mistral" => {
            // Extract instructions: prefer explicit system_prompt, else first system/developer message
            let mut instructions = system_prompt;
            let mut inputs: Vec<Value> = Vec::new();

            if instructions.is_none() {
                if let Some(first) = messages_for_api.first() {
                    if let Some(role) = first.get("role").and_then(|v| v.as_str()) {
                        if role == "system" || role == "developer" {
                            // Try to extract content as instructions
                            if let Some(text) = first.get("content").and_then(|c| c.as_str()) {
                                instructions = Some(text.to_string());
                            }
                        }
                    }
                }
            }

            // Build inputs by skipping the leading system/developer message if present
            for (idx, msg) in messages_for_api.iter().enumerate() {
                if idx == 0 {
                    if let Some(role) = msg.get("role").and_then(|v| v.as_str()) {
                        if role == "system" || role == "developer" {
                            continue;
                        }
                    }
                }
                inputs.push(msg.clone());
            }

            json!({
                "model": model_name,
                "inputs": inputs,
                "tools": [],
                "completion_args": {
                    "temperature": temperature,
                    "top_p": top_p,
                    "max_tokens": max_tokens,
                },
                "stream": should_stream,
                "instructions": instructions,
            })
        }
        // Default OpenAI-compatible body
        _ => json!({
            "model": model_name,
            "messages": messages_for_api,
            "stream": should_stream,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
        }),
    };

    BuiltRequest {
        url: endpoint,
        headers,
        body,
        stream: should_stream,
        request_id,
    }
}
