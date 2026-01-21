use crate::models::pricing::{
    calculate_request_cost as calc_cost_internal,
    fetch_openrouter_model_pricing as fetch_openrouter_pricing_internal,
    get_model_pricing as get_model_pricing_internal,
};
use crate::models::{ModelPricing, RequestCost};
use tauri::AppHandle;

pub fn calculate_request_cost(
    prompt_tokens: u64,
    completion_tokens: u64,
    pricing: &ModelPricing,
) -> Option<RequestCost> {
    calc_cost_internal(prompt_tokens, completion_tokens, pricing)
}

/// Extract cheapest endpoint pricing from endpoints array
/// Prioritizes: lowest cost > highest uptime > first available
#[allow(dead_code)]
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
                        Some((best_total, _, _)) => {
                            total_price < *best_total * 0.99 // 1% threshold to avoid floating point issues
                        }
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

#[allow(dead_code)]
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

/// Fetch pricing for OpenRouter models using the endpoints endpoint
#[allow(dead_code)]
pub async fn fetch_openrouter_model_pricing(
    app: AppHandle,
    api_key: &str,
    model_id: &str,
) -> Result<Option<ModelPricing>, String> {
    fetch_openrouter_pricing_internal(app, api_key, model_id).await
}

/// Get pricing for a model (with fallback for non-OpenRouter)
pub async fn get_model_pricing(
    app: AppHandle,
    provider_id: &str,
    model_id: &str,
    api_key: Option<&str>,
) -> Result<Option<ModelPricing>, String> {
    get_model_pricing_internal(app, provider_id, model_id, api_key).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_request_cost() {
        // OpenRouter pricing is per token, not per 1K tokens
        // Example: Claude Sonnet 4 pricing
        let pricing = ModelPricing {
            prompt: "0.000003".to_string(),     // $3 per million tokens
            completion: "0.000015".to_string(), // $15 per million tokens
            request: "0".to_string(),
            image: "0".to_string(),
            web_search: "0".to_string(),
            internal_reasoning: "0".to_string(),
        };

        let cost = calculate_request_cost(1000, 500, &pricing).unwrap();

        assert_eq!(cost.prompt_tokens, 1000);
        assert_eq!(cost.completion_tokens, 500);
        assert_eq!(cost.total_tokens, 1500);

        // 1000 tokens * 0.000003 = 0.003
        assert!((cost.prompt_cost - 0.003).abs() < 0.0001);

        // 500 tokens * 0.000015 = 0.0075
        assert!((cost.completion_cost - 0.0075).abs() < 0.0001);

        // Total should be 0.0105
        assert!((cost.total_cost - 0.0105).abs() < 0.0001);
    }
}
