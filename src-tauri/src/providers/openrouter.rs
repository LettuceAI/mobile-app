use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenRouterModel {
    pub id: String,
    pub name: String,
    pub architecture: OpenRouterArchitecture,
    pub input_scopes: Vec<String>,
    pub output_scopes: Vec<String>,
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
        .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to fetch OpenRouter models: {}", e)))?;

    if !response.status().is_success() {
        return Err(crate::utils::err_msg(module_path!(), line!(), format!("OpenRouter API error: {}", response.status())));
    }

    let api_response: OpenRouterApiResponse = response
        .json()
        .await
        .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to parse OpenRouter response: {}", e)))?;

    let models = api_response
        .data
        .into_iter()
        .map(|m| {
            let mut input_scopes = m.architecture.input_modalities.clone();
            if !input_scopes.iter().any(|s| s.eq_ignore_ascii_case("text")) {
                input_scopes.push("text".to_string());
            }
            let mut output_scopes = m.architecture.output_modalities.clone();
            if !output_scopes.iter().any(|s| s.eq_ignore_ascii_case("text")) {
                output_scopes.push("text".to_string());
            }

            OpenRouterModel {
                id: m.id,
                name: m.name,
                architecture: m.architecture,
                input_scopes,
                output_scopes,
            }
        })
        .collect();

    Ok(models)
}
