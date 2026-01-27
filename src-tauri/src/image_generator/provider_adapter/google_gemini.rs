use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

use super::{ImageProviderAdapter, ImageResponseData};
use crate::image_generator::types::ImageGenerationRequest;

pub struct GoogleGeminiAdapter;

#[derive(Serialize)]
struct GeminiContent<'a> {
    role: &'a str,
    parts: Vec<GeminiPart<'a>>,
}

#[derive(Serialize)]
struct GeminiPart<'a> {
    text: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest<'a> {
    contents: Vec<GeminiContent<'a>>,
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerationConfig {
    response_modalities: Vec<String>,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: GeminiResponseContent,
}

#[derive(Deserialize)]
struct GeminiResponseContent {
    parts: Vec<GeminiResponsePart>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiResponsePart {
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    inline_data: Option<GeminiInlineData>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiInlineData {
    mime_type: String,
    data: String, // Base64 encoded
}

impl ImageProviderAdapter for GoogleGeminiAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        base_url.trim_end_matches('/').to_string()
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &[]
    }

    fn headers(
        &self,
        _api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".into(), "application/json".into());

        if let Some(extra) = extra {
            for (k, v) in extra.iter() {
                headers.insert(k.clone(), v.clone());
            }
        }

        headers
    }

    fn body(&self, request: &ImageGenerationRequest) -> Value {
        let content = GeminiContent {
            role: "user",
            parts: vec![GeminiPart {
                text: &request.prompt,
            }],
        };

        let req = GeminiRequest {
            contents: vec![content],
            generation_config: Some(GeminiGenerationConfig {
                response_modalities: vec!["TEXT".to_string(), "IMAGE".to_string()],
            }),
        };

        serde_json::to_value(req).unwrap_or_else(|_| json!({}))
    }

    fn parse_response(&self, response: Value) -> Result<Vec<ImageResponseData>, String> {
        let gemini_response: GeminiResponse = serde_json::from_value(response)
            .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to parse response: {}", e)))?;

        if gemini_response.candidates.is_empty() {
            return Err(crate::utils::err_msg(module_path!(), line!(), "No candidates in response"));
        }

        let mut images = Vec::new();
        for candidate in &gemini_response.candidates {
            let text = candidate.content.parts.first().and_then(|p| p.text.clone());
            let mut image_data_found = false;

            for part in &candidate.content.parts {
                if let Some(inline_data) = &part.inline_data {
                    let data_url =
                        format!("data:{};base64,{}", inline_data.mime_type, inline_data.data);
                    images.push(ImageResponseData {
                        url: None,
                        b64_json: Some(data_url),
                        text: text.clone(),
                    });
                    image_data_found = true;
                }
            }

            if !image_data_found {
                if let Some(t) = text {
                    images.push(ImageResponseData {
                        url: None,
                        b64_json: None,
                        text: Some(t),
                    });
                }
            }
        }

        if images.is_empty() {
            return Err(crate::utils::err_msg(module_path!(), line!(), "No images found in response"));
        }

        Ok(images)
    }
}
