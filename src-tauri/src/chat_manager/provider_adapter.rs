use std::collections::HashMap;

use serde::Serialize;
use serde_json::{json, Value};
use super::types::ProviderId;

pub trait ProviderAdapter {
    fn endpoint(&self, base_url: &str) -> String;
    /// Preferred system role keyword for this provider when sending a system message.
    fn system_role(&self) -> &'static str;
    /// Whether this provider supports Server-Sent Events (streaming responses).
    fn supports_stream(&self) -> bool {
        true
    }
    /// The required auth header keys for this provider (case sensitive suggestions for UI).
    fn required_auth_headers(&self) -> &'static [&'static str];
    /// A template of default headers (values redacted) to show expected headers without secrets.
    fn default_headers_template(&self) -> HashMap<String, String>;
    /// Build default headers for this provider using the given API key.
    /// `extra` headers from credentials are merged on top (overriding defaults when keys match).
    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String>;
    fn body(
        &self,
        model_name: &str,
        messages_for_api: &Vec<Value>,
        system_prompt: Option<String>,
        temperature: f64,
        top_p: f64,
        max_tokens: u32,
        should_stream: bool,
    ) -> Value;
}

pub struct OpenAIAdapter;
pub struct GroqAdapter;
pub struct MistralAdapter;
pub struct AnthropicAdapter;

// --- Typed request bodies per provider ---

#[derive(Serialize)]
struct OpenAIChatRequest<'a> {
    model: &'a str,
    messages: &'a Vec<Value>,
    stream: bool,
    temperature: f64,
    #[serde(rename = "top_p")]
    top_p: f64,
    #[serde(rename = "max_tokens")]
    max_tokens: u32,
}

#[derive(Serialize)]
struct MistralCompletionArgs {
    temperature: f64,
    #[serde(rename = "top_p")]
    top_p: f64,
    #[serde(rename = "max_tokens")]
    max_tokens: u32,
}

#[derive(Serialize)]
struct MistralConversationRequest<'a> {
    model: &'a str,
    inputs: Vec<Value>,
    tools: Vec<Value>,
    #[serde(rename = "completion_args")]
    completion_args: MistralCompletionArgs,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    instructions: Option<String>,
}

#[derive(Serialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    kind: &'static str,
    text: String,
}

#[derive(Serialize)]
struct AnthropicMessage {
    role: String,
    content: Vec<AnthropicContent>,
}

#[derive(Serialize)]
struct AnthropicMessagesRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    temperature: f64,
    #[serde(rename = "top_p")]
    top_p: f64,
    #[serde(rename = "max_tokens")]
    max_tokens: u32,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
}

impl ProviderAdapter for OpenAIAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    }

    fn system_role(&self) -> &'static str { "developer" }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["Authorization"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        let mut out = HashMap::new();
        out.insert("Authorization".into(), "Bearer <apiKey>".into());
        out.insert("Content-Type".into(), "application/json".into());
        out.insert("Accept".into(), "text/event-stream".into());
        out
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        let mut out: HashMap<String, String> = HashMap::new();
        out.insert("Authorization".into(), format!("Bearer {}", api_key));
        out.insert("Content-Type".into(), "application/json".into());
        out.insert("Accept".into(), "text/event-stream".into());
        out.entry("User-Agent".into()).or_insert_with(|| "LettuceAI/0.1".into());
        if let Some(extra) = extra {
            for (k, v) in extra.iter() {
                out.insert(k.clone(), v.clone());
            }
        }
        out
    }

    fn body(
        &self,
        model_name: &str,
        messages_for_api: &Vec<Value>,
        _system_prompt: Option<String>,
        temperature: f64,
        top_p: f64,
        max_tokens: u32,
        should_stream: bool,
    ) -> Value {
        let body = OpenAIChatRequest {
            model: model_name,
            messages: messages_for_api,
            stream: should_stream,
            temperature,
            top_p,
            max_tokens,
        };
        serde_json::to_value(body).unwrap_or_else(|_| json!({}))
    }
}

impl ProviderAdapter for GroqAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/openai") {
            format!("{}/v1/chat/completions", trimmed)
        } else {
            format!("{}/openai/v1/chat/completions", trimmed)
        }
    }

    fn system_role(&self) -> &'static str { "system" }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["Authorization"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        OpenAIAdapter.default_headers_template()
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        // Groq uses OpenAI-compatible auth
        OpenAIAdapter.headers(api_key, extra)
    }

    fn body(
        &self,
        model_name: &str,
        messages_for_api: &Vec<Value>,
        system_prompt: Option<String>,
        temperature: f64,
        top_p: f64,
        max_tokens: u32,
        should_stream: bool,
    ) -> Value {
        // Groq is OpenAI-compatible for our purposes
        OpenAIAdapter.body(
            model_name,
            messages_for_api,
            system_prompt,
            temperature,
            top_p,
            max_tokens,
            should_stream,
        )
    }
}

