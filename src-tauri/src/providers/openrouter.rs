use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenRouterModel {
    pub id: String,
    pub name: String,
    pub architecture: OpenRouterArchitecture,
    pub model_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenRouterArchitecture {
    pub input_modalities: Vec<String>,
    pub output_modalities: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenRouterApiResponse {
    data: Vec<OpenRouterApiModel>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenRouterApiModel {
    id: String,
    name: String,
    architecture: OpenRouterArchitecture,
}

#[tauri::command]
pub async fn get_openrouter_models(_app: AppHandle) -> Result<Vec<OpenRouterModel>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch OpenRouter models: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("OpenRouter API error: {}", response.status()));
    }

    let api_response: OpenRouterApiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenRouter response: {}", e))?;

    let models = api_response
        .data
        .into_iter()
        .map(|m| {
            let has_text_input = m
                .architecture
                .input_modalities
                .contains(&"text".to_string());
            let has_image_input = m
                .architecture
                .input_modalities
                .contains(&"image".to_string());
            let has_image_output = m
                .architecture
                .output_modalities
                .contains(&"image".to_string());

            let model_type = if has_text_input && has_image_input {
                "multimodel"
            } else if has_image_output {
                "imagegeneration"
            } else {
                "chat"
            };

            OpenRouterModel {
                id: m.id,
                name: m.name,
                architecture: m.architecture,
                model_type: model_type.to_string(),
            }
        })
        .collect();

    Ok(models)
}
