use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION};
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

use crate::{secrets, storage_manager, utils::log_backend};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyProviderApiKeyResult {
    pub provider_id: String,
    pub valid: bool,
    pub status: Option<u16>,
    pub error: Option<String>,
    pub details: Option<Value>,
}

fn default_base_url(provider_id: &str) -> Option<&'static str> {
    match provider_id {
        "openai" => Some("https://api.openai.com"),
        "anthropic" => Some("https://api.anthropic.com"),
        "openrouter" => Some("https://openrouter.ai/api"),
        _ => None,
    }
}

fn resolve_base_url(
    app: &tauri::AppHandle,
    provider_id: &str,
    base_override: Option<String>,
    credential_id: Option<&str>,
) -> Result<String, String> {
    if let Some(explicit) = base_override.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }) {
        return Ok(explicit);
    }

    if let Some(cred_id) = credential_id {
        if let Some(raw) = storage_manager::internal_read_settings(app)? {
            if let Ok(json) = serde_json::from_str::<Value>(&raw) {
                if let Some(creds) = json.get("providerCredentials").and_then(|v| v.as_array()) {
                    for cred in creds {
                        if cred.get("id").and_then(|v| v.as_str()) == Some(cred_id) {
                            if let Some(base) = cred
                                .get("baseUrl")
                                .and_then(|v| v.as_str())
                                .map(|s| s.trim())
                                .filter(|s| !s.is_empty())
                            {
                                return Ok(base.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    default_base_url(provider_id)
        .map(|url| url.to_string())
        .ok_or_else(|| format!("Unsupported provider {}", provider_id))
}

fn extract_error_message(payload: &Value) -> Option<String> {
    if let Some(error) = payload.get("error") {
        match error {
            Value::String(s) => Some(s.clone()),
            Value::Object(map) => {
                if let Some(Value::String(message)) = map.get("message") {
                    Some(message.clone())
                } else if let Some(Value::String(typ)) = map.get("type") {
                    Some(typ.clone())
                } else {
                    Some(error.to_string())
                }
            }
            other => Some(other.to_string()),
        }
    } else if let Some(Value::String(message)) = payload.get("message") {
        Some(message.clone())
    } else {
        None
    }
}

fn build_headers(provider_id: &str, api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", api_key))
            .map_err(|e| format!("invalid authorization header: {e}"))?,
    );
    headers.insert(
        reqwest::header::ACCEPT,
        HeaderValue::from_static("application/json"),
    );

    if provider_id == "anthropic" {
        headers.insert(
            HeaderName::from_static("anthropic-version"),
            HeaderValue::from_static("2023-06-01"),
        );
        headers.insert(
            HeaderName::from_static("x-api-key"),
            HeaderValue::from_str(api_key).map_err(|e| format!("invalid x-api-key header: {e}"))?,
        );
    }

    Ok(headers)
}

fn build_url(provider_id: &str, base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    match provider_id {
        "openrouter" => format!("{}/v1/key", trimmed),
        _ => format!("{}/v1/models", trimmed),
    }
}

#[tauri::command]
pub async fn verify_provider_api_key(
    app: tauri::AppHandle,
    provider_id: String,
    credential_id: Option<String>,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<VerifyProviderApiKeyResult, String> {
    if !matches!(provider_id.as_str(), "openai" | "anthropic" | "openrouter") {
        return Ok(VerifyProviderApiKeyResult {
            provider_id,
            valid: true,
            status: None,
            error: None,
            details: None,
        });
    }

    log_backend(
        &app,
        "verify_provider_api_key",
        format!(
            "start provider={} credential={:?}",
            provider_id, credential_id
        ),
    );

    let provided_key = api_key.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    let resolved_key = if let Some(key) = provided_key {
        key
    } else if let Some(ref cred_id) = credential_id {
        secrets::internal_secret_for_cred_get(
            &app,
            provider_id.clone(),
            cred_id.clone(),
            "apiKey".into(),
        )?
        .and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .ok_or_else(|| "Missing API key".to_string())?
    } else {
        return Ok(VerifyProviderApiKeyResult {
            provider_id,
            valid: false,
            status: None,
            error: Some("Missing API key".into()),
            details: None,
        });
    };

    let base = match resolve_base_url(
        &app,
        &provider_id,
        base_url.clone(),
        credential_id.as_deref(),
    ) {
        Ok(url) => url,
        Err(err) => {
            return Ok(VerifyProviderApiKeyResult {
                provider_id,
                valid: false,
                status: None,
                error: Some(err),
                details: None,
            });
        }
    };

    let headers = match build_headers(&provider_id, &resolved_key) {
        Ok(h) => h,
        Err(err) => {
            return Ok(VerifyProviderApiKeyResult {
                provider_id,
                valid: false,
                status: None,
                error: Some(err),
                details: None,
            });
        }
    };

    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = build_url(&provider_id, &base);

    let response = match client.get(&url).headers(headers).send().await {
        Ok(resp) => resp,
        Err(err) => {
            log_backend(
                &app,
                "verify_provider_api_key",
                format!("request error provider={} err={}", provider_id, err),
            );
            return Ok(VerifyProviderApiKeyResult {
                provider_id,
                valid: false,
                status: None,
                error: Some(format!("request error: {}", err)),
                details: None,
            });
        }
    };

    let status = response.status();
    let status_code = status.as_u16();
    let body_text = match response.text().await {
        Ok(text) => text,
        Err(err) => {
            return Ok(VerifyProviderApiKeyResult {
                provider_id,
                valid: false,
                status: Some(status_code),
                error: Some(format!("failed to read response: {}", err)),
                details: None,
            });
        }
    };

    let parsed_json = if body_text.trim().is_empty() {
        None
    } else {
        serde_json::from_str::<Value>(&body_text).ok()
    };

    if status.is_success() {
        log_backend(
            &app,
            "verify_provider_api_key",
            format!("success provider={} status={}", provider_id, status_code),
        );
        return Ok(VerifyProviderApiKeyResult {
            provider_id,
            valid: true,
            status: Some(status_code),
            error: None,
            details: None,
        });
    }

    let error_message = parsed_json
        .as_ref()
        .and_then(|payload| extract_error_message(payload))
        .or_else(|| {
            if body_text.is_empty() {
                None
            } else {
                Some(body_text.clone())
            }
        });

    log_backend(
        &app,
        "verify_provider_api_key",
        format!(
            "failure provider={} status={} error={:?}",
            provider_id, status_code, error_message
        ),
    );

    Ok(VerifyProviderApiKeyResult {
        provider_id,
        valid: false,
        status: Some(status_code),
        error: error_message,
        details: parsed_json,
    })
}
