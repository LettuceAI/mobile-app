use std::collections::HashMap;

use serde_json::Value;

use super::{deepseek::DeepSeekAdapter, ProviderAdapter};
use crate::chat_manager::tooling::ToolConfig;

/// Chutes provides OpenAI-compatible endpoints (e.g. /v1/chat/completions).
///
/// This adapter intentionally reuses our OpenAI-style request/headers logic.
pub struct ChutesAdapter;

impl ProviderAdapter for ChutesAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        DeepSeekAdapter.endpoint(base_url)
    }

    fn system_role(&self) -> &'static str {
        // vLLM / SGLang deployments generally expect classic OpenAI roles.
        "system"
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        // NOTE: keep explicit to remain resilient even if DeepSeekAdapter changes.
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
        tool_config: Option<&ToolConfig>,
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
            tool_config,
        )
    }
}