impl ProviderAdapter for MistralAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/conversations", trimmed)
        } else {
            format!("{}/v1/conversations", trimmed)
        }
    }

    fn system_role(&self) -> &'static str { "system" }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["X-API-KEY", "x-api-key"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        let mut out = HashMap::new();
        out.insert("X-API-KEY".into(), "<apiKey>".into());
        out.insert("Content-Type".into(), "application/json".into());
        out.insert("Accept".into(), "text/event-stream".into());
        out
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        let mut out: HashMap<String, String> = HashMap::new();
        out.insert("X-API-KEY".into(), api_key.to_string());
        out.insert("Content-Type".into(), "application/json".into());
        out.insert("Accept".into(), "text/event-stream".into());
        out.entry("User-Agent".into()).or_insert_with(|| "LettuceAI/0.1".into());
        if let Some(extra) = extra {
            for (k, v) in extra.iter() {
                out.insert(k.clone(), v.clone());
            }
        }
        out
    }

    fn body(
        &self,
        model_name: &str,
        messages_for_api: &Vec<Value>,
        system_prompt: Option<String>,
        temperature: f64,
        top_p: f64,
        max_tokens: u32,
        should_stream: bool,
    ) -> Value {
        // Derive instructions and inputs from messages
        let mut instructions = system_prompt;
        let mut inputs: Vec<Value> = Vec::new();

        if instructions.is_none() {
            if let Some(first) = messages_for_api.first() {
                if let Some(role) = first.get("role").and_then(|v| v.as_str()) {
                    if role == "system" || role == "developer" {
                        if let Some(text) = first.get("content").and_then(|c| c.as_str()) {
                            instructions = Some(text.to_string());
                        }
                    }
                }
            }
        }

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

        let body = MistralConversationRequest {
            model: model_name,
            inputs,
            tools: Vec::new(),
            completion_args: MistralCompletionArgs { temperature, top_p, max_tokens },
            stream: should_stream,
            instructions,
        };
        serde_json::to_value(body).unwrap_or_else(|_| json!({}))
    }
}

impl ProviderAdapter for AnthropicAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/messages", trimmed)
        } else {
            format!("{}/v1/messages", trimmed)
        }
    }

    fn system_role(&self) -> &'static str { "system" }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["x-api-key", "anthropic-version"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        let mut out = HashMap::new();
        out.insert("x-api-key".into(), "<apiKey>".into());
        out.insert("anthropic-version".into(), "2023-06-01".into());
        out.insert("Content-Type".into(), "application/json".into());
        out.insert("Accept".into(), "text/event-stream".into());
        out
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        let mut out: HashMap<String, String> = HashMap::new();
        out.insert("x-api-key".into(), api_key.to_string());
        out.insert("Content-Type".into(), "application/json".into());
        out.insert("Accept".into(), "text/event-stream".into());
        out.entry("User-Agent".into()).or_insert_with(|| "LettuceAI/0.1".into());
        if let Some(extra) = extra {
            for (k, v) in extra.iter() {
                out.insert(k.clone(), v.clone());
            }
        }
        out
    }

    fn body(
        &self,
        model_name: &str,
        messages_for_api: &Vec<Value>,
        system_prompt: Option<String>,
        temperature: f64,
        top_p: f64,
        max_tokens: u32,
        should_stream: bool,
    ) -> Value {
        let mut msgs: Vec<AnthropicMessage> = Vec::new();
        for msg in messages_for_api {
            let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("");
            if role == "system" || role == "developer" {
                continue;
            }
            let content_text = msg
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if content_text.is_empty() {
                continue;
            }
            let mapped_role = match role { "assistant" => "assistant", _ => "user" }.to_string();
            msgs.push(AnthropicMessage {
                role: mapped_role,
                content: vec![AnthropicContent { kind: "text", text: content_text }],
            });
        }

        let body = AnthropicMessagesRequest {
            model: model_name.to_string(),
            messages: msgs,
            temperature,
            top_p,
            max_tokens,
            stream: should_stream,
            system: system_prompt.filter(|s| !s.is_empty()),
        };
        serde_json::to_value(body).unwrap_or_else(|_| json!({}))
    }
}

pub fn adapter_for(provider_id: &ProviderId) -> Box<dyn ProviderAdapter + Send + Sync> {
    match provider_id.0.as_str() {
        "anthropic" => Box::new(AnthropicAdapter),
        "mistral" => Box::new(MistralAdapter),
        "groq" => Box::new(GroqAdapter),
        _ => Box::new(OpenAIAdapter),
    }
}
