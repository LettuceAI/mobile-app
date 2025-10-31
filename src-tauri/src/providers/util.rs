use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, ACCEPT};
use serde_json::Value;
use crate::storage_manager;

/// Default base URL by provider when no credential override exists.
pub fn default_base_url(provider_id: &str) -> Option<&'static str> {
    match provider_id {
        "openai" => Some("https://api.openai.com"),
        "anthropic" => Some("https://api.anthropic.com"),
        "openrouter" => Some("https://openrouter.ai/api"),
        _ => None,
    }
}

/// Resolves a base URL giving precedence to explicit override, then credential settings, then defaults.
pub fn resolve_base_url(
    app: &tauri::AppHandle,
    provider_id: &str,
    base_override: Option<String>,
    credential_id: Option<&str>,
) -> Result<String, String> {
    if let Some(explicit) = base_override.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
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

/// Build standard headers for verification endpoints per provider.
pub fn build_headers(provider_id: &str, api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", api_key))
        .map_err(|e| format!("invalid authorization header: {e}"))?);
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

    if provider_id == "anthropic" {
        headers.insert(HeaderName::from_static("anthropic-version"), HeaderValue::from_static("2023-06-01"));
        headers.insert(HeaderName::from_static("x-api-key"), HeaderValue::from_str(api_key)
            .map_err(|e| format!("invalid x-api-key header: {e}"))?);
    }
    Ok(headers)
}

/// Build a verification URL per provider.
pub fn build_verify_url(provider_id: &str, base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    match provider_id {
        "openrouter" => format!("{}/v1/key", trimmed),
        _ => format!("{}/v1/models", trimmed),
    }
}

/// Attempt to extract an error message from a provider JSON payload.
pub fn extract_error_message(payload: &Value) -> Option<String> {
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
