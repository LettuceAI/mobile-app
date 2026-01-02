use crate::logger::{LogEntry, LogManager};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use if_addrs::get_if_addrs;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_fs::FsExt;

pub const _SERVICE: &str = "1.0.0-beta-7";

pub fn lettuce_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let lettuce_path = base.join("lettuce");
    Ok(lettuce_path)
}

pub fn ensure_lettuce_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = lettuce_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn now_millis() -> Result<u64, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64)
}

pub fn emit_debug(app: &AppHandle, phase: &str, payload: Value) {
    let event = json!({
        "state": phase,
        "payload": payload,
    });
    let _ = app.emit("chat://debug", event);
}

#[derive(Debug, Clone, Copy)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
        }
    }
}

/// Structured backend logger that emits formatted log messages via event system.
/// Format: [HH:MM:SS] component[/function] LEVEL message
pub(crate) fn log_backend(
    app: &AppHandle,
    component: &str,
    level: LogLevel,
    message: impl AsRef<str>,
) {
    use chrono::Local;
    let now = Local::now();
    let timestamp = now.format("%H:%M:%S");
    let formatted = format!(
        "[{}] {} {} {}",
        timestamp,
        component,
        level.as_str(),
        message.as_ref()
    );

    let event = json!({
        "state": component,
        "level": level.as_str(),
        "message": formatted,
    });
    let _ = app.emit("chat://debug", event);

    // Also write to file
    if let Some(log_manager) = app.try_state::<LogManager>() {
        let entry = LogEntry {
            timestamp: now.to_rfc3339(),
            level: level.as_str().to_string(),
            component: component.to_string(),
            function: None,
            message: message.as_ref().to_string(),
        };
        let _ = log_manager.write_log(entry);
    }
}

/// Convenience wrappers for common log levels
pub(crate) fn log_info(app: &AppHandle, component: &str, message: impl AsRef<str>) {
    log_backend(app, component, LogLevel::Info, message);
}

pub(crate) fn log_warn(app: &AppHandle, component: &str, message: impl AsRef<str>) {
    log_backend(app, component, LogLevel::Warn, message);
}

pub(crate) fn log_error(app: &AppHandle, component: &str, message: impl AsRef<str>) {
    log_backend(app, component, LogLevel::Error, message);
}

#[allow(dead_code)]
pub(crate) fn log_debug(app: &AppHandle, component: &str, message: impl AsRef<str>) {
    log_backend(app, component, LogLevel::Debug, message);
}

pub(crate) fn app_version() -> String {
    "1.0.0-beta.6.1".to_string()
}

pub fn get_local_ip() -> Result<String, String> {
    if let Ok(ifaces) = get_if_addrs() {
        for iface in &ifaces {
            if !iface.is_loopback() {
                if let if_addrs::IfAddr::V4(v4) = &iface.addr {
                    let ip = v4.ip.to_string();
                    if ip.starts_with("192.168.") {
                        return Ok(ip);
                    }
                }
            }
        }

        for iface in &ifaces {
            if !iface.is_loopback() {
                if let if_addrs::IfAddr::V4(v4) = &iface.addr {
                    return Ok(v4.ip.to_string());
                }
            }
        }
    }

    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| e.to_string())
}

fn read_resource_as_base64(app: &AppHandle, path: &str) -> Result<String, String> {
    let resource_path = app
        .path()
        .resolve(path, BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve resource {}: {}", path, e))?;
    let bytes = app
        .fs()
        .read(resource_path)
        .map_err(|e| format!("Failed to read resource {}: {}", path, e))?;
    Ok(STANDARD.encode(&bytes))
}

#[derive(Clone, Serialize)]
pub struct AccessibilitySoundBase64 {
    pub send: String,
    pub success: String,
    pub failure: String,
}

static ACCESSIBILITY_SOUND_CACHE: OnceLock<Mutex<Option<AccessibilitySoundBase64>>> =
    OnceLock::new();

#[tauri::command]
pub fn accessibility_sound_base64(app: AppHandle) -> Result<AccessibilitySoundBase64, String> {
    let cache = ACCESSIBILITY_SOUND_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache
        .lock()
        .map_err(|_| "Accessibility sound cache lock poisoned".to_string())?;
    if let Some(cached) = guard.as_ref() {
        return Ok(cached.clone());
    }

    let sounds = AccessibilitySoundBase64 {
        send: read_resource_as_base64(&app, "feedback_sounds/send.mp3")?,
        success: read_resource_as_base64(&app, "feedback_sounds/success.mp3")?,
        failure: read_resource_as_base64(&app, "feedback_sounds/fail.mp3")?,
    };
    *guard = Some(sounds.clone());
    Ok(sounds)
}

#[tauri::command]
pub fn get_app_version() -> String {
    app_version()
}
