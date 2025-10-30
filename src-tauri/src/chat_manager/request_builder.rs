use std::collections::HashMap;

use serde_json::Value;

use super::provider_adapter::adapter_for;
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

    let adapter = adapter_for(provider_cred.provider_id.as_str());
    let endpoint = adapter.endpoint(&base_url);

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
        stream: should_stream,
        request_id,
    }
}
