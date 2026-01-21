use crate::models::{ModelPricing, RequestCost};

/// Calculate the cost for a request based on token counts and pricing.
///
/// Note: OpenRouter pricing is returned as cost **per token**, not per 1K tokens.
/// For example, Claude Sonnet 4 pricing:
/// - prompt: "0.000003" = $0.000003 per token = $3 per million tokens
/// - completion: "0.000015" = $0.000015 per token = $15 per million tokens
pub fn calculate_request_cost(
    prompt_tokens: u64,
    completion_tokens: u64,
    pricing: &ModelPricing,
) -> Option<RequestCost> {
    let prompt_price_per_token = pricing.prompt.parse::<f64>().ok()?;
    let completion_price_per_token = pricing.completion.parse::<f64>().ok()?;

    // Pricing is per token, so multiply directly
    let prompt_cost = prompt_tokens as f64 * prompt_price_per_token;
    let completion_cost = completion_tokens as f64 * completion_price_per_token;
    let total_cost = prompt_cost + completion_cost;

    Some(RequestCost {
        prompt_tokens,
        completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
        prompt_cost,
        completion_cost,
        total_cost,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ModelPricing;

    #[test]
    fn test_calculate_request_cost_claude_sonnet() {
        // Claude Sonnet 4 pricing from OpenRouter
        let pricing = ModelPricing {
            prompt: "0.000003".to_string(),     // $3 per million tokens
            completion: "0.000015".to_string(), // $15 per million tokens
            request: "0".to_string(),
            image: "0".to_string(),
            web_search: "0".to_string(),
            internal_reasoning: "0".to_string(),
        };

        // 500K input + 178K output ≈ what user reported
        let cost = calculate_request_cost(500_000, 178_000, &pricing).unwrap();

        // Expected: 500000 * 0.000003 + 178000 * 0.000015 = 1.5 + 2.67 = 4.17
        assert!((cost.prompt_cost - 1.5).abs() < 0.001);
        assert!((cost.completion_cost - 2.67).abs() < 0.001);
        assert!((cost.total_cost - 4.17).abs() < 0.01);
        assert_eq!(cost.total_tokens, 678_000);
    }

    #[test]
    fn test_calculate_request_cost_small_request() {
        let pricing = ModelPricing {
            prompt: "0.000003".to_string(),
            completion: "0.000015".to_string(),
            request: "0".to_string(),
            image: "0".to_string(),
            web_search: "0".to_string(),
            internal_reasoning: "0".to_string(),
        };

        // 1000 input + 500 output
        let cost = calculate_request_cost(1000, 500, &pricing).unwrap();

        // Expected: 1000 * 0.000003 + 500 * 0.000015 = 0.003 + 0.0075 = 0.0105
        assert!((cost.prompt_cost - 0.003).abs() < 0.0001);
        assert!((cost.completion_cost - 0.0075).abs() < 0.0001);
        assert!((cost.total_cost - 0.0105).abs() < 0.0001);
    }

    #[test]
    fn test_calculate_request_cost_free_model() {
        let pricing = ModelPricing {
            prompt: "0".to_string(),
            completion: "0".to_string(),
            request: "0".to_string(),
            image: "0".to_string(),
            web_search: "0".to_string(),
            internal_reasoning: "0".to_string(),
        };

        let cost = calculate_request_cost(100_000, 50_000, &pricing).unwrap();

        assert_eq!(cost.prompt_cost, 0.0);
        assert_eq!(cost.completion_cost, 0.0);
        assert_eq!(cost.total_cost, 0.0);
    }

    #[test]
    fn test_calculate_request_cost_invalid_pricing() {
        let pricing = ModelPricing {
            prompt: "invalid".to_string(),
            completion: "0.000015".to_string(),
            request: "0".to_string(),
            image: "0".to_string(),
            web_search: "0".to_string(),
            internal_reasoning: "0".to_string(),
        };

        let cost = calculate_request_cost(1000, 500, &pricing);
        assert!(cost.is_none());
    }
}
