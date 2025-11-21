use std::collections::HashMap;

use serde::Serialize;
use serde_json::Value;

use super::types::ProviderId;
use crate::chat_manager::tooling::ToolConfig;

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
        tool_config: Option<&ToolConfig>,
    ) -> Value;
}

// Shared OpenAI-style request used by multiple providers.
#[derive(Serialize)]
pub(crate) struct OpenAIChatRequest<'a> {
    pub(crate) model: &'a str,
    pub(crate) messages: &'a Vec<Value>,
    pub(crate) stream: bool,
    pub(crate) temperature: f64,
    #[serde(rename = "top_p")]
    pub(crate) top_p: f64,
    #[serde(rename = "max_tokens")]
    pub(crate) max_tokens: u32,
    #[serde(rename = "frequency_penalty", skip_serializing_if = "Option::is_none")]
    pub(crate) frequency_penalty: Option<f64>,
    #[serde(rename = "presence_penalty", skip_serializing_if = "Option::is_none")]
    pub(crate) presence_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tools: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tool_choice: Option<Value>,
}

mod anannas;
mod anthropic;
mod deepseek;
mod featherless;
mod google_gemini;
mod groq;
mod mistral;
mod moonshot;
mod nanogpt;
mod openai;
mod qwen;
mod xai;
mod zai;

pub fn adapter_for(provider_id: &ProviderId) -> Box<dyn ProviderAdapter + Send + Sync> {
    match provider_id.0.as_str() {
        "anthropic" => Box::new(anthropic::AnthropicAdapter),
        "mistral" => Box::new(mistral::MistralAdapter),
        "groq" => Box::new(groq::GroqAdapter),
        "deepseek" => Box::new(deepseek::DeepSeekAdapter),
        "nanogpt" => Box::new(nanogpt::NanoGPTAdapter),
        "xai" => Box::new(xai::XAIAdapter),
        "anannas" => Box::new(anannas::AnannasAdapter),
        "google" | "google-gemini" | "gemini" => Box::new(google_gemini::GoogleGeminiAdapter),
        "zai" | "z.ai" => Box::new(zai::ZAIAdapter),
        "moonshot" | "moonshot-ai" => Box::new(moonshot::MoonshotAdapter),
        "featherless" => Box::new(featherless::FeatherlessAdapter),
        "qwen" => Box::new(qwen::QwenAdapter),
        _ => Box::new(openai::OpenAIAdapter),
    }
}
