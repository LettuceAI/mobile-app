use std::collections::HashMap;

use super::types::ProviderId;
use serde::Serialize;
use serde_json::{json, Value};

pub trait ProviderAdapter {
    fn endpoint(&self, base_url: &str) -> String;
    
    /// Build the complete URL including model name and any query parameters.
    /// Default implementation just returns endpoint(), but providers like Gemini can override.
    fn build_url(&self, base_url: &str, _model_name: &str, _api_key: &str) -> String {
        self.endpoint(base_url)
    }
    
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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        top_k: Option<u32>,
    ) -> Value;
}

pub struct OpenAIAdapter;
pub struct GroqAdapter;
pub struct MistralAdapter;
pub struct AnthropicAdapter;
pub struct DeepSeekAdapter;
pub struct NanoGPTAdapter;
pub struct XAIAdapter;
pub struct AnannasAdapter;
pub struct GoogleGeminiAdapter;
pub struct ZAIAdapter;
pub struct MoonshotAdapter;
pub struct FeatherlessAdapter;
pub struct QwenAdapter;

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
    #[serde(rename = "frequency_penalty", skip_serializing_if = "Option::is_none")]
    frequency_penalty: Option<f64>,
    #[serde(rename = "presence_penalty", skip_serializing_if = "Option::is_none")]
    presence_penalty: Option<f64>,
}

#[derive(Serialize)]
struct MistralCompletionArgs {
    temperature: f64,
    #[serde(rename = "top_p")]
    top_p: f64,
    #[serde(rename = "max_tokens")]
    max_tokens: u32,
    #[serde(rename = "frequency_penalty", skip_serializing_if = "Option::is_none")]
    frequency_penalty: Option<f64>,
    #[serde(rename = "presence_penalty", skip_serializing_if = "Option::is_none")]
    presence_penalty: Option<f64>,
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
    #[serde(rename = "top_k", skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
}

#[derive(Serialize)]
struct ZAIChatRequest<'a> {
    model: &'a str,
    messages: &'a Vec<Value>,
    temperature: f64,
    #[serde(rename = "top_p")]
    top_p: f64,
    #[serde(rename = "max_tokens")]
    max_tokens: u32,
    // ZAI supports streaming via SSE, so we expose this directly.
    stream: bool,
    // You can add more ZAI-specific fields here later (e.g. do_sample, tools, etc.)
}

#[derive(Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Serialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiSystemInstruction {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiGenerationConfig {
    temperature: f64,
    #[serde(rename = "topP")]
    top_p: f64,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
    #[serde(rename = "topK", skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
}

// Reserved for future use with thinking models
#[allow(dead_code)]
#[derive(Serialize)]
struct GeminiThinkingConfig {
    #[serde(rename = "thinkingBudget")]
    thinking_budget: i32,
}

#[derive(Serialize)]
struct GeminiGoogleSearch {}

#[derive(Serialize)]
struct GeminiTool {
    #[serde(rename = "googleSearch", skip_serializing_if = "Option::is_none")]
    google_search: Option<GeminiGoogleSearch>,
}

