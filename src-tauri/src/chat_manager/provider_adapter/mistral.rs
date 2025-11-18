use std::collections::HashMap;

use serde::Serialize;
use serde_json::{json, Value};

use super::ProviderAdapter;

pub struct MistralAdapter;

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

            let mut cloned = msg.clone();
            if let Some(obj) = cloned.as_object_mut() {
                obj.remove("role");
            }
            inputs.push(cloned);
        }

        let body = MistralConversationRequest {
            model: model_name,
            inputs,
            tools: vec![],
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

