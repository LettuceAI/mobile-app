use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SecretRef {
    pub provider_id: String,
    pub key: String,
    pub cred_id: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCredential {
    pub id: String,
    pub provider_id: String,
    pub label: String,
    pub api_key_ref: Option<SecretRef>,
    pub base_url: Option<String>,
    pub default_model: Option<String>,
    pub headers: Option<HashMap<String, String>>,
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
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MessageVariant {
    pub id: String,
    pub content: String,
    pub created_at: u64,
    #[serde(default)]
    pub usage: Option<UsageSummary>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub character_id: String,
    pub title: String,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub persona_id: Option<String>,
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
    pub description: Option<String>,
    #[serde(default)]
    pub rules: Vec<String>,
    #[serde(default)]
    pub default_model_id: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
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

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurnResult {
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerateResult {
    pub session_id: String,
    pub request_id: Option<String>,
    pub assistant_message: StoredMessage,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinueResult {
    pub session_id: String,
    pub request_id: Option<String>,
    pub assistant_message: StoredMessage,
}
