use crate::api::{api_request, ApiRequest};
use crate::models::ModelPricing;
use crate::pricing_cache;
use crate::utils::log_backend;
use std::collections::HashMap;
use tauri::AppHandle;

/// Fetch pricing for OpenRouter models using the endpoints endpoint
pub async fn fetch_openrouter_model_pricing(
    app: AppHandle,
    api_key: &str,
    model_id: &str,
) -> Result<Option<ModelPricing>, String> {
    if model_id.contains(":free") {
        log_backend(
            &app,
            "cost_calculator",
            format!("Skipping free model: {}", model_id),
        );
        return Ok(None);
    }

    if let Ok(Some(cached)) = pricing_cache::get_cached_pricing(&app, model_id) {
        log_backend(
            &app,
            "cost_calculator",
            format!("Using cached pricing for {}", model_id),
        );
        return Ok(Some(cached));
    }

    log_backend(
        &app,
        "cost_calculator",
        format!("Fetching pricing for OpenRouter model: {}", model_id),
    );

    let request = ApiRequest {
        url: format!("https://openrouter.ai/api/v1/models/{}/endpoints", model_id),
        method: Some("GET".to_string()),
        headers: Some({
            let mut h = HashMap::new();
            h.insert("Authorization".to_string(), format!("Bearer {}", api_key));
            h
        }),
        query: None,
        body: None,
        timeout_ms: Some(30_000),
        stream: None,
        request_id: None,
        provider_id: Some("openrouter".to_string()),
    };

    match api_request(app.clone(), request).await {
        Ok(response) => {
            if !response.ok {
                log_backend(
                    &app,
                    "cost_calculator",
                    format!(
                        "Failed to fetch OpenRouter model endpoints: status {}",
                        response.status
                    ),
                );
                return Err(format!("OpenRouter API error: {}", response.status));
            }

            if let Ok(data) = serde_json::from_value::<serde_json::Value>(response.data.clone()) {
                if let Some(endpoints_array) = data
                    .get("data")
                    .and_then(|d| d.get("endpoints"))
                    .and_then(|e| e.as_array())
                {
                    if let Some(pricing) = get_cheapest_endpoint_pricing(endpoints_array) {
                        let _ = pricing_cache::cache_model_pricing(
                            &app,
                            model_id,
                            Some(pricing.clone()),
                        );

                        log_backend(
                            &app,
                            "cost_calculator",
                            format!(
                                "Found pricing for {}: prompt={} completion={}",
                                model_id, pricing.prompt, pricing.completion
                            ),
                        );

                        return Ok(Some(pricing));
                    }
                }
            }

            log_backend(
                &app,
                "cost_calculator",
                format!(
                    "No pricing found for model {} in OpenRouter API response",
                    model_id
                ),
            );

            Ok(None)
        }
        Err(err) => {
            log_backend(
                &app,
                "cost_calculator",
                format!("Failed to fetch OpenRouter pricing: {}", err),
            );
            Err(err)
        }
    }
}

/// Extract cheapest endpoint pricing from endpoints array
/// Prioritizes: lowest cost > highest uptime > first available
fn get_cheapest_endpoint_pricing(endpoints: &[serde_json::Value]) -> Option<ModelPricing> {
    let mut best_endpoint: Option<(f64, f64, &serde_json::Value)> = None;

    for endpoint in endpoints {
        if let Some(pricing_obj) = endpoint.get("pricing") {
            let prompt_str = extract_pricing_value(pricing_obj.get("prompt"));
            let completion_str = extract_pricing_value(pricing_obj.get("completion"));

            if let (Some(prompt_str), Some(completion_str)) = (prompt_str, completion_str) {
                if let (Ok(prompt_price), Ok(completion_price)) =
                    (prompt_str.parse::<f64>(), completion_str.parse::<f64>())
                {
                    let total_price = prompt_price + completion_price;

                    let is_better = match &best_endpoint {
                        None => true,
                        Some((best_total, _, _)) => total_price < *best_total * 0.99,
                    };

                    if is_better {
                        best_endpoint = Some((total_price, prompt_price, endpoint));
                    }
                }
            }
        }
    }

    // Extract pricing from best endpoint
    best_endpoint.and_then(|(_, _, endpoint)| {
        if let Some(pricing_obj) = endpoint.get("pricing") {
            let prompt = extract_pricing_value(pricing_obj.get("prompt"))?;
            let completion = extract_pricing_value(pricing_obj.get("completion"))?;

            Some(ModelPricing {
                prompt,
                completion,
                request: extract_pricing_value(pricing_obj.get("request"))
                    .unwrap_or_else(|| "0".to_string()),
                image: extract_pricing_value(pricing_obj.get("image"))
                    .unwrap_or_else(|| "0".to_string()),
                web_search: extract_pricing_value(pricing_obj.get("web_search"))
                    .unwrap_or_else(|| "0".to_string()),
                internal_reasoning: extract_pricing_value(pricing_obj.get("internal_reasoning"))
                    .unwrap_or_else(|| "0".to_string()),
            })
        } else {
            None
        }
    })
}

fn extract_pricing_value(value: Option<&serde_json::Value>) -> Option<String> {
    value.and_then(|v: &serde_json::Value| {
        if let Some(s) = v.as_str() {
            return Some(s.to_string());
        }
        if let Some(n) = v.as_f64() {
            return Some(n.to_string());
        }
        if let Some(n) = v.as_i64() {
            return Some(n.to_string());
        }
        None
    })
}

/// Get pricing for a model (with fallback for non-OpenRouter)
pub async fn get_model_pricing(
    app: AppHandle,
    provider_id: &str,
    model_id: &str,
    api_key: Option<&str>,
) -> Result<Option<ModelPricing>, String> {
    match provider_id {
        "openrouter" => {
            if let Some(key) = api_key {
                fetch_openrouter_model_pricing(app, key, model_id).await
            } else {
                log_backend(
                    &app,
                    "cost_calculator",
                    "No API key for OpenRouter pricing lookup",
                );
                Ok(None)
            }
        }
        _ => {
            log_backend(
                &app,
                "cost_calculator",
                format!("Pricing not supported for provider: {}", provider_id),
            );
            Ok(None)
        }
    }
}
