use std::cmp::Ordering;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::utils::{log_error, log_info};

const DISCOVERY_BASE_URL: &str = "https://character-tavern.com/api/homepage/cards";
const CARD_IMAGE_BASE_URL: &str = "https://cards.character-tavern.com/cdn-cgi/image";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryCard {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub in_chat_name: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub tagline: Option<String>,
    #[serde(default)]
    pub page_description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub is_nsfw: Option<bool>,
    #[serde(default)]
    pub content_warnings: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub views: Option<i64>,
    #[serde(default)]
    pub downloads: Option<i64>,
    #[serde(default)]
    pub messages: Option<i64>,
    #[serde(default)]
    pub created_at: Option<i64>,
    #[serde(default)]
    pub last_update_at: Option<i64>,
    #[serde(default)]
    pub likes: Option<i64>,
    #[serde(default)]
    pub dislikes: Option<i64>,
    #[serde(default)]
    pub total_tokens: Option<i64>,
    #[serde(default)]
    pub has_lorebook: Option<bool>,
    #[serde(default)]
    pub is_oc: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DiscoveryResponse {
    hits: Vec<DiscoveryCard>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySections {
    pub newest: Vec<DiscoveryCard>,
    pub popular: Vec<DiscoveryCard>,
    pub trending: Vec<DiscoveryCard>,
}

#[derive(Clone, Copy)]
enum DiscoverySortKey {
    CreatedAt,
    LastUpdateAt,
    Likes,
    Downloads,
    Messages,
    Views,
    Name,
}

fn normalize_type(card_type: &str) -> Result<&'static str, String> {
    match card_type.trim().to_ascii_lowercase().as_str() {
        "newest" => Ok("newest"),
        "popular" => Ok("popular"),
        "trending" => Ok("trending"),
        other => Err(format!("Unsupported card type: {}", other)),
    }
}

fn parse_sort_key(value: Option<&str>) -> Option<DiscoverySortKey> {
    let key = value?.trim().to_ascii_lowercase();
    match key.as_str() {
        "created" | "createdat" | "created_at" => Some(DiscoverySortKey::CreatedAt),
        "updated" | "lastupdateat" | "last_update_at" => Some(DiscoverySortKey::LastUpdateAt),
        "likes" => Some(DiscoverySortKey::Likes),
        "downloads" => Some(DiscoverySortKey::Downloads),
        "messages" => Some(DiscoverySortKey::Messages),
        "views" => Some(DiscoverySortKey::Views),
        "name" => Some(DiscoverySortKey::Name),
        _ => None,
    }
}

fn default_sort_for_type(card_type: &str) -> (DiscoverySortKey, bool) {
    match card_type {
        "newest" => (DiscoverySortKey::CreatedAt, true),
        "popular" => (DiscoverySortKey::Likes, true),
        "trending" => (DiscoverySortKey::LastUpdateAt, true),
        _ => (DiscoverySortKey::CreatedAt, true),
    }
}

fn numeric_value(card: &DiscoveryCard, key: DiscoverySortKey) -> i64 {
    match key {
        DiscoverySortKey::CreatedAt => card.created_at.unwrap_or(0),
        DiscoverySortKey::LastUpdateAt => card.last_update_at.or(card.created_at).unwrap_or(0),
        DiscoverySortKey::Likes => card.likes.unwrap_or(0),
        DiscoverySortKey::Downloads => card.downloads.unwrap_or(0),
        DiscoverySortKey::Messages => card.messages.unwrap_or(0),
        DiscoverySortKey::Views => card.views.unwrap_or(0),
        DiscoverySortKey::Name => 0,
    }
}

fn compare_numeric(
    a: &DiscoveryCard,
    b: &DiscoveryCard,
    key: DiscoverySortKey,
    desc: bool,
) -> Ordering {
    let a_val = numeric_value(a, key);
    let b_val = numeric_value(b, key);
    if desc {
        b_val.cmp(&a_val)
    } else {
        a_val.cmp(&b_val)
    }
}

fn compare_name(a: &DiscoveryCard, b: &DiscoveryCard, desc: bool) -> Ordering {
    let a_name = a.name.to_ascii_lowercase();
    let b_name = b.name.to_ascii_lowercase();
    if desc {
        b_name.cmp(&a_name)
    } else {
        a_name.cmp(&b_name)
    }
}

fn sort_cards(cards: &mut [DiscoveryCard], key: DiscoverySortKey, desc: bool) {
    cards.sort_by(|a, b| {
        let primary = match key {
            DiscoverySortKey::Name => compare_name(a, b, desc),
            _ => compare_numeric(a, b, key, desc),
        };
        if primary != Ordering::Equal {
            return primary;
        }

        compare_numeric(a, b, DiscoverySortKey::Likes, true)
            .then_with(|| compare_numeric(a, b, DiscoverySortKey::Downloads, true))
            .then_with(|| compare_numeric(a, b, DiscoverySortKey::Views, true))
            .then_with(|| compare_numeric(a, b, DiscoverySortKey::Messages, true))
            .then_with(|| compare_numeric(a, b, DiscoverySortKey::CreatedAt, true))
            .then_with(|| compare_name(a, b, false))
    });
}

fn normalize_card_path(raw: &str) -> String {
    let trimmed = raw.trim().trim_start_matches('/');
    let with_ext = if trimmed.ends_with(".png") {
        trimmed.to_string()
    } else {
        format!("{}.png", trimmed)
    };

    let encoded: Vec<String> = with_ext
        .split('/')
        .map(|seg| urlencoding::encode(seg).into_owned())
        .collect();
    encoded.join("/")
}

#[tauri::command]
pub fn get_card_image(
    path: String,
    format: Option<String>,
    width: Option<u32>,
    quality: Option<u8>,
) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("Card image path cannot be empty".to_string());
    }

    if path.starts_with("http://") || path.starts_with("https://") {
        return Ok(path);
    }

    let format_value = format.unwrap_or_else(|| "auto".to_string());
    let width_value = width.unwrap_or(400).max(1);
    let quality_value = quality.unwrap_or(80).min(100);

    let path = normalize_card_path(&path);
    Ok(format!(
        "{}/format={},width={},quality={}/{}",
        CARD_IMAGE_BASE_URL, format_value, width_value, quality_value, path
    ))
}

