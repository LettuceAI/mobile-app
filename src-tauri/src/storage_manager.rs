use base64::{engine::general_purpose, Engine as _};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
#[cfg(not(target_os = "android"))]
use machine_uid::get as get_machine_uid;
use rand::rngs::OsRng;
use rand::RngCore;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

use crate::utils::{ensure_lettuce_dir, now_millis};

const SETTINGS_FILE: &str = "settings.bin";
const CHARACTERS_FILE: &str = "characters.bin";
const PERSONAS_FILE: &str = "personas.bin";
const SESSIONS_INDEX_FILE: &str = "sessions/index.bin";
const SESSIONS_DIR: &str = "sessions";

fn storage_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    ensure_lettuce_dir(app)
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join(SETTINGS_FILE))
}

fn characters_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join(CHARACTERS_FILE))
}

fn personas_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join(PERSONAS_FILE))
}

fn sessions_index_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join(SESSIONS_INDEX_FILE))
}

fn session_file_path(app: &tauri::AppHandle, session_id: &str) -> Result<PathBuf, String> {
    Ok(storage_root(app)?
        .join(SESSIONS_DIR)
        .join(format!("{session_id}.bin")))
}

fn derive_key() -> Result<[u8; 32], String> {
    let machine_id = {
        #[cfg(not(target_os = "android"))]
        {
            get_machine_uid().unwrap_or_else(|_| {
                format!(
                    "{}|{}|{}",
                    whoami::username(),
                    whoami::fallible::hostname().unwrap_or_else(|_| "unknown-host".into()),
                    std::env::consts::OS
                )
            })
        }
        #[cfg(target_os = "android")]
        {
            format!(
                "{}|{}|{}",
                whoami::username(),
                whoami::fallible::hostname().unwrap_or_else(|_| "unknown-host".into()),
                std::env::consts::OS
            )
        }
    };
    let mut hasher = blake3::Hasher::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(b"lettuceai.storage.v1");
    let hash = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(hash.as_bytes());
    Ok(key)
}

fn encrypt(content: &[u8]) -> Result<Vec<u8>, String> {
    let key = derive_key()?;
    let cipher = XChaCha20Poly1305::new(&key.into());
    let mut nonce_bytes = [0u8; 24];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from(nonce_bytes);
    let mut out = Vec::with_capacity(24 + content.len() + 16);
    let ciphertext = cipher
        .encrypt(&nonce, content)
        .map_err(|e| format!("encrypt: {e}"))?;
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 24 {
        return Err("corrupted data".into());
    }
    let (nonce_bytes, ciphertext) = data.split_at(24);
    let key = derive_key()?;
    let cipher = XChaCha20Poly1305::new(&key.into());
    let nonce = XNonce::from(*<&[u8; 24]>::try_from(nonce_bytes).map_err(|_| "invalid nonce")?);
    cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|e| format!("decrypt: {e}"))
}

fn read_encrypted_file(path: &PathBuf) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Ok(None);
    }
    let decrypted = decrypt(&bytes)?;
    let text = String::from_utf8(decrypted).map_err(|e| e.to_string())?;
    if text.is_empty() {
        Ok(None)
    } else {
        Ok(Some(text))
    }
}

fn write_encrypted_file(path: &PathBuf, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = encrypt(content.as_bytes())?;
    fs::write(path, bytes).map_err(|e| e.to_string())
}

fn delete_file_if_exists(path: &PathBuf) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn storage_read_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_settings(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = settings_path(&app)?;
    write_encrypted_file(&path, &data)
}

