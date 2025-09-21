use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use zeroize::Zeroize;

const SERVICE: &str = "lettuceai";

fn lettuce_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("lettuce"))
}

fn ensure_lettuce_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = lettuce_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn now_millis() -> Result<u64, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// File system operations
#[tauri::command]
fn ensure_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    ensure_lettuce_dir(&app).map(|_| ())
}

#[tauri::command]
fn read_app_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = app_data.join(&path);
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_app_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = app_data.join(&path);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&file_path, content).map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, Default)]
struct ModelsCacheFile {
    entries: HashMap<String, ModelsCacheEntry>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ModelsCacheEntry {
    models: Vec<String>,
    fetched_at: u64,
}

fn models_cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_lettuce_dir(app)?.join("models-cache.json"))
}

fn read_models_cache(app: &tauri::AppHandle) -> Result<ModelsCacheFile, String> {
    let path = models_cache_path(app)?;
    if !path.exists() {
        return Ok(ModelsCacheFile::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Ok(ModelsCacheFile::default());
    }
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn write_models_cache(app: &tauri::AppHandle, cache: &ModelsCacheFile) -> Result<(), String> {
    let path = models_cache_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(cache).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn models_cache_get(
    app: tauri::AppHandle,
    cred_id: String,
    max_age_ms: Option<u64>,
) -> Result<Option<Vec<String>>, String> {
    let cache = read_models_cache(&app)?;
    let entry = match cache.entries.get(&cred_id) {
        Some(e) => e,
        None => return Ok(None),
    };
    if let Some(ttl) = max_age_ms {
        let now = now_millis()?;
        if now.saturating_sub(entry.fetched_at) > ttl {
            return Ok(None);
        }
    }
    Ok(Some(entry.models.clone()))
}

#[tauri::command]
fn models_cache_update(
    app: tauri::AppHandle,
    cred_id: String,
    models: Vec<String>,
) -> Result<(), String> {
    let mut cache = read_models_cache(&app)?;
    cache.entries.insert(
        cred_id,
        ModelsCacheEntry {
            models,
            fetched_at: now_millis()?,
        },
    );
    write_models_cache(&app, &cache)
}

#[derive(Serialize, Deserialize, Default)]
struct SecretsFile {
    entries: HashMap<String, String>,
}

fn secrets_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("lettuce").join("secrets.json"))
}

fn read_secrets(app: &tauri::AppHandle) -> Result<SecretsFile, String> {
    let path = secrets_path(app)?;
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        return Ok(SecretsFile::default());
    }
    let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buf = String::new();
    f.read_to_string(&mut buf).map_err(|e| e.to_string())?;
    if buf.trim().is_empty() {
        return Ok(SecretsFile::default());
    }
    serde_json::from_str(&buf).map_err(|e| e.to_string())
}

fn write_secrets(app: &tauri::AppHandle, mut s: SecretsFile) -> Result<(), String> {
    let path = secrets_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_vec_pretty(&s).map_err(|e| e.to_string())?;
    // best-effort zeroize values in memory map after serialize
    for v in s.entries.values_mut() {
        v.zeroize();
    }
    let mut f = fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(&data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn secret_get(
    app: tauri::AppHandle,
    service: String,
    account: String,
) -> Result<Option<String>, String> {
    let s = read_secrets(&app)?;
    Ok(s.entries.get(&format!("{}|{}", service, account)).cloned())
}

#[tauri::command]
fn secret_set(
    app: tauri::AppHandle,
    service: String,
    account: String,
    value: String,
) -> Result<(), String> {
    let mut s = read_secrets(&app)?;
    s.entries.insert(format!("{}|{}", service, account), value);
    write_secrets(&app, s)
}

#[tauri::command]
fn secret_delete(app: tauri::AppHandle, service: String, account: String) -> Result<(), String> {
    let mut s = read_secrets(&app)?;
    s.entries.remove(&format!("{}|{}", service, account));
    write_secrets(&app, s)
}

// Simplified per-credential helpers so the frontend doesn't construct service/account.
#[tauri::command]
fn secret_for_cred_get(
    app: tauri::AppHandle,
    provider_id: String,
    cred_id: String,
    key: String,
) -> Result<Option<String>, String> {
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    secret_get(app, service, account)
}

#[tauri::command]
fn secret_for_cred_set(
    app: tauri::AppHandle,
    provider_id: String,
    cred_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    secret_set(app, service, account, value)
}

#[tauri::command]
fn secret_for_cred_delete(
    app: tauri::AppHandle,
    provider_id: String,
    cred_id: String,
    key: String,
) -> Result<(), String> {
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    secret_delete(app, service, account)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            ensure_data_dir,
            read_app_file,
            write_app_file,
            models_cache_get,
            models_cache_update,
            secret_get,
            secret_set,
            secret_delete,
            secret_for_cred_get,
            secret_for_cred_set,
            secret_for_cred_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
