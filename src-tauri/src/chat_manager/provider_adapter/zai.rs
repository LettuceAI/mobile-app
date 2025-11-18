use std::collections::HashMap;

use serde::Serialize;
use serde_json::{json, Value};

use super::ProviderAdapter;

pub struct ZAIAdapter;

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

impl ProviderAdapter for ZAIAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        // ZAI uses: POST https://api.z-ai.com/v1/llm
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/llm", trimmed)
        } else {
            format!("{}/v1/llm", trimmed)
        }
    }

    fn system_role(&self) -> &'static str {
        // ZAI uses standard OpenAI-style roles
        "system"
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["Authorization"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        let mut out = HashMap::new();
        out.insert("Authorization".into(), "Bearer <apiKey>".into());
        out.insert("Content-Type".into(), "application/json".into());
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

