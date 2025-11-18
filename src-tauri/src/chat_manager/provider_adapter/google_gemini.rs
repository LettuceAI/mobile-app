use std::collections::HashMap;

use serde::Serialize;
use serde_json::{json, Value};

use super::ProviderAdapter;

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
struct GeminiGenerationConfig {
    temperature: f64,
    #[serde(rename = "topP")]
    top_p: f64,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
    #[serde(rename = "topK", skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
}

// Reserved for future use with thinking models
#[allow(dead_code)]
#[derive(Serialize)]
struct GeminiThinkingConfig {
    #[serde(rename = "thinkingBudget")]
    thinking_budget: i32,
}

#[derive(Serialize)]
struct GeminiGoogleSearch {}

#[derive(Serialize)]
struct GeminiTool {
    #[serde(rename = "googleSearch", skip_serializing_if = "Option::is_none")]
    google_search: Option<GeminiGoogleSearch>,
}

#[derive(Serialize)]
struct GeminiChatRequest {
    contents: Vec<GeminiContent>,
    #[serde(
        rename = "systemInstruction",
        skip_serializing_if = "Option::is_none"
    )]
    system_instruction: Option<GeminiSystemInstruction>,
    #[serde(rename = "generationConfig")]
    generation_config: GeminiGenerationConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GeminiTool>>,
}

impl ProviderAdapter for GoogleGeminiAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        base_url.trim_end_matches('/').to_string()
    }

    fn build_url(&self, base_url: &str, model_name: &str, api_key: &str) -> String {
        // Gemini uses URL pattern: /v1beta/models/{model}:generateContent?key={api_key}
        let base = base_url.trim_end_matches('/').replace("/v1", "/v1beta");
        format!("{}/models/{}:generateContent?key={}", base, model_name, api_key)
    }

    fn system_role(&self) -> &'static str {
        "system"
    }

    fn supports_stream(&self) -> bool {
        false
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &[] // Gemini uses query parameter for auth, not headers
    }

    fn default_headers_template(&self) -> HashMap<String, String> {
        let mut out = HashMap::new();
        out.insert("Content-Type".into(), "application/json".into());
        out
    }

    fn headers(
        &self,
        _api_key: &str, // API key goes in URL for Gemini
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
    ) -> Value {
        // Convert OpenAI-style messages -> Gemini contents
        let mut contents: Vec<GeminiContent> = Vec::new();

        for msg in messages_for_api {
            let role = msg
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("user");

            // Gemini only knows "user" and "model" in contents.
            let gem_role = match role {
                "assistant" | "model" => "model",
                _ => "user",
            }
            .to_string();

            let text = msg
                .get("content")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| msg.get("content").map(|v| v.to_string()).unwrap_or_default());

            contents.push(GeminiContent {
                role: gem_role,
                parts: vec![GeminiPart { text }],
            });
        }

        let system_instruction = system_prompt.map(|sp| GeminiSystemInstruction {
            parts: vec![GeminiPart { text: sp }],
        });

        let generation_config = GeminiGenerationConfig {
            temperature,
            top_p,
            max_output_tokens: max_tokens,
            top_k,
        };

        // Optional: Enable Google Search tool
        // For now, we'll leave tools as None. You can enable it by uncommenting below:
        // let tools = Some(vec![GeminiTool {
        //     google_search: Some(GeminiGoogleSearch {}),
        // }]);

        let body = GeminiChatRequest {
            contents,
            system_instruction,
            generation_config,
            tools: None, // Set to Some(...) to enable Google Search
        };

        serde_json::to_value(body).unwrap_or_else(|_| json!({}))
    }
}