#[tauri::command]
pub fn storage_read_characters(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = characters_path(&app)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_characters(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = characters_path(&app)?;
    write_encrypted_file(&path, &data)
}

#[tauri::command]
pub fn storage_read_personas(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = personas_path(&app)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_personas(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = personas_path(&app)?;
    write_encrypted_file(&path, &data)
}

#[tauri::command]
pub fn storage_read_sessions_index(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = sessions_index_path(&app)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_sessions_index(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = sessions_index_path(&app)?;
    write_encrypted_file(&path, &data)
}

#[tauri::command]
pub fn storage_read_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<Option<String>, String> {
    let path = session_file_path(&app, &session_id)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_session(
    app: tauri::AppHandle,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let path = session_file_path(&app, &session_id)?;
    write_encrypted_file(&path, &data)
}

#[tauri::command]
pub fn storage_delete_session(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    let path = session_file_path(&app, &session_id)?;
    delete_file_if_exists(&path)
}

#[tauri::command]
pub fn storage_clear_all(app: tauri::AppHandle) -> Result<(), String> {
    let dir = storage_root(&app)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsageSummary {
    pub file_count: usize,
    pub estimated_sessions: usize,
    pub last_updated_ms: Option<u64>,
}

#[tauri::command]
pub fn storage_usage_summary(app: tauri::AppHandle) -> Result<StorageUsageSummary, String> {
    let mut file_count = 0usize;
    let mut latest: Option<u64> = None;

    let paths = vec![
        settings_path(&app)?,
        characters_path(&app)?,
        personas_path(&app)?,
        sessions_index_path(&app)?,
    ];

    for path in paths {
        if path.exists() {
            file_count += 1;
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(ms) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let timestamp = ms.as_millis() as u64;
                        latest = Some(latest.map_or(timestamp, |current| current.max(timestamp)));
                    }
                }
            }
        }
    }

    let sessions_dir = storage_root(&app)?.join(SESSIONS_DIR);
    let mut session_count = 0usize;
    if sessions_dir.exists() {
        for entry in fs::read_dir(&sessions_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                session_count += 1;
                if let Ok(metadata) = entry.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(ms) = modified.duration_since(std::time::UNIX_EPOCH) {
                            let ts = ms.as_millis() as u64;
                            latest = Some(latest.map_or(ts, |current| current.max(ts)));
                        }
                    }
                }
            }
        }
    }

    let last_updated_ms = match latest {
        Some(ts) => Some(ts),
        None => now_millis().ok(),
    };

    Ok(StorageUsageSummary {
        file_count: file_count + session_count,
        estimated_sessions: session_count,
        last_updated_ms,
    })
}

pub(crate) fn internal_read_settings(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(app)?;
    read_encrypted_file(&path)
}

// Image storage - returns file path, NOT base64
#[tauri::command]
pub fn storage_write_image(
    app: tauri::AppHandle,
    image_id: String,
    base64_data: String,
) -> Result<String, String> {
    // Remove data URL prefix if present
    let data = if let Some(comma_idx) = base64_data.find(',') {
        &base64_data[comma_idx + 1..]
    } else {
        &base64_data
    };

    // Decode base64
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Create images directory
    let images_dir = storage_root(&app)?.join("images");
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    // Detect file extension from magic bytes
    let extension = if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "png"
    } else if bytes.starts_with(&[0x47, 0x49, 0x46]) {
        "gif"
    } else if bytes.starts_with(&[0x52, 0x49, 0x46, 0x46])
        && bytes.len() > 8
        && &bytes[8..12] == b"WEBP"
    {
        "webp"
    } else {
        "png" // default
    };

    // Write image file with proper extension
    let image_path = images_dir.join(format!("{}.{}", image_id, extension));
    fs::write(&image_path, bytes).map_err(|e| e.to_string())?;

    // Return the absolute file path
    Ok(image_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn storage_get_image_path(app: tauri::AppHandle, image_id: String) -> Result<String, String> {
    let images_dir = storage_root(&app)?.join("images");

    // Check for file with any image extension
    for ext in &["jpg", "jpeg", "png", "gif", "webp"] {
        let image_path = images_dir.join(format!("{}.{}", image_id, ext));
        if image_path.exists() {
            return Ok(image_path.to_string_lossy().to_string());
        }
    }

    Err(format!("Image not found: {}", image_id))
}

#[tauri::command]
pub fn storage_delete_image(app: tauri::AppHandle, image_id: String) -> Result<(), String> {
    let images_dir = storage_root(&app)?.join("images");

    // Delete file with any extension
    for ext in &["jpg", "jpeg", "png", "gif", "webp", "img"] {
        let image_path = images_dir.join(format!("{}.{}", image_id, ext));
        if image_path.exists() {
            delete_file_if_exists(&image_path)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn storage_read_image(app: tauri::AppHandle, image_id: String) -> Result<String, String> {
    let images_dir = storage_root(&app)?.join("images");

    // Find the image file with any extension
    for ext in &["jpg", "jpeg", "png", "gif", "webp"] {
        let image_path = images_dir.join(format!("{}.{}", image_id, ext));
        if image_path.exists() {
            let bytes = fs::read(&image_path).map_err(|e| e.to_string())?;

            // Determine MIME type from extension
            let mime_type = match *ext {
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => "image/png",
            };

            // Encode to base64 and return as data URL
            let base64_data = general_purpose::STANDARD.encode(&bytes);
            return Ok(format!("data:{};base64,{}", mime_type, base64_data));
        }
    }

    Err(format!("Image not found: {}", image_id))
}