async fn fetch_cards(
    app: &AppHandle,
    card_type: &str,
    client: &reqwest::Client,
) -> Result<Vec<DiscoveryCard>, String> {
    let url = format!("{}?type={}", DISCOVERY_BASE_URL, card_type);
    log_info(
        app,
        "discovery_cards",
        format!("fetching {} cards from {}", card_type, url),
    );

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        log_error(
            app,
            "discovery_cards",
            format!("{} cards failed: {} {}", card_type, status, text),
        );
        return Err(format!("Discovery request failed: {} {}", status, text));
    }

    let data: DiscoveryResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data.hits)
}

#[tauri::command]
pub async fn discovery_fetch_cards(
    app: AppHandle,
    card_type: String,
    sort_by: Option<String>,
    descending: Option<bool>,
) -> Result<Vec<DiscoveryCard>, String> {
    let card_type = normalize_type(&card_type)?;
    let client = reqwest::Client::new();
    let mut cards = fetch_cards(&app, card_type, &client).await?;

    let (default_key, default_desc) = default_sort_for_type(card_type);
    let key = parse_sort_key(sort_by.as_deref()).unwrap_or(default_key);
    let desc = descending.unwrap_or(default_desc);

    sort_cards(&mut cards, key, desc);
    Ok(cards)
}

#[tauri::command]
pub async fn discovery_fetch_sections(
    app: AppHandle,
    sort_by: Option<String>,
    descending: Option<bool>,
) -> Result<DiscoverySections, String> {
    let client = reqwest::Client::new();
    let (mut newest, mut popular, mut trending) = tokio::try_join!(
        fetch_cards(&app, "newest", &client),
        fetch_cards(&app, "popular", &client),
        fetch_cards(&app, "trending", &client),
    )
    .map_err(|e| e.to_string())?;

    let key_override = parse_sort_key(sort_by.as_deref());
    if let Some(key) = key_override {
        let desc = descending.unwrap_or(true);
        sort_cards(&mut newest, key, desc);
        sort_cards(&mut popular, key, desc);
        sort_cards(&mut trending, key, desc);
    } else {
        let (key, desc) = default_sort_for_type("newest");
        sort_cards(&mut newest, key, desc);
        let (key, desc) = default_sort_for_type("popular");
        sort_cards(&mut popular, key, desc);
        let (key, desc) = default_sort_for_type("trending");
        sort_cards(&mut trending, key, desc);
    }

    Ok(DiscoverySections {
        newest,
        popular,
        trending,
    })
}
