use tauri::AppHandle;

use crate::chat_manager::provider_adapter::{adapter_for, ModelInfo};
use crate::storage_manager::providers::get_provider_credential;
use crate::utils::{log_error, log_info};

#[tauri::command]
pub async fn get_remote_models(
    app: AppHandle,
    credential_id: String,
) -> Result<Vec<ModelInfo>, String> {
    log_info(
        &app,
        "get_remote_models",
        format!("Fetching models for credential_id={}", credential_id),
    );

    // 1. Fetch credential
    let credential = get_provider_credential(&app, &credential_id)?;
    if credential.provider_id == "llamacpp" {
        return Ok(Vec::new());
    }

    // 2. Get adapter and endpoint
    let adapter = adapter_for(&credential);
    // Use the credential's base_url or default
    let base_url = credential.base_url.clone().unwrap_or_else(|| {
        crate::providers::config::resolve_base_url(
            &crate::chat_manager::types::ProviderId(credential.provider_id.clone()),
            None,
        )
    });

    let url = adapter.list_models_endpoint(&base_url);
    log_info(&app, "get_remote_models", format!("Endpoint: {}", url));

    // 3. Prepare request
    let api_key = credential.api_key.as_deref().unwrap_or("");
    let headers = adapter.headers(api_key, None);

    let client = reqwest::Client::new();
    let mut req_builder = client.get(&url);

    for (k, v) in headers {
        req_builder = req_builder.header(k, v);
    }

    // 4. Send request
    log_info(
        &app,
        "get_remote_models",
        format!("Sending request to {}", url),
    );
    let resp = req_builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        log_error(
            &app,
            "get_remote_models",
            format!("Error {}: {}", status, text),
        );
        return Err(format!("Provider returned error {}: {}", status, text));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    // 5. Parse response
    let models = adapter.parse_models_list(json);
    log_info(
        &app,
        "get_remote_models",
        format!("Found {} models", models.len()),
    );

    Ok(models)
}
