use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub default_base_url: String,
    pub api_endpoint_path: String,
    pub system_role: String,
    pub default_headers: HashMap<String, String>,
}

#[tauri::command]
pub fn get_provider_configs() -> Vec<ProviderConfig> {
    get_all_provider_configs_internal()
}

fn get_all_provider_configs_internal() -> Vec<ProviderConfig> {
    vec![
        ProviderConfig {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            default_base_url: "https://api.openai.com".to_string(),
            api_endpoint_path: "/v1/chat/completions".to_string(),
            system_role: "developer".to_string(),
            default_headers: HashMap::new(),
        },
        ProviderConfig {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
            default_base_url: "https://api.anthropic.com".to_string(),
            api_endpoint_path: "/v1/chat/completions".to_string(),
            system_role: "system".to_string(),
            default_headers: HashMap::new(),
        },
        ProviderConfig {
            id: "openrouter".to_string(),
            name: "OpenRouter".to_string(),
            default_base_url: "https://openrouter.ai/api".to_string(),
            api_endpoint_path: "/v1/chat/completions".to_string(),
            system_role: "developer".to_string(),
            default_headers: HashMap::new(),
        },
        ProviderConfig {
            id: "google".to_string(),
            name: "Google".to_string(),
            default_base_url: "https://generativelanguage.googleapis.com".to_string(),
            api_endpoint_path: "/v1/chat/completions".to_string(),
            system_role: "system".to_string(),
            default_headers: HashMap::new(),
        },
        ProviderConfig {
            id: "mistral".to_string(),
            name: "Mistral AI".to_string(),
            default_base_url: "https://api.mistral.ai".to_string(),
            api_endpoint_path: "/v1/chat/completions".to_string(),
            system_role: "system".to_string(),
            default_headers: HashMap::new(),
        },
        ProviderConfig {
            id: "groq".to_string(),
            name: "Groq".to_string(),
            default_base_url: "https://api.groq.com".to_string(),
            api_endpoint_path: "/openai/deployments/default/chat/completions".to_string(),
            system_role: "system".to_string(),
            default_headers: HashMap::new(),
        },
    ]
}

pub fn get_provider_config(provider_id: &str) -> Option<ProviderConfig> {
    get_all_provider_configs_internal()
        .into_iter()
        .find(|p| p.id == provider_id)
}

pub fn resolve_base_url(provider_id: &str, custom_base_url: Option<&str>) -> String {
    if let Some(custom) = custom_base_url {
        if !custom.is_empty() {
            return custom.trim_end_matches('/').to_string();
        }
    }

    get_provider_config(provider_id)
        .map(|cfg| cfg.default_base_url)
        .unwrap_or_else(|| "https://api.openai.com".to_string())
}

#[allow(dead_code)]
pub fn build_endpoint_url(provider_id: &str, custom_base_url: Option<&str>) -> String {
    let base_url = resolve_base_url(provider_id, custom_base_url);
    let trimmed = base_url.trim_end_matches('/');

    // If base_url already contains /v1, don't add it again
    if trimmed.ends_with("/v1") {
        format!("{}/chat/completions", trimmed)
    } else {
        format!("{}/v1/chat/completions", trimmed)
    }
}

pub fn get_system_role(provider_id: &str) -> &'static str {
    match provider_id {
        "openai" | "openrouter" => "developer",
        "mistral" | "groq" => "system",
        _ => "system",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_base_url_with_custom() {
        let result = resolve_base_url("openai", Some("https://custom.com"));
        assert_eq!(result, "https://custom.com");
    }

    #[test]
    fn test_resolve_base_url_default() {
        let result = resolve_base_url("openai", None);
        assert_eq!(result, "https://api.openai.com");
    }

    #[test]
    fn test_build_endpoint_url() {
        let result = build_endpoint_url("openai", None);
        assert_eq!(result, "https://api.openai.com/v1/chat/completions");
    }

    #[test]
    fn test_build_endpoint_url_with_v1_already_in_base() {
        let result = build_endpoint_url("openai", Some("https://custom.com/v1"));
        assert_eq!(result, "https://custom.com/v1/chat/completions");
    }
}
