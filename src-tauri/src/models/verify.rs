use crate::{secrets, storage_manager};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyModelResponse {
    pub provider_id: String,
    pub credential_id: String,
    pub model: String,
    pub exists: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn verify_model_exists(
    app: tauri::AppHandle,
    provider_id: String,
    credential_id: String,
    model: String,
) -> Result<VerifyModelResponse, String> {
    // Only verify for OpenAI / Anthropic. Others pass.
    if provider_id != "openai" && provider_id != "anthropic" {
        return Ok(VerifyModelResponse {
            provider_id,
            credential_id,
            model,
            exists: true,
            error: None,
        });
    }

    // Load settings to find baseUrl.
    let settings_json = match storage_manager::internal_read_settings(&app)? {
        None => Value::Null,
        Some(txt) => serde_json::from_str::<Value>(&txt).map_err(|e| e.to_string())?,
    };
    let mut base_url: Option<String> = None;
    if let Some(creds) = settings_json
        .get("providerCredentials")
        .and_then(|v| v.as_array())
    {
        for cred in creds {
            if cred.get("id").and_then(|v| v.as_str()) == Some(&credential_id) {
                base_url = cred
                    .get("baseUrl")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                break;
            }
        }
    }

    // Retrieve API key value.
    let api_key = match secrets::internal_secret_for_cred_get(
        &app,
        provider_id.clone(),
        credential_id.clone(),
        "apiKey".to_string(),
    )? {
        Some(k) => k,
        None => {
            return Ok(VerifyModelResponse {
                provider_id,
                credential_id,
                model,
                exists: false,
                error: Some("Missing API key".into()),
            });
        }
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let (url, headers) = if provider_id == "openai" {
        let base = base_url.unwrap_or_else(|| "https://api.openai.com".to_string());
        let mut h = reqwest::header::HeaderMap::new();
        h.insert(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", api_key).parse().unwrap(),
        );
        (format!("{}/v1/models", base.trim_end_matches('/')), h)
    } else {
        // anthropic
        let base = base_url.unwrap_or_else(|| "https://api.anthropic.com".to_string());
        let mut h = reqwest::header::HeaderMap::new();
        h.insert(
            reqwest::header::HeaderName::from_static("x-api-key"),
            api_key.parse().unwrap(),
        );
        h.insert(
            reqwest::header::HeaderName::from_static("anthropic-version"),
            "2023-06-01".parse().unwrap(),
        );
        (format!("{}/v1/models", base.trim_end_matches('/')), h)
    };

    let resp = match client.get(&url).headers(headers).send().await {
        Ok(r) => r,
        Err(e) => {
            return Ok(VerifyModelResponse {
                provider_id,
                credential_id,
                model,
                exists: false,
                error: Some(format!("request error: {}", e)),
            });
        }
    };

    if !resp.status().is_success() {
        return Ok(VerifyModelResponse {
            provider_id,
            credential_id,
            model,
            exists: false,
            error: Some(format!("HTTP {}", resp.status())),
        });
    }

    let json: Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            return Ok(VerifyModelResponse {
                provider_id,
                credential_id,
                model,
                exists: false,
                error: Some(format!("invalid json: {}", e)),
            });
        }
    };

    let mut exists = false;
    if let Some(arr) = json.get("data").and_then(|v| v.as_array()) {
        for item in arr {
            if item.get("id").and_then(|v| v.as_str()) == Some(model.as_str()) {
                exists = true;
                break;
            }
        }
    }

    Ok(VerifyModelResponse {
        provider_id,
        credential_id,
        model,
        exists,
        error: if exists {
            None
        } else {
            Some("Model not found".into())
        },
    })
}
