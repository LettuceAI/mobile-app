use std::collections::HashMap;

use serde_json::Value;

use super::provider_adapter::adapter_for;
use super::request::provider_base_url;
use super::tooling::ToolConfig;
use super::types::ProviderCredential;

pub struct BuiltRequest {
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Value,
    pub stream: bool,
    pub request_id: Option<String>,
}

/// Build a provider-specific chat API request (endpoint, headers, body).
/// This function accepts messages normalized into OpenAI-style
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
    frequency_penalty: Option<f64>,
    presence_penalty: Option<f64>,
    top_k: Option<u32>,
    tool_config: Option<&ToolConfig>,
    reasoning_enabled: bool,
    reasoning_effort: Option<String>,
    reasoning_budget: Option<u32>,
) -> BuiltRequest {
    let base_url = provider_base_url(provider_cred);

    let adapter = adapter_for(provider_cred);
    let url = adapter.build_url(&base_url, model_name, api_key);
    let headers = adapter.headers(api_key, provider_cred.headers.as_ref());
    let effective_stream = should_stream && adapter.supports_stream();

    let body = adapter.body(
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
        reasoning_enabled,
        reasoning_effort,
        reasoning_budget,
    );

    BuiltRequest {
        url,
        headers,
        body,
        stream: effective_stream,
        request_id,
    }
}

/// Returns the preferred system role keyword for the given provider.
pub fn system_role_for(provider_cred: &ProviderCredential) -> std::borrow::Cow<'static, str> {
    let adapter = adapter_for(provider_cred);
    adapter.system_role()
}
