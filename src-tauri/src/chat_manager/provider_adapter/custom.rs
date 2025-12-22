use std::borrow::Cow;
use std::collections::HashMap;

use serde_json::Value;

use super::{OpenAIChatRequest, ProviderAdapter, ReasoningConfig};
use crate::chat_manager::tooling::ToolConfig;
use crate::chat_manager::types::ProviderCredential;

pub struct CustomGenericAdapter {
    credential_config: Option<Value>,
}

impl CustomGenericAdapter {
    pub fn new(credential: &ProviderCredential) -> Self {
        Self {
            credential_config: credential.config.clone(),
        }
    }

    fn config_value(&self, key: &str) -> Option<String> {
        self.credential_config
            .as_ref()
            .and_then(|v| v.get(key))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    }
}

impl ProviderAdapter for CustomGenericAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        let path = self
            .config_value("chatEndpoint")
            .unwrap_or_else(|| "/chat/completions".to_string());
        format!("{}{}", base_url.trim_end_matches('/'), path)
    }

    fn system_role(&self) -> Cow<'static, str> {
        self.config_value("systemRole")
            .map(|s| Cow::Owned(s))
            .unwrap_or(Cow::Borrowed("system"))
    }

    fn supports_stream(&self) -> bool {
        self.credential_config
            .as_ref()
            .and_then(|v| v.get("supportsStream"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["Authorization"]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        let mut map = HashMap::new();
        map.insert("Authorization".to_string(), "Bearer $API_KEY".to_string());
        map
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), format!("Bearer {}", api_key));
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        if let Some(extra_headers) = extra {
            for (k, v) in extra_headers {
                headers.insert(k.clone(), v.clone());
            }
        }
        headers
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
        tool_config: Option<&ToolConfig>,
        reasoning_enabled: bool,
        reasoning_effort: Option<String>,
        reasoning_budget: Option<u32>,
    ) -> Value {
        // Map messages if necessary
        let mut mapped_messages = messages_for_api.clone();

        // Handle role mapping if configured
        if let Some(user_role) = self.config_value("userRole") {
            for msg in mapped_messages.iter_mut() {
                if msg["role"] == "user" {
                    msg["role"] = Value::String(user_role.clone());
                }
            }
        }
        if let Some(assistant_role) = self.config_value("assistantRole") {
            for msg in mapped_messages.iter_mut() {
                if msg["role"] == "assistant" {
                    msg["role"] = Value::String(assistant_role.clone());
                }
            }
        }
        if let Some(sys_role) = self.config_value("systemRole") {
            for msg in mapped_messages.iter_mut() {
                if msg["role"] == "system" {
                    msg["role"] = Value::String(sys_role.clone());
                }
            }
        }

        let request = OpenAIChatRequest {
            model: model_name,
            messages: &mapped_messages,
            stream: should_stream,
            temperature,
            top_p,
            max_tokens: Some(max_tokens),
            max_completion_tokens: None,
            frequency_penalty,
            presence_penalty,
            reasoning_effort: None, // Custom usually doesn't strictly support this yet unless generic OAI
            reasoning: if reasoning_enabled {
                Some(ReasoningConfig {
                    effort: reasoning_effort,
                    max_tokens: reasoning_budget,
                })
            } else {
                None
            },
            tools: tool_config.map(|c| {
                c.tools
                    .iter()
                    .map(|t| serde_json::to_value(t).unwrap())
                    .collect()
            }),
            tool_choice: tool_config.map(|c| serde_json::to_value(&c.choice).unwrap()),
        };

        serde_json::to_value(request).unwrap()
    }
}
