use serde_json::Value;
use std::collections::HashMap;

use super::types::ImageGenerationRequest;

pub mod google_gemini;
pub mod openai;
pub mod openrouter;

pub trait ImageProviderAdapter: Send + Sync {
    fn endpoint(&self, base_url: &str) -> String;
    #[allow(dead_code)]
    fn required_auth_headers(&self) -> &'static [&'static str];
    fn headers(
        &self,
        api_key: &str,
        extra: Option<&HashMap<String, String>>,
    ) -> HashMap<String, String>;

    fn body(&self, request: &ImageGenerationRequest) -> Value;
    fn parse_response(&self, response: Value) -> Result<Vec<ImageResponseData>, String>;

    #[allow(dead_code)]
    fn supports_stream(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone)]
pub struct ImageResponseData {
    pub url: Option<String>,
    pub b64_json: Option<String>,
    pub text: Option<String>,
}

pub fn get_adapter(provider_id: &str) -> Result<Box<dyn ImageProviderAdapter>, String> {
    match provider_id {
        "openai" => Ok(Box::new(openai::OpenAIAdapter)),
        "openrouter" => Ok(Box::new(openrouter::OpenRouterAdapter)),
        "gemini" => Ok(Box::new(google_gemini::GoogleGeminiAdapter)),
        _ => Err(format!(
            "Provider {} does not support image generation",
            provider_id
        )),
    }
}
