use std::collections::HashMap;

use serde::Serialize;
use serde_json::{json, Value};

use super::ProviderAdapter;
use crate::chat_manager::tooling::{gemini_tool_config, gemini_tools, ToolConfig};

pub struct GoogleGeminiAdapter;

#[derive(Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Serialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiSystemInstruction {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiThinkingConfig {
    #[serde(rename = "includeThoughts")]
    include_thoughts: bool,
    #[serde(rename = "thinkingBudget", skip_serializing_if = "Option::is_none")]
    thinking_budget: Option<i32>,
    #[serde(rename = "thinkingLevel", skip_serializing_if = "Option::is_none")]
    thinking_level: Option<String>,
}

#[derive(Serialize)]
struct GeminiGenerationConfig {
    temperature: f64,
    #[serde(rename = "topP")]
    top_p: f64,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
    #[serde(rename = "topK", skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
    #[serde(rename = "thinkingConfig", skip_serializing_if = "Option::is_none")]
    thinking_config: Option<GeminiThinkingConfig>,
}

#[derive(Serialize)]
struct GeminiChatRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "systemInstruction", skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiSystemInstruction>,
    #[serde(rename = "generationConfig")]
    generation_config: GeminiGenerationConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_config: Option<Value>,
}

impl ProviderAdapter for GoogleGeminiAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        base_url.trim_end_matches('/').to_string()
    }

    fn build_url(
        &self,
        base_url: &str,
        model_name: &str,
        api_key: &str,
        should_stream: bool,
    ) -> String {
        let base = base_url.trim_end_matches('/').replace("/v1", "/v1beta");
        if should_stream {
            format!(
                "{}/models/{}:streamGenerateContent?alt=sse&key={}",
                base, model_name, api_key
            )
        } else {
            format!(
                "{}/models/{}:generateContent?key={}",
                base, model_name, api_key
            )
        }
    }

    fn system_role(&self) -> std::borrow::Cow<'static, str> {
        "system".into()
    }

    fn supports_stream(&self) -> bool {
        true
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &[]
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        let mut out = HashMap::new();
        out.insert("Content-Type".into(), "application/json".into());
        out
    }

    fn headers(
        &self,
        _api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        let mut out: HashMap<String, String> = HashMap::new();
        out.insert("Content-Type".into(), "application/json".into());
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
        _model_name: &str,
        messages_for_api: &Vec<Value>,
        system_prompt: Option<String>,
        temperature: f64,
        top_p: f64,
        max_tokens: u32,
        _should_stream: bool,
        _frequency_penalty: Option<f64>,
        _presence_penalty: Option<f64>,
        top_k: Option<u32>,
        tool_config: Option<&ToolConfig>,
        reasoning_enabled: bool,
        _reasoning_effort: Option<String>,
        reasoning_budget: Option<u32>,
    ) -> Value {
        let mut contents: Vec<GeminiContent> = Vec::new();

        for msg in messages_for_api {
            let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("user");

            let gem_role = match role {
                "assistant" | "model" => "model",
                _ => "user",
            }
            .to_string();

            let text = msg
                .get("content")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    msg.get("content")
                        .map(|v| v.to_string())
                        .unwrap_or_default()
                });

            contents.push(GeminiContent {
                role: gem_role,
                parts: vec![GeminiPart { text }],
            });
        }

        let system_instruction = system_prompt.map(|sp| GeminiSystemInstruction {
            parts: vec![GeminiPart { text: sp }],
        });

        let thinking_config = if reasoning_enabled {
            let thinking_level = _reasoning_effort.as_ref().map(|s| s.to_uppercase());
            let thinking_budget = if thinking_level.is_some() {
                None
            } else {
                Some(reasoning_budget.map(|b| b as i32).unwrap_or(-1))
            };

            Some(GeminiThinkingConfig {
                include_thoughts: true,
                thinking_budget,
                thinking_level,
            })
        } else {
            None
        };

        let generation_config = GeminiGenerationConfig {
            temperature,
            top_p,
            max_output_tokens: max_tokens,
            top_k,
            thinking_config,
        };

        let tools = tool_config.and_then(gemini_tools);
        let tool_config = if tools.is_some() {
            tool_config.and_then(|cfg| gemini_tool_config(cfg.choice.as_ref()))
        } else {
            None
        };

        let body = GeminiChatRequest {
            contents,
            system_instruction,
            generation_config,
            tools,
            tool_config,
        };

        let json_body = serde_json::to_value(&body).unwrap_or_else(|_| json!({}));

        // Log the Gemini request body for debugging
        if let Some(gen_config) = json_body.get("generationConfig") {
            eprintln!("[DEBUG] Gemini generationConfig: {:?}", gen_config);
        }

        json_body
    }
}
