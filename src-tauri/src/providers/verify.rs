use super::util::{build_headers, build_verify_url, extract_error_message, resolve_base_url};
use crate::{chat_manager::types::ProviderId, utils::log_info};
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyProviderApiKeyResult {
    pub provider_id: String,
    pub valid: bool,
    pub status: Option<u16>,
    pub error: Option<String>,
    pub details: Option<Value>,
}

#[tauri::command]
pub async fn verify_provider_api_key(
    app: tauri::AppHandle,
    provider_id: String,
    credential_id: Option<String>,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<VerifyProviderApiKeyResult, String> {
    let unsupported_providers: &[&str] = &[];

    if unsupported_providers.contains(&provider_id.as_str()) {
        return Ok(VerifyProviderApiKeyResult {
            provider_id,
            valid: true,
            status: None,
            error: None,
            details: None,
        });
    }

    log_info(
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
    } else {
        return Ok(VerifyProviderApiKeyResult {
            provider_id,
            valid: false,
            status: None,
            error: Some("Missing API key".into()),
            details: None,
        });
    };

    let pid: ProviderId = provider_id.clone().into();
    let base = match resolve_base_url(&app, &pid, base_url.clone(), credential_id.as_deref()) {
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

    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let headers = build_headers(&pid, &resolved_key)?;
    let url = build_verify_url(&pid, &base);

    let response = match client.get(&url).headers(headers).send().await {
        Ok(resp) => resp,
        Err(err) => {
            return Ok(VerifyProviderApiKeyResult {
                provider_id,
                valid: false,
                status: None,
                error: Some(err.to_string()),
                details: None,
            });
        }
    };

    let status = response.status().as_u16();
    let json = response.json::<Value>().await.unwrap_or(Value::Null);

    let valid = match status {
        200 => true,
        401 | 403 => false,
        _ => json
            .get("data")
            .and_then(|d| d.as_array())
            .map(|arr| !arr.is_empty())
            .unwrap_or(status == 200),
    };

    Ok(VerifyProviderApiKeyResult {
        provider_id,
        valid,
        status: Some(status),
        error: if valid {
            None
        } else {
            extract_error_message(&json)
        },
        details: if valid { None } else { Some(json) },
    })
}
