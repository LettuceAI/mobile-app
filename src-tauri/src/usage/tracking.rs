use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::models::RequestCost;

/// Individual request/message usage tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestUsage {
    pub id: String,             // Unique request ID
    pub timestamp: u64,         // Unix timestamp in milliseconds
    pub session_id: String,     // Which session this belongs to
    pub character_id: String,   // Which character
    pub character_name: String, // Character name for display
    pub model_id: String,       // Which model
    pub model_name: String,     // Model name for display
    pub provider_id: String,    // Which provider (openai, anthropic, openrouter, etc)
    pub provider_label: String, // Provider label for display

    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
    pub total_tokens: Option<u64>,

    pub cost: Option<RequestCost>, // Calculated cost (only for OpenRouter for now)

    pub success: bool,
    pub error_message: Option<String>, // Error message if failed

    #[serde(default)]
    pub metadata: HashMap<String, String>, // Additional metadata
}

/// Summary statistics for usage tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub average_cost_per_request: f64,
    pub by_provider: HashMap<String, ProviderStats>,
    pub by_model: HashMap<String, ModelStats>,
    pub by_character: HashMap<String, CharacterStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStats {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub total_tokens: u64,
    pub total_cost: f64,
}

impl ProviderStats {
    pub fn empty() -> Self {
        Self {
            total_requests: 0,
            successful_requests: 0,
            total_tokens: 0,
            total_cost: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStats {
    pub provider_id: String,
    pub total_requests: u64,
    pub successful_requests: u64,
    pub total_tokens: u64,
    pub total_cost: f64,
}

impl ModelStats {
    pub fn empty(provider_id: &str) -> Self {
        Self {
            provider_id: provider_id.to_string(),
            total_requests: 0,
            successful_requests: 0,
            total_tokens: 0,
            total_cost: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterStats {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub total_tokens: u64,
    pub total_cost: f64,
}

impl CharacterStats {
    pub fn empty() -> Self {
        Self {
            total_requests: 0,
            successful_requests: 0,
            total_tokens: 0,
            total_cost: 0.0,
        }
    }
}

/// Filter for querying usage records
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageFilter {
    pub start_timestamp: Option<u64>, // From date
    pub end_timestamp: Option<u64>,   // To date
    pub provider_id: Option<String>,  // Filter by provider
    pub model_id: Option<String>,     // Filter by model
    pub character_id: Option<String>, // Filter by character
    pub session_id: Option<String>,   // Filter by session
    pub success_only: Option<bool>,   // Only successful requests
}
