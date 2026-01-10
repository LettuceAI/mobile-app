//! Shared dynamic memory utilities
//!
//! This module provides constants and helper functions for dynamic memory
//! that are shared between chat_manager and group_chat_manager.

use super::types::Settings;

// ============================================================================
// Constants
// ============================================================================

pub const FALLBACK_DYNAMIC_WINDOW: u32 = 20;
pub const FALLBACK_DYNAMIC_MAX_ENTRIES: u32 = 50;
pub const FALLBACK_MIN_SIMILARITY: f32 = 0.35;
pub const FALLBACK_HOT_MEMORY_TOKEN_BUDGET: u32 = 2000;
pub const FALLBACK_DECAY_RATE: f32 = 0.08;
pub const FALLBACK_COLD_THRESHOLD: f32 = 0.3;
pub const MEMORY_ID_SPACE: u64 = 1_000_000;

// ============================================================================
// Settings Helper Functions
// ============================================================================

/// Check if dynamic memory is enabled in settings
pub fn is_dynamic_memory_enabled(settings: &Settings) -> bool {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.enabled)
        .unwrap_or(false)
}

/// Get the summary message interval (window size) from settings
pub fn dynamic_window_size(settings: &Settings) -> usize {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.summary_message_interval.max(1))
        .unwrap_or(FALLBACK_DYNAMIC_WINDOW) as usize
}

/// Get the maximum number of memory entries from settings
pub fn dynamic_max_entries(settings: &Settings) -> usize {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.max_entries.max(1))
        .unwrap_or(FALLBACK_DYNAMIC_MAX_ENTRIES) as usize
}

/// Get the minimum similarity threshold for memory retrieval
pub fn dynamic_min_similarity(settings: &Settings) -> f32 {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.min_similarity_threshold)
        .unwrap_or(FALLBACK_MIN_SIMILARITY)
}

/// Get the hot memory token budget from settings
pub fn dynamic_hot_memory_token_budget(settings: &Settings) -> u32 {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.hot_memory_token_budget)
        .unwrap_or(FALLBACK_HOT_MEMORY_TOKEN_BUDGET)
}

/// Get the decay rate for memory importance scores
pub fn dynamic_decay_rate(settings: &Settings) -> f32 {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.decay_rate)
        .unwrap_or(FALLBACK_DECAY_RATE)
}

/// Get the threshold below which memories are demoted to cold storage
pub fn dynamic_cold_threshold(settings: &Settings) -> f32 {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.cold_threshold)
        .unwrap_or(FALLBACK_COLD_THRESHOLD)
}

/// Check if context enrichment (semantic search) is enabled
pub fn context_enrichment_enabled(settings: &Settings) -> bool {
    settings
        .advanced_settings
        .as_ref()
        .and_then(|a| a.dynamic_memory.as_ref())
        .map(|dm| dm.context_enrichment_enabled)
        .unwrap_or(true) // Default to enabled
}

// ============================================================================
// Memory ID Generation
// ============================================================================

/// Generate a unique memory ID based on current timestamp
pub fn generate_memory_id() -> String {
    let now = crate::utils::now_millis().unwrap_or(0);
    format!("{:06}", now % MEMORY_ID_SPACE)
}
