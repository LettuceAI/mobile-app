use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const SERVICE: &str = "lettuceai";

pub fn lettuce_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("lettuce"))
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

pub(crate) fn log_backend(app: &AppHandle, scope: &str, message: impl AsRef<str>) {
    let event = json!({
        "state": scope,
        "message": message.as_ref(),
    });
    let _ = app.emit("chat://debug", event);
}
