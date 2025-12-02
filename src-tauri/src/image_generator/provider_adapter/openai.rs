use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

use super::{ImageProviderAdapter, ImageResponseData};
use crate::image_generator::types::ImageGenerationRequest;

pub struct OpenAIAdapter;

#[derive(Serialize)]
struct DalleRequest<'a> {
    model: &'a str,
    prompt: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    n: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    quality: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    style: Option<&'a str>,
    response_format: &'a str,
}

#[derive(Deserialize)]
struct OpenAIImageResponse {
    data: Vec<OpenAIImageData>,
}

#[derive(Deserialize)]
struct OpenAIImageData {
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    b64_json: Option<String>,
}

impl ImageProviderAdapter for OpenAIAdapter {
    fn endpoint(&self, base_url: &str) -> String {
        let trimmed = base_url.trim_end_matches('/');
        if trimmed.ends_with("/v1") {
            format!("{}/images/generations", trimmed)
        } else {
            format!("{}/v1/images/generations", trimmed)
        }
    }

    fn required_auth_headers(&self) -> &'static [&'static str] {
        &["Authorization"]
    }

    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("Authorization".into(), format!("Bearer {}", api_key));
        headers.insert("Content-Type".into(), "application/json".into());

        if let Some(extra) = extra {
            for (k, v) in extra.iter() {
                headers.insert(k.clone(), v.clone());
            }
        }

        headers
    }

    fn body(&self, request: &ImageGenerationRequest) -> Value {
        let dalle_req = DalleRequest {
            model: &request.model,
            prompt: &request.prompt,
            n: request.n.or(Some(1)),
            size: request.size.as_deref(),
            quality: request.quality.as_deref(),
            style: request.style.as_deref(),
            response_format: "url",
        };

        serde_json::to_value(dalle_req).unwrap_or_else(|_| json!({}))
    }

    fn parse_response(&self, response: Value) -> Result<Vec<ImageResponseData>, String> {
        let openai_response: OpenAIImageResponse = serde_json::from_value(response)
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(openai_response
            .data
            .into_iter()
            .map(|img| ImageResponseData {
                url: img.url,
                b64_json: img.b64_json,
                text: None,
            })
            .collect())
    }
}
