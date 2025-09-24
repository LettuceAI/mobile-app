use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::Manager;
use zeroize::Zeroize;

use crate::utils::SERVICE;

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
    for v in s.entries.values_mut() {
        v.zeroize();
    }
    let mut f = fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(&data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn secret_get(
    app: tauri::AppHandle,
    service: String,
    account: String,
) -> Result<Option<String>, String> {
    let s = read_secrets(&app)?;
    Ok(s.entries.get(&format!("{}|{}", service, account)).cloned())
}

#[tauri::command]
pub fn secret_set(
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
pub fn secret_delete(
    app: tauri::AppHandle,
    service: String,
    account: String,
) -> Result<(), String> {
    let mut s = read_secrets(&app)?;
    s.entries.remove(&format!("{}|{}", service, account));
    write_secrets(&app, s)
}

#[tauri::command]
pub fn secret_for_cred_get(
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
pub fn secret_for_cred_set(
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
pub fn secret_for_cred_delete(
    app: tauri::AppHandle,
    provider_id: String,
    cred_id: String,
    key: String,
) -> Result<(), String> {
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    secret_delete(app, service, account)
}

// Internal helper (non-command) for other Rust modules to read secrets without exposing new commands.
pub(crate) fn internal_secret_for_cred_get(
    app: &tauri::AppHandle,
    provider_id: String,
    cred_id: String,
    key: String,
) -> Result<Option<String>, String> {
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    let s = read_secrets(app)?;
    Ok(s.entries.get(&format!("{}|{}", service, account)).cloned())
}
