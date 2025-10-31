use serde_json::{json, Value};
use std::time::Duration;
use tokio::time::sleep;
use tauri::Emitter;

use crate::chat_manager::types::NormalizedEvent;
use crate::error::AppError;
use crate::utils::log_backend;

/// Build a reqwest client with an optional timeout.
pub fn build_client(timeout_ms: Option<u64>) -> Result<reqwest::Client, AppError> {
    let mut builder = reqwest::Client::builder();
    if let Some(ms) = timeout_ms {
        builder = builder.timeout(Duration::from_millis(ms));
    }
    builder.build().map_err(AppError::from)
}

/// Emit a normalized event to the app for the given request id.
pub fn emit_normalized(app: &tauri::AppHandle, request_id: &str, event: NormalizedEvent) {
    let channel = format!("api-normalized://{}", request_id);
    let payload = match &event {
        NormalizedEvent::Delta { text } => json!({
            "requestId": request_id,
            "type": "delta",
            "data": { "text": text },
        }),
        NormalizedEvent::Usage { usage } => json!({
            "requestId": request_id,
            "type": "usage",
            "data": usage,
        }),
        NormalizedEvent::Done => json!({
            "requestId": request_id,
            "type": "done",
            "data": Value::Null,
        }),
        NormalizedEvent::Error { envelope } => json!({
            "requestId": request_id,
            "type": "error",
            "data": envelope,
        }),
    };
    let _ = app.emit(&channel, payload);
}

/// Emit raw stream text to the app over the api:// channel
pub fn emit_raw(app: &tauri::AppHandle, event_name: &str, chunk: &str) {
    let _ = app.emit(event_name, chunk.to_string());
}

/// Simple one-shot send without retries
pub async fn send_request(builder: reqwest::RequestBuilder) -> Result<reqwest::Response, AppError> {
    builder.send().await.map_err(AppError::from)
}

/// Simple retry wrapper around send(), with backoff for timeouts and 5xx errors.
pub async fn send_with_retries(
    app: &tauri::AppHandle,
    scope: &str,
    builder: reqwest::RequestBuilder,
    max_retries: u32,
) -> Result<reqwest::Response, AppError> {
    // If this request cannot be cloned, perform a single attempt.
    let base = match builder.try_clone() {
        Some(b) => b,
        None => return builder.send().await.map_err(AppError::from),
    };
    let mut attempt: u32 = 0;
    loop {
        let attempt_builder = base
            .try_clone()
            .expect("reqwest::RequestBuilder should be clonable for retries");
        let result = attempt_builder.send().await;
        match result {
            Ok(resp) => {
                if resp.status().is_server_error() && attempt < max_retries {
                    attempt += 1;
                    let delay = backoff_delay_ms(attempt);
                    log_backend(app, scope, format!("server error {} - retrying in {}ms (attempt {}/{})", resp.status(), delay, attempt, max_retries));
                    sleep(Duration::from_millis(delay)).await;
                    // continue loop
                } else {
                    return Ok(resp);
                }
            }
            Err(err) => {
                if (err.is_timeout() || err.is_request()) && attempt < max_retries {
                    attempt += 1;
                    let delay = backoff_delay_ms(attempt);
                    log_backend(app, scope, format!("request error '{}' - retrying in {}ms (attempt {}/{})", err, delay, attempt, max_retries));
                    sleep(Duration::from_millis(delay)).await;
                } else {
                    return Err(AppError::from(err));
                }
            }
        }
    }
}

fn backoff_delay_ms(attempt: u32) -> u64 {
    // 200ms, 400ms, 800ms (cap at 1.6s)
    let base = 200u64 * (1u64 << (attempt.saturating_sub(1).min(3)));
    base
}

// JSON/log helpers are in crate::serde_utils
