use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use super::tooling::ToolCall;

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PromptScope {
    AppWide,
    ModelSpecific,
    CharacterSpecific,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemPromptTemplate {
    pub id: String,
    pub name: String,
    pub scope: PromptScope,
    /// Model or Character IDs this template applies to (empty for AppWide)
    #[serde(default)]
    pub target_ids: Vec<String>,
    pub content: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCredential {
    pub id: String,
    pub provider_id: String,
    pub label: String,
    #[serde(default)]
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub default_model: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    #[serde(default)]
    pub config: Option<Value>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    pub id: String,
    pub name: String,
    pub provider_id: String,
    pub provider_label: String,
    pub display_name: String,
    pub created_at: u64,
    #[serde(default = "default_input_scopes")]
    pub input_scopes: Vec<String>,
    #[serde(default = "default_output_scopes")]
    pub output_scopes: Vec<String>,
    #[serde(default)]
    pub advanced_model_settings: Option<AdvancedModelSettings>,
    /// Reference to a system prompt template (if any)
    #[serde(default)]
    pub prompt_template_id: Option<String>,
    #[serde(default)]
    pub voice_config: Option<serde_json::Value>,
    /// DEPRECATED: Old system prompt field (migrated to templates)
    #[serde(default, skip_serializing)]
    #[allow(dead_code)]
    pub system_prompt: Option<String>,
}

fn default_input_scopes() -> Vec<String> {
    vec!["text".to_string()]
}

fn default_output_scopes() -> Vec<String> {
    vec!["text".to_string()]
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub default_provider_credential_id: Option<String>,
    pub default_model_id: Option<String>,
    pub provider_credentials: Vec<ProviderCredential>,
    pub models: Vec<Model>,
    #[serde(default)]
    pub app_state: Value,
    #[serde(default)]
    pub advanced_model_settings: AdvancedModelSettings,
    #[serde(default)]
    pub advanced_settings: Option<AdvancedSettings>,
    /// Reference to app-wide system prompt template (if any)
    #[serde(default)]
    pub prompt_template_id: Option<String>,
    /// DEPRECATED: Old system prompt field (migrated to templates)
    #[serde(default, skip_serializing)]
    #[allow(dead_code)]
    pub system_prompt: Option<String>,
    /// Migration version for data structure changes
    #[serde(default)]
    pub migration_version: u32,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSettings {
    #[serde(default)]
    pub summarisation_model_id: Option<String>,
    #[serde(default)]
    pub creation_helper_enabled: Option<bool>,
    #[serde(default)]
    pub creation_helper_model_id: Option<String>,
    #[serde(default)]
    pub dynamic_memory: Option<DynamicMemorySettings>,
    #[serde(default)]
    pub manual_mode_context_window: Option<u32>,
    /// Max token capacity for embedding model (1024, 2048, or 4096)
    #[serde(default)]
    pub embedding_max_tokens: Option<u32>,
    #[serde(default)]
    pub accessibility: Option<AccessibilitySettings>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilitySettings {
    pub send: AccessibilitySoundSettings,
    pub success: AccessibilitySoundSettings,
    pub failure: AccessibilitySoundSettings,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilitySoundSettings {
    pub enabled: bool,
    pub volume: f32,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DynamicMemorySettings {
    pub enabled: bool,
    #[serde(default)]
    pub summary_message_interval: u32,
    #[serde(default)]
    pub max_entries: u32,
    #[serde(default = "default_min_similarity")]
    pub min_similarity_threshold: f32,
    #[serde(default = "default_hot_memory_token_budget")]
    pub hot_memory_token_budget: u32,
    /// Score reduction per memory cycle (0.05-0.15 recommended)
    #[serde(default = "default_decay_rate")]
    pub decay_rate: f32,
    /// Score below which memories are demoted to cold (0.2-0.4 recommended)
    #[serde(default = "default_cold_threshold")]
    pub cold_threshold: f32,
    /// v2 exclusive: Use last 2 messages for better memory retrieval
    #[serde(default = "default_context_enrichment")]
    pub context_enrichment_enabled: bool,
}

fn default_min_similarity() -> f32 {
    0.5 // Default threshold - memories below this score are excluded
}

fn default_hot_memory_token_budget() -> u32 {
    2048 // Default token budget for hot memories
}

fn default_decay_rate() -> f32 {
    0.1 // Score reduction per memory cycle
}

fn default_cold_threshold() -> f32 {
    0.4 // Memories below this score are demoted to cold
}

fn default_context_enrichment() -> bool {
    true // v2 exclusive: Use last 2 messages for better retrieval
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedModelSettings {
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub max_output_tokens: Option<u32>,
    pub frequency_penalty: Option<f64>,
    pub presence_penalty: Option<f64>,
    pub top_k: Option<u32>,
    // Reasoning/thinking settings
    #[serde(default)]
    pub reasoning_enabled: Option<bool>,
    #[serde(default)]
    pub reasoning_effort: Option<String>, // "low", "medium", "high"
    #[serde(default)]
    pub reasoning_budget_tokens: Option<u32>,
}

impl Default for AdvancedModelSettings {
    fn default() -> Self {
        Self {
            temperature: Some(0.7),
            top_p: Some(1.0),
            max_output_tokens: Some(1024),
            frequency_penalty: None,
            presence_penalty: None,
            top_k: None,
            reasoning_enabled: None,
            reasoning_effort: None,
            reasoning_budget_tokens: None,
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImageAttachment {
    pub id: String,
    pub data: String,
    pub mime_type: String,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub storage_path: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: u64,
    #[serde(default)]
    pub usage: Option<UsageSummary>,
    #[serde(default)]
    pub variants: Vec<MessageVariant>,
    #[serde(default)]
    pub selected_variant_id: Option<String>,
    #[serde(default)]
    pub memory_refs: Vec<String>,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub attachments: Vec<ImageAttachment>,
    /// Reasoning/thinking content from thinking models (not sent in API requests)
    #[serde(default)]
    pub reasoning: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MessageVariant {
    pub id: String,
    pub content: String,
    pub created_at: u64,
    #[serde(default)]
    pub usage: Option<UsageSummary>,
    #[serde(default)]
    pub attachments: Vec<ImageAttachment>,
    #[serde(default)]
    pub reasoning: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEmbedding {
    pub id: String,
    pub text: String,
    pub embedding: Vec<f32>,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub token_count: u32,
    /// If true, this memory is in cold storage (not injected into context)
    #[serde(default)]
    pub is_cold: bool,
    /// Last time this memory was accessed/retrieved (for demotion scoring)
    #[serde(default)]
    pub last_accessed_at: u64,
    /// Importance score (0.0-1.0) - decays over time, memories below threshold go cold
    #[serde(default = "default_importance_score")]
    pub importance_score: f32,
    /// If true, this memory never decays (user/LLM marked as critical)
    #[serde(default)]
    pub is_pinned: bool,
    /// Number of times this memory was retrieved for context
    #[serde(default)]
    pub access_count: u32,
    /// Ephemeral match score (similarity) from retrieval
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub match_score: Option<f32>,
}

fn default_importance_score() -> f32 {
    1.0
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SceneVariant {
    pub id: String,
    pub content: String,
    pub created_at: u64,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub content: String,
    pub created_at: u64,
    #[serde(default)]
    pub variants: Vec<SceneVariant>,
    #[serde(default)]
    pub selected_variant_id: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub character_id: String,
    pub title: String,
    /// DEPRECATED: System prompts are now always rebuilt dynamically
    #[serde(default, skip_serializing)]
    #[allow(dead_code)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub selected_scene_id: Option<String>,
    #[serde(default)]
    pub persona_id: Option<String>,
    #[serde(default)]
    pub voice_autoplay: Option<bool>,
    #[serde(default)]
    pub advanced_model_settings: Option<AdvancedModelSettings>,
    #[serde(default)]
    pub memories: Vec<String>,
    #[serde(default)]
    pub memory_embeddings: Vec<MemoryEmbedding>,
    #[serde(default)]
    pub memory_summary: Option<String>,
    #[serde(default)]
    pub memory_summary_token_count: u32,
    #[serde(default)]
    pub memory_tool_events: Vec<serde_json::Value>,
    #[serde(default)]
    pub messages: Vec<StoredMessage>,
    #[serde(default)]
    pub archived: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub avatar_path: Option<String>,
    #[serde(default)]
    pub background_image_path: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub rules: Vec<String>,
    #[serde(default)]
    pub scenes: Vec<Scene>,
    #[serde(default)]
    pub default_scene_id: Option<String>,
    #[serde(default)]
    pub default_model_id: Option<String>,
    #[serde(default = "default_memory_type")]
    pub memory_type: String,
    /// Reference to a character-specific system prompt template (if any)
    #[serde(default)]
    pub prompt_template_id: Option<String>,
    /// DEPRECATED: Old system prompt field (migrated to templates)
    #[serde(default, skip_serializing)]
    #[allow(dead_code)]
    pub system_prompt: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

fn default_memory_type() -> String {
    "manual".to_string()
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Persona {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub is_default: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    #[serde(default)]
    pub reasoning_tokens: Option<u64>,
    #[serde(default)]
    pub image_tokens: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurnResult {
    pub session: Session,
    pub session_id: String,
    pub request_id: Option<String>,
    pub user_message: StoredMessage,
    pub assistant_message: StoredMessage,
    pub usage: Option<UsageSummary>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCompletionArgs {
    #[serde(alias = "sessionId")]
    pub session_id: String,
    #[serde(alias = "characterId")]
    pub character_id: String,
    #[serde(alias = "userMessage")]
    pub user_message: String,
    #[serde(alias = "personaId")]
    pub persona_id: Option<String>,
    pub stream: Option<bool>,
    #[serde(alias = "requestId")]
    pub request_id: Option<String>,
    #[serde(default)]
    pub attachments: Vec<ImageAttachment>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRegenerateArgs {
    #[serde(alias = "sessionId")]
    pub session_id: String,
    #[serde(alias = "messageId")]
    pub message_id: String,
    pub stream: Option<bool>,
    #[serde(alias = "requestId")]
    pub request_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatContinueArgs {
    #[serde(alias = "sessionId")]
    pub session_id: String,
    #[serde(alias = "characterId")]
    pub character_id: String,
    #[serde(alias = "personaId")]
    pub persona_id: Option<String>,
    pub stream: Option<bool>,
    #[serde(alias = "requestId")]
    pub request_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAddMessageAttachmentArgs {
    #[serde(alias = "sessionId")]
    pub session_id: String,
    #[serde(alias = "characterId")]
    pub character_id: String,
    #[serde(alias = "messageId")]
    pub message_id: String,
    /// "user" or "assistant"
    pub role: String,
    #[serde(alias = "attachmentId")]
    pub attachment_id: String,
    #[serde(alias = "base64Data")]
    pub base64_data: String,
    #[serde(alias = "mimeType")]
    pub mime_type: String,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerateResult {
    pub session: Session,
    pub session_id: String,
    pub request_id: Option<String>,
    pub assistant_message: StoredMessage,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinueResult {
    pub session: Session,
    pub session_id: String,
    pub request_id: Option<String>,
    pub assistant_message: StoredMessage,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ErrorEnvelope {
    #[serde(default)]
    pub code: Option<String>,
    pub message: String,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub retryable: Option<bool>,
    #[serde(default)]
    pub status: Option<u16>,
}

/// Provider-agnostic normalized stream/update events.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
pub enum NormalizedEvent {
    #[serde(rename = "delta")]
    Delta { text: String },
    #[serde(rename = "reasoning")]
    Reasoning { text: String },
    #[serde(rename = "usage")]
    Usage { usage: UsageSummary },
    #[serde(rename = "toolCall")]
    ToolCall { calls: Vec<ToolCall> },
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error { envelope: ErrorEnvelope },
}

// Newtypes for stronger ids (not yet widely used – future-proofing)
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
#[serde(transparent)]
#[allow(dead_code)]
pub struct ProviderId(pub String);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
#[serde(transparent)]
#[allow(dead_code)]
pub struct ModelId(pub String);

// Ergonomic conversions for constructing ProviderId
impl From<&str> for ProviderId {
    fn from(value: &str) -> Self {
        ProviderId(value.to_string())
    }
}

impl From<String> for ProviderId {
    fn from(value: String) -> Self {
        ProviderId(value)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MessageSearchResult {
    pub message_id: String,
    pub content: String,
    pub created_at: u64,
    pub role: String,
}
