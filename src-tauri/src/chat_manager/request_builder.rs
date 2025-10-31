use std::collections::HashMap;

use serde_json::Value;

use super::provider_adapter::adapter_for;
use super::request::provider_base_url;
use super::types::{ProviderCredential, ProviderId};

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

    let adapter = adapter_for(&ProviderId(provider_cred.provider_id.clone()));
    let endpoint = adapter.endpoint(&base_url);
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
    );

    BuiltRequest {
        url: endpoint,
        headers,
        body,
        stream: effective_stream,
        request_id,
    }
}

/// Returns the preferred system role keyword for the given provider.
pub fn system_role_for(provider_cred: &ProviderCredential) -> &'static str {
    let adapter = adapter_for(&ProviderId(provider_cred.provider_id.clone()));
    adapter.system_role()
}
