// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use zeroize::Zeroize;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::Manager;

const SERVICE: &str = "lettuceai";

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// File system operations
#[tauri::command]
fn ensure_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let lettuce_dir = app_data.join("lettuce");
    fs::create_dir_all(&lettuce_dir).map_err(|e| e.to_string())?;
    Ok(())
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
struct SecretsFile {
    entries: HashMap<String, String>,
}

fn secrets_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(base.join("lettuce").join("secrets.json"))
}

fn read_secrets(app: &tauri::AppHandle) -> Result<SecretsFile, String> {
    let path = secrets_path(app)?;
    if !path.exists() {
        if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        return Ok(SecretsFile::default());
    }
    let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buf = String::new();
    f.read_to_string(&mut buf).map_err(|e| e.to_string())?;
    if buf.trim().is_empty() { return Ok(SecretsFile::default()); }
    serde_json::from_str(&buf).map_err(|e| e.to_string())
}

fn write_secrets(app: &tauri::AppHandle, mut s: SecretsFile) -> Result<(), String> {
    let path = secrets_path(app)?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let data = serde_json::to_vec_pretty(&s).map_err(|e| e.to_string())?;
    // best-effort zeroize values in memory map after serialize
    for v in s.entries.values_mut() { v.zeroize(); }
    let mut f = fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(&data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn secret_get(app: tauri::AppHandle, service: String, account: String) -> Result<Option<String>, String> {
    let s = read_secrets(&app)?;
    Ok(s.entries.get(&format!("{}|{}", service, account)).cloned())
}

#[tauri::command]
fn secret_set(app: tauri::AppHandle, service: String, account: String, value: String) -> Result<(), String> {
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
fn secret_for_cred_get(app: tauri::AppHandle, provider_id: String, cred_id: String, key: String) -> Result<Option<String>, String> {
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    secret_get(app, service, account)
}

#[tauri::command]
fn secret_for_cred_set(app: tauri::AppHandle, provider_id: String, cred_id: String, key: String, value: String) -> Result<(), String> {
    let service = format!("{}:{}", SERVICE, key);
    let account = format!("{}:{}", provider_id, cred_id);
    secret_set(app, service, account, value)
}

#[tauri::command]
fn secret_for_cred_delete(app: tauri::AppHandle, provider_id: String, cred_id: String, key: String) -> Result<(), String> {
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
