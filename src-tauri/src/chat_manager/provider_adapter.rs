use serde_json::{json, Value};

pub trait ProviderAdapter {
    fn endpoint(&self, base_url: &str) -> String;
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

impl ProviderAdapter for OpenAIAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
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
        json!({
            "model": model_name,
            "messages": messages_for_api,
            "stream": should_stream,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
        })
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

        json!({
            "model": model_name,
            "inputs": inputs,
            "tools": [],
            "completion_args": {
                "temperature": temperature,
                "top_p": top_p,
                "max_tokens": max_tokens,
            },
            "stream": should_stream,
            "instructions": instructions,
        })
    }
}

pub fn adapter_for(provider_id: &str) -> Box<dyn ProviderAdapter + Send + Sync> {
    match provider_id {
        "mistral" => Box::new(MistralAdapter),
        "groq" => Box::new(GroqAdapter),
        _ => Box::new(OpenAIAdapter),
    }
}
