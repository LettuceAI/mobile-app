use std::collections::HashMap;

use serde_json::{json, Value};

use super::{OpenAIChatRequest, ProviderAdapter};

pub struct FeatherlessAdapter;

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

