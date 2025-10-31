use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::chat_manager::provider_adapter::adapter_for;
use crate::chat_manager::types::ProviderId;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub default_base_url: String,
    pub api_endpoint_path: String,
    pub system_role: String,
    pub supports_stream: bool,
    pub required_auth_headers: Vec<String>,
    pub default_headers: HashMap<String, String>,
}

#[tauri::command]
pub fn get_provider_configs() -> Vec<ProviderConfig> {
    get_cached_provider_configs().clone()
}

fn path_from_url(url: &str) -> String {
    // naive extraction of path from a URL without pulling in a URL parser
    if let Some(scheme_idx) = url.find("://") {
        if let Some(path_start) = url[scheme_idx + 3..].find('/') {
            return url[scheme_idx + 3 + path_start..].to_string();
        }
        return "/".to_string();
    }
    // already looks like a path
    url.to_string()
}

fn get_all_provider_configs_internal() -> Vec<ProviderConfig> {
    let base_configs = vec![
        ("openai", "OpenAI", "https://api.openai.com"),
        ("anthropic", "Anthropic", "https://api.anthropic.com"),
        ("openrouter", "OpenRouter", "https://openrouter.ai/api"),
        ("google", "Google", "https://generativelanguage.googleapis.com"),
        ("mistral", "Mistral AI", "https://api.mistral.ai"),
        ("groq", "Groq", "https://api.groq.com"),
    ];

    base_configs
        .into_iter()
        .map(|(id, name, base)| {
            let adapter = adapter_for(&ProviderId(id.to_string()));
            let endpoint_full = adapter.endpoint(base);
            let api_endpoint_path = path_from_url(&endpoint_full);
            let required_auth_headers: Vec<String> = adapter
                .required_auth_headers()
                .iter()
                .map(|s| s.to_string())
                .collect();
            let default_headers = adapter.default_headers_template();
            ProviderConfig {
                id: id.to_string(),
                name: name.to_string(),
                default_base_url: base.to_string(),
                api_endpoint_path,
                system_role: adapter.system_role().to_string(),
                supports_stream: adapter.supports_stream(),
                required_auth_headers,
                default_headers,
            }
        })
        .collect()
}

fn get_cached_provider_configs() -> &'static Vec<ProviderConfig> {
    static CACHE: OnceLock<Vec<ProviderConfig>> = OnceLock::new();
    CACHE.get_or_init(|| get_all_provider_configs_internal())
}

pub fn get_provider_config(provider_id: &ProviderId) -> Option<ProviderConfig> {
    get_cached_provider_configs()
        .iter()
        .cloned()
        .find(|p| p.id == provider_id.0)
}

pub fn resolve_base_url(provider_id: &ProviderId, custom_base_url: Option<&str>) -> String {
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
pub fn build_endpoint_url(provider_id: &ProviderId, custom_base_url: Option<&str>) -> String {
    let base_url = resolve_base_url(provider_id, custom_base_url);
    let trimmed = base_url.trim_end_matches('/');

    // If base_url already contains /v1, don't add it again
    if trimmed.ends_with("/v1") {
        format!("{}/chat/completions", trimmed)
    } else {
        format!("{}/v1/chat/completions", trimmed)
    }
}

#[allow(dead_code)]
pub fn get_system_role(provider_id: &ProviderId) -> &'static str {
    adapter_for(provider_id).system_role()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_base_url_with_custom() {
        let result = resolve_base_url(&ProviderId("openai".into()), Some("https://custom.com"));
        assert_eq!(result, "https://custom.com");
    }

    #[test]
    fn test_resolve_base_url_default() {
        let result = resolve_base_url(&ProviderId("openai".into()), None);
        assert_eq!(result, "https://api.openai.com");
    }

    #[test]
    fn test_build_endpoint_url() {
        let result = build_endpoint_url(&ProviderId("openai".into()), None);
        assert_eq!(result, "https://api.openai.com/v1/chat/completions");
    }

    #[test]
    fn test_build_endpoint_url_with_v1_already_in_base() {
        let result = build_endpoint_url(&ProviderId("openai".into()), Some("https://custom.com/v1"));
        assert_eq!(result, "https://custom.com/v1/chat/completions");
    }
}