#[derive(Serialize)]
struct GeminiChatRequest {
    contents: Vec<GeminiContent>,
    #[serde(
        rename = "systemInstruction",
        skip_serializing_if = "Option::is_none"
    )]
    system_instruction: Option<GeminiSystemInstruction>,
    #[serde(rename = "generationConfig")]
    generation_config: GeminiGenerationConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GeminiTool>>,
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

    fn system_role(&self) -> &'static str {
        "developer"
    }

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
        out.entry("User-Agent".into())
            .or_insert_with(|| "LettuceAI/0.1".into());
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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        _top_k: Option<u32>,
    ) -> Value {
        let body = OpenAIChatRequest {
            model: model_name,
            messages: messages_for_api,
            stream: should_stream,
            temperature,
            top_p,
            max_tokens,
            frequency_penalty,
            presence_penalty,
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

    fn system_role(&self) -> &'static str {
        "system"
    }

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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        top_k: Option<u32>,
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
            frequency_penalty,
            presence_penalty,
            top_k,
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

    fn system_role(&self) -> &'static str {
        "system"
    }

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
        out.entry("User-Agent".into())
            .or_insert_with(|| "LettuceAI/0.1".into());
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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        _top_k: Option<u32>,
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
            completion_args: MistralCompletionArgs {
                temperature,
                top_p,
                max_tokens,
                frequency_penalty,
                presence_penalty,
            },
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

    fn system_role(&self) -> &'static str {
        "system"
    }

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
        out.entry("User-Agent".into())
            .or_insert_with(|| "LettuceAI/0.1".into());
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
        _frequency_penalty: Option<f64>,
        _presence_penalty: Option<f64>,
        top_k: Option<u32>,
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
            let mapped_role = match role {
                "assistant" => "assistant",
                _ => "user",
            }
            .to_string();
            msgs.push(AnthropicMessage {
                role: mapped_role,
                content: vec![AnthropicContent {
                    kind: "text",
                    text: content_text,
                }],
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
            top_k,
        };
        serde_json::to_value(body).unwrap_or_else(|_| json!({}))
    }
}

impl ProviderAdapter for DeepSeekAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        // DeepSeek uses /chat/completions, with optional /v1 prefix
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    }

    fn system_role(&self) -> &'static str {
        // DeepSeek expects classic OpenAI roles: system / user / assistant / tool.
        "system"
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["Authorization"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        // Same as OpenAI
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
        out.entry("User-Agent".into())
            .or_insert_with(|| "LettuceAI/0.1".into());
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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        _top_k: Option<u32>,
    ) -> Value {
        let body = OpenAIChatRequest {
            model: model_name,
            messages: messages_for_api,
            stream: should_stream,
            temperature,
            top_p,
            max_tokens,
            frequency_penalty,
            presence_penalty,
        };
        serde_json::to_value(body).unwrap_or_else(|_| json!({}))
    }
}

impl ProviderAdapter for NanoGPTAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        // NanoGPT usually uses BASE = https://nano-gpt.com/api/v1
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    }

    fn system_role(&self) -> &'static str {
        "system"
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["Authorization"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        DeepSeekAdapter.default_headers_template()
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        DeepSeekAdapter.headers(api_key, extra)
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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        top_k: Option<u32>,
    ) -> Value {
        DeepSeekAdapter.body(
            model_name,
            messages_for_api,
            system_prompt,
            temperature,
            top_p,
            max_tokens,
            should_stream,
            frequency_penalty,
            presence_penalty,
            top_k,
        )
    }
}

impl ProviderAdapter for XAIAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        // xAI base: https://api.x.ai, endpoint: /v1/chat/completions
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    }

    fn system_role(&self) -> &'static str {
        "system"
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["Authorization"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        DeepSeekAdapter.default_headers_template()
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        DeepSeekAdapter.headers(api_key, extra)
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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        top_k: Option<u32>,
    ) -> Value {
        DeepSeekAdapter.body(
            model_name,
            messages_for_api,
            system_prompt,
            temperature,
            top_p,
            max_tokens,
            should_stream,
            frequency_penalty,
            presence_penalty,
            top_k,
        )
    }
}

impl ProviderAdapter for AnannasAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        // Anannas base: https://api.anannas.ai/v1
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    }

    fn system_role(&self) -> &'static str {
        "system"
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["Authorization"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        DeepSeekAdapter.default_headers_template()
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        DeepSeekAdapter.headers(api_key, extra)
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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        top_k: Option<u32>,
    ) -> Value {
        DeepSeekAdapter.body(
            model_name,
            messages_for_api,
            system_prompt,
            temperature,
            top_p,
            max_tokens,
            should_stream,
            frequency_penalty,
            presence_penalty,
            top_k,
        )
    }
}

