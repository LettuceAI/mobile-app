use tauri::AppHandle;

use crate::chat_manager::types::ProviderId;
use crate::providers::config::resolve_base_url;
use crate::utils::log_info;

use super::provider_adapter::{get_adapter, ImageResponseData};
use super::storage::save_image;
use super::types::{GeneratedImage, ImageGenerationRequest, ImageGenerationResponse};

#[tauri::command]
pub async fn generate_image(
    app: AppHandle,
    request: ImageGenerationRequest,
) -> Result<ImageGenerationResponse, String> {
    log_info(
        &app,
        "image_generator",
        format!("Generating image with model: {}", request.model),
    );

    let provider_cred =
        crate::storage_manager::providers::get_provider_credential(&app, &request.credential_id)?;

    let api_key = provider_cred
        .api_key
        .ok_or_else(|| "API key not found for provider".to_string())?;

    let base_url_opt = provider_cred.base_url.as_deref();
    let headers_map = provider_cred.headers;

    let adapter = get_adapter(&request.provider_id)?;

    let base_url = resolve_base_url(&ProviderId(request.provider_id.clone()), base_url_opt);

    let url = if request.provider_id == "gemini" {
        format!(
            "{}/v1beta/models/{}:generateContent?key={}",
            base_url, request.model, api_key
        )
    } else {
        adapter.endpoint(&base_url)
    };

    let headers = adapter.headers(&api_key, headers_map.as_ref());

    let body = adapter.body(&request);

    log_info(
        &app,
        "image_generator",
        format!("Sending request to: {}", url),
    );

    let client = reqwest::Client::new();
    let mut req_builder = client.post(&url);

    for (key, value) in headers {
        req_builder = req_builder.header(key, value);
    }

    req_builder = req_builder.json(&body);

    let response = req_builder
        .send()
        .await
        .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Request failed: {}", e)))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(crate::utils::err_msg(module_path!(), line!(), format!("API error {}: {}", status, error_text)));
    }

    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to parse response: {}", e)))?;

    log_info(
        &app,
        "image_generator",
        format!("Received response: {:?}", response_json),
    );

    let image_data: Vec<ImageResponseData> = adapter.parse_response(response_json)?;

    let mut generated_images = Vec::new();
    for img_data in image_data {
        let image_source = img_data
            .url
            .as_ref()
            .or(img_data.b64_json.as_ref())
            .ok_or_else(|| "No image URL or data in response".to_string())?;

        let file_path = save_image(&app, image_source, None)?;

        generated_images.push(GeneratedImage {
            file_path,
            url: img_data.url,
            width: None,
            height: None,
            text: img_data.text,
        });
    }

    Ok(ImageGenerationResponse {
        images: generated_images,
        model: request.model,
        provider_id: request.provider_id,
    })
}
