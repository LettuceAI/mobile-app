use crate::logger::{get_global_app_handle, LogEntry, LogManager};
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
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let lettuce_path = base.join("lettuce");
    Ok(lettuce_path)
}

pub fn ensure_lettuce_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = lettuce_dir(app)?;
    fs::create_dir_all(&dir)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    Ok(dir)
}

pub fn now_millis() -> Result<u64, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?
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
    static MIN_LOG_LEVEL: OnceLock<LogLevel> = OnceLock::new();
    static MAX_LOG_CHARS: usize = 1200;

    fn level_rank(level: LogLevel) -> u8 {
        match level {
            LogLevel::Debug => 10,
            LogLevel::Info => 20,
            LogLevel::Warn => 30,
            LogLevel::Error => 40,
        }
    }

    fn parse_level(value: &str) -> Option<LogLevel> {
        match value.trim().to_lowercase().as_str() {
            "debug" => Some(LogLevel::Debug),
            "info" => Some(LogLevel::Info),
            "warn" | "warning" => Some(LogLevel::Warn),
            "error" => Some(LogLevel::Error),
            _ => None,
        }
    }

    fn should_downgrade_to_debug(component: &str, message: &str) -> bool {
        let c = component.to_lowercase();
        let m = message.to_lowercase();
        if c == "prompt_engine" {
            return m.contains("template contains")
                || m.contains("before {{scene}}")
                || m.contains("scene_content length")
                || m.contains("direction length")
                || m.contains("template vars")
                || m.contains("system_prompt_built");
        }
        if c == "api_request" {
            return m.contains("adding header")
                || m.contains("all headers set")
                || m.contains("setting body as json")
                || m.contains("request body")
                || m.contains("response body");
        }
        false
    }

    fn redact_param_value(message: &str, param: &str) -> String {
        let mut output = String::with_capacity(message.len());
        let lower = message.to_lowercase();
        let needle = format!("{}=", param);
        let mut i = 0;
        while let Some(pos) = lower[i..].find(&needle) {
            let start = i + pos;
            output.push_str(&message[i..start]);
            let value_start = start + needle.len();
            output.push_str(&message[start..value_start]);
            let mut end = value_start;
            let bytes = message.as_bytes();
            while end < message.len() {
                let b = bytes[end] as char;
                if b.is_whitespace() || b == '&' || b == '"' || b == '\'' || b == ')' || b == ']' {
                    break;
                }
                end += 1;
            }
            output.push_str("***");
            i = end;
        }
        output.push_str(&message[i..]);
        output
    }

    fn redact_authorization(message: &str) -> String {
        let lower = message.to_lowercase();
        if !lower.contains("authorization") && !lower.contains("bearer") {
            return message.to_string();
        }
        let mut out = message.to_string();
        if let Some(idx) = lower.find("bearer ") {
            let start = idx + "bearer ".len();
            let mut end = start;
            let bytes = message.as_bytes();
            while end < message.len() {
                let c = bytes[end] as char;
                if c.is_whitespace() || c == '"' || c == '\'' || c == ',' {
                    break;
                }
                end += 1;
            }
            out.replace_range(start..end, "***");
        }
        out
    }

    fn redact_body_payload(message: &str) -> Option<String> {
        let lower = message.to_lowercase();
        let markers = [
            "request body:",
            "response body:",
            "setting body as json:",
            "request body",
        ];
        for marker in markers.iter() {
            if let Some(pos) = lower.find(marker) {
                let split_at = pos + marker.len();
                let (prefix, rest) = message.split_at(split_at);
                let len = rest.len();
                return Some(format!("{} <redacted body len={}>", prefix.trim_end(), len));
            }
        }
        None
    }

    fn sanitize_message(component: &str, message: &str) -> String {
        let mut msg = message.replace('\n', "\\n").replace('\r', "\\r");
        if let Some(redacted) = redact_body_payload(&msg) {
            msg = redacted;
        }
        msg = redact_authorization(&msg);
        for key in [
            "key",
            "api_key",
            "apikey",
            "access_token",
            "token",
            "authorization",
            "x-api-key",
        ] {
            msg = redact_param_value(&msg, key);
        }

        // Always strip query param keys from URLs if present.
        msg = redact_param_value(&msg, "key");

        if msg.len() > MAX_LOG_CHARS {
            let truncated = msg.chars().take(MAX_LOG_CHARS).collect::<String>();
            msg = format!("{}… <truncated>", truncated);
        }

        if component == "api_request" && msg.contains("full_url=") {
            msg = msg.replace("full_url=", "url=");
        }

        msg
    }

    let min_level = *MIN_LOG_LEVEL.get_or_init(|| {
        std::env::var("LETTUCE_LOG_LEVEL")
            .ok()
            .and_then(|value| parse_level(&value))
            .unwrap_or(LogLevel::Info)
    });
    let raw_message = message.as_ref();
    let effective_level = if should_downgrade_to_debug(component, raw_message) {
        LogLevel::Debug
    } else {
        level
    };
    if level_rank(effective_level) < level_rank(min_level) {
        return;
    }

    let now = Local::now();
    let timestamp = now.format("%H:%M:%S");
    let sanitized = sanitize_message(component, raw_message);
    let formatted = format!(
        "[{}] {} {} {}",
        timestamp,
        component,
        effective_level.as_str(),
        sanitized
    );

    let event = json!({
        "state": component,
        "level": effective_level.as_str(),
        "message": formatted,
    });
    let _ = app.emit("chat://debug", event);

    // Also write to file
    if let Some(log_manager) = app.try_state::<LogManager>() {
        let entry = LogEntry {
            timestamp: now.to_rfc3339(),
            level: effective_level.as_str().to_string(),
            component: component.to_string(),
            function: None,
            message: sanitized,
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

pub(crate) fn log_debug_global(component: &str, message: impl AsRef<str>) {
    if let Some(app) = get_global_app_handle() {
        log_backend(&app, component, LogLevel::Debug, message);
    } else {
        eprintln!("[DEBUG] {} {}", component, message.as_ref());
    }
}

pub(crate) fn log_info_global(component: &str, message: impl AsRef<str>) {
    if let Some(app) = get_global_app_handle() {
        log_backend(&app, component, LogLevel::Info, message);
    } else {
        eprintln!("[INFO] {} {}", component, message.as_ref());
    }
}

#[allow(dead_code)]
pub(crate) fn log_warn_global(component: &str, message: impl AsRef<str>) {
    if let Some(app) = get_global_app_handle() {
        log_backend(&app, component, LogLevel::Warn, message);
    } else {
        eprintln!("[WARN] {} {}", component, message.as_ref());
    }
}

pub(crate) fn log_error_global(component: &str, message: impl AsRef<str>) {
    if let Some(app) = get_global_app_handle() {
        log_backend(&app, component, LogLevel::Error, message);
    } else {
        eprintln!("[ERROR] {} {}", component, message.as_ref());
    }
}

pub(crate) fn err_to_string<E: std::fmt::Display>(component: &str, line: u32, err: E) -> String {
    log_error_global(component, format!("line {}: {}", line, err));
    err.to_string()
}

pub(crate) fn err_msg(component: &str, line: u32, message: impl AsRef<str>) -> String {
    log_error_global(component, format!("line {}: {}", line, message.as_ref()));
    message.as_ref().to_string()
}

pub fn emit_toast(
    app: &AppHandle,
    variant: &str,
    title: impl AsRef<str>,
    description: Option<String>,
) {
    let payload = json!({
        "variant": variant,
        "title": title.as_ref(),
        "description": description,
    });
    let _ = app.emit("app://toast", payload);
}

pub(crate) fn app_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
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
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
}

fn read_resource_as_base64(app: &AppHandle, path: &str) -> Result<String, String> {
    let resource_path = app
        .path()
        .resolve(path, BaseDirectory::Resource)
        .map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to resolve resource {}: {}", path, e),
            )
        })?;
    let bytes = app.fs().read(resource_path).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to read resource {}: {}", path, e),
        )
    })?;
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
pub fn get_app_version(app: AppHandle) -> String {
    app_version(&app)
}
