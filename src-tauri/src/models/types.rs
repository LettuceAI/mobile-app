use serde::{Deserialize, Serialize};

/// Pricing information for a model (values are USD costs expressed as strings).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPricing {
    /// Price per 1k input tokens
    pub prompt: String,
    /// Price per 1k output tokens
    pub completion: String,
    /// Price per request
    #[serde(default)]
    pub request: String,
    /// Price per image
    #[serde(default)]
    pub image: String,
    /// Price per web search
    #[serde(default)]
    pub web_search: String,
    /// Price per internal reasoning token
    #[serde(default)]
    pub internal_reasoning: String,
}

/// Cost calculation result for a single request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestCost {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    /// Cost for prompt tokens
    pub prompt_cost: f64,
    /// Cost for completion tokens
    pub completion_cost: f64,
    /// Total cost in USD
    pub total_cost: f64,
}
