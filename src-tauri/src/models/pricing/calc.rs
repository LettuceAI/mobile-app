use crate::models::{ModelPricing, RequestCost};

pub fn calculate_request_cost(
    prompt_tokens: u64,
    completion_tokens: u64,
    pricing: &ModelPricing,
) -> Option<RequestCost> {
    let prompt_price_per_1k = pricing.prompt.parse::<f64>().ok()?;
    let completion_price_per_1k = pricing.completion.parse::<f64>().ok()?;

    let prompt_cost = (prompt_tokens as f64 / 1000.0) * prompt_price_per_1k;
    let completion_cost = (completion_tokens as f64 / 1000.0) * completion_price_per_1k;
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