impl ProviderAdapter for MoonshotAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        // Moonshot base: https://api.moonshot.ai, endpoint: /v1/chat/completions
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    }

    fn system_role(&self) -> &'static str {
        "system"
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["Authorization"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        DeepSeekAdapter.default_headers_template()
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        DeepSeekAdapter.headers(api_key, extra)
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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        top_k: Option<u32>,
    ) -> Value {
        DeepSeekAdapter.body(
            model_name,
            messages_for_api,
            system_prompt,
            temperature,
            top_p,
            max_tokens,
            should_stream,
            frequency_penalty,
            presence_penalty,
            top_k,
        )
    }
}

impl ProviderAdapter for ZAIAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        let trimmed = base_url.trim_end_matches('/');

        // If user already passes .../paas/v4 or .../coding/paas/v4:
        if trimmed.ends_with("/v4") {
            format!("{}/chat/completions", trimmed)
        } else if trimmed.ends_with("/chat/completions") {
            trimmed.to_string()
        } else {
            // Fallback: assume bare https://api.z.ai
            format!("{}/api/paas/v4/chat/completions", trimmed)
        }
    }

    fn system_role(&self) -> &'static str {
        "system"
    }

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
        out.entry("User-Agent".into())
            .or_insert_with(|| "LettuceAI/0.1".into());
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
        _frequency_penalty: Option<f64>,
        _presence_penalty: Option<f64>,
        _top_k: Option<u32>,
    ) -> Value {
        let body = ZAIChatRequest {
            model: model_name,
            messages: messages_for_api,
            temperature,
            top_p,
            max_tokens,
            stream: should_stream,
        };
        serde_json::to_value(body).unwrap_or_else(|_| json!({}))
    }
}

impl ProviderAdapter for GoogleGeminiAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        base_url.trim_end_matches('/').to_string()
    }

    fn build_url(&self, base_url: &str, model_name: &str, api_key: &str) -> String {
        // Gemini uses URL pattern: /v1beta/models/{model}:generateContent?key={api_key}
        let base = base_url.trim_end_matches('/').replace("/v1", "/v1beta");
        format!("{}/models/{}:generateContent?key={}", base, model_name, api_key)
    }

    fn system_role(&self) -> &'static str {
        "system"
    }

    fn supports_stream(&self) -> bool {
        false
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &[]  // Gemini uses query parameter for auth, not headers
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        let mut out = HashMap::new();
        out.insert("Content-Type".into(), "application/json".into());
        out
    }

    fn headers(
        &self,
        _api_key: &str,  // API key goes in URL for Gemini
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        let mut out: HashMap<String, String> = HashMap::new();
        out.insert("Content-Type".into(), "application/json".into());
        out.entry("User-Agent".into())
            .or_insert_with(|| "LettuceAI/0.1".into());
        if let Some(extra) = extra {
            for (k, v) in extra.iter() {
                out.insert(k.clone(), v.clone());
            }
        }
        out
    }

    fn body(
        &self,
        _model_name: &str,
        messages_for_api: &Vec<Value>,
        system_prompt: Option<String>,
        temperature: f64,
        top_p: f64,
        max_tokens: u32,
        _should_stream: bool,
        _frequency_penalty: Option<f64>,
        _presence_penalty: Option<f64>,
        top_k: Option<u32>,
    ) -> Value {
        // Convert OpenAI-style messages -> Gemini contents
        let mut contents: Vec<GeminiContent> = Vec::new();

        for msg in messages_for_api {
            let role = msg
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("user");

            // Gemini only knows "user" and "model" in contents.
            let gem_role = match role {
                "assistant" | "model" => "model",
                _ => "user",
            }
            .to_string();

            let text = msg
                .get("content")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| msg.get("content").map(|v| v.to_string()).unwrap_or_default());

            contents.push(GeminiContent {
                role: gem_role,
                parts: vec![GeminiPart { text }],
            });
        }

        let system_instruction = system_prompt.map(|sp| GeminiSystemInstruction {
            parts: vec![GeminiPart { text: sp }],
        });

        let generation_config = GeminiGenerationConfig {
            temperature,
            top_p,
            max_output_tokens: max_tokens,
            top_k,
        };

        // Optional: Enable Google Search tool
        // For now, we'll leave tools as None. You can enable it by uncommenting below:
        // let tools = Some(vec![GeminiTool {
        //     google_search: Some(GeminiGoogleSearch {}),
        // }]);

        let body = GeminiChatRequest {
            contents,
            system_instruction,
            generation_config,
            tools: None,  // Set to Some(...) to enable Google Search
        };

        serde_json::to_value(body).unwrap_or_else(|_| json!({}))
    }
}

