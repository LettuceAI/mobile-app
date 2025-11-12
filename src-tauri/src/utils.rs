use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const SERVICE: &str = "lettuceai";

pub fn lettuce_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let lettuce_path = base.join("lettuce");
    
    // Debug logging
    log_info(app, "utils::lettuce_dir", &format!("[DEBUG] App data dir: {:?}", base));
    log_info(app, "utils::lettuce_dir", &format!("[DEBUG] Lettuce dir: {:?}", lettuce_path));
    
    Ok(lettuce_path)
}

pub fn ensure_lettuce_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = lettuce_dir(app)?;
    
    // Debug logging before creation
    log_info(app, "utils::ensure_lettuce_dir", &format!("[DEBUG] Ensuring lettuce dir exists: {:?}", dir));
    
    fs::create_dir_all(&dir).map_err(|e| {
        log_error(app, "utils::ensure_lettuce_dir", &format!("[ERROR] Failed to create lettuce dir: {:?}", e));
        e.to_string()
    })?;
    
    // Verify it was created
    if dir.exists() {
        log_info(app, "utils::ensure_lettuce_dir", "[DEBUG] Lettuce dir successfully created/verified");
    } else {
        log_error(app, "utils::ensure_lettuce_dir", "[ERROR] Lettuce dir does not exist after create_dir_all");
    }
    
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
    "1.0-beta_3.2".to_string()
}

#[tauri::command]
pub fn get_app_version() -> String {
    app_version()
}