impl ProviderAdapter for FeatherlessAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        // Featherless is OpenAI-compatible: /v1/chat/completions
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    }

    fn system_role(&self) -> &'static str {
        // Uses classic system / user / assistant roles
        "system"
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        // Featherless docs: `Authentication: Bearer <API_KEY>`
        &["Authentication"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        let mut out = HashMap::new();
        out.insert("Authentication".into(), "Bearer <apiKey>".into());
        out.insert("Content-Type".into(), "application/json".into());
        out.insert("Accept".into(), "text/event-stream".into());
        // Recommended but not strictly required by Featherless:
        out.insert("HTTP-Referer".into(), "<your app URL>".into());
        out.insert("X-Title".into(), "LettuceAI".into());
        out
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        let mut out: HashMap<String, String> = HashMap::new();
        out.insert("Authentication".into(), format!("Bearer {}", api_key));
        out.insert("Content-Type".into(), "application/json".into());
        out.insert("Accept".into(), "text/event-stream".into());
        out.entry("User-Agent".into())
            .or_insert_with(|| "LettuceAI/0.1".into());
        // Default attribution as recommended by Featherless
        out.entry("HTTP-Referer".into())
            .or_insert_with(|| "https://lettuceai.app".into());
        out.entry("X-Title".into())
            .or_insert_with(|| "LettuceAI".into());

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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        _top_k: Option<u32>,
    ) -> Value {
        // Featherless is OpenAI-compatible, so we can reuse the OpenAI-style body.
        let body = OpenAIChatRequest {
            model: model_name,
            messages: messages_for_api,
            stream: should_stream,
            temperature,
            top_p,
            max_tokens,
            frequency_penalty,
            presence_penalty,
        };
        serde_json::to_value(body).unwrap_or_else(|_| json!({}))
    }
}

impl ProviderAdapter for QwenAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        // Qwen uses OpenAI-style endpoints
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    }

    fn system_role(&self) -> &'static str {
        "system"
    }

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
        frequency_penalty: Option<f64>,
        presence_penalty: Option<f64>,
        _top_k: Option<u32>,
    ) -> Value {
        // Qwen uses OpenAI-compatible body
        let body = OpenAIChatRequest {
            model: model_name,
            messages: messages_for_api,
            stream: should_stream,
            temperature,
            top_p,
            max_tokens,
            frequency_penalty,
            presence_penalty,
        };
        serde_json::to_value(body).unwrap_or_else(|_| json!({}))
    }
}



pub fn adapter_for(provider_id: &ProviderId) -> Box<dyn ProviderAdapter + Send + Sync> {
    match provider_id.0.as_str() {
        "anthropic" => Box::new(AnthropicAdapter),
        "mistral" => Box::new(MistralAdapter),
        "groq" => Box::new(GroqAdapter),
        "deepseek" => Box::new(DeepSeekAdapter),
        "nanogpt" => Box::new(NanoGPTAdapter),
        "xai" => Box::new(XAIAdapter),
        "anannas" => Box::new(AnannasAdapter),
        "google" | "google-gemini" | "gemini" => Box::new(GoogleGeminiAdapter),
        "zai" | "z.ai" => Box::new(ZAIAdapter),
        "moonshot" | "moonshot-ai" => Box::new(MoonshotAdapter),
        "featherless" => Box::new(FeatherlessAdapter),
        "qwen" => Box::new(QwenAdapter),
        _ => Box::new(OpenAIAdapter),
    }
}
