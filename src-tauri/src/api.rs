use futures_util::StreamExt;
use reqwest::{header::HeaderMap, header::HeaderName, header::HeaderValue, Method};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;
use tauri::Emitter;

use crate::utils::log_backend;
use crate::{
    chat_manager::sse,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiRequest {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub query: Option<HashMap<String, Value>>,
    pub body: Option<Value>,
    pub timeout_ms: Option<u64>,
    pub stream: Option<bool>,
    pub request_id: Option<String>,
}

#[derive(Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub ok: bool,
    pub headers: HashMap<String, String>,
    pub data: Value,
}

impl ApiResponse {
    pub fn data(&self) -> &Value {
        &self.data
    }
}

fn json_value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::Bool(b) => Some(b.to_string()),
        Value::Number(n) => Some(n.to_string()),
        Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    }
}

fn parse_body_to_value(text: &str) -> Value {
    if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(text).unwrap_or_else(|_| Value::String(text.to_string()))
    }
}

fn truncate_for_log(text: &str, max: usize) -> String {
    if text.len() <= max {
        text.to_string()
    } else {
        let truncated: String = text.chars().take(max).collect();
        format!("{}…", truncated)
    }
}

fn sanitize_header_value(key: &str, value: &str) -> String {
    let lowered = key.to_ascii_lowercase();
    if lowered.contains("authorization")
        || lowered.contains("api-key")
        || lowered.contains("apikey")
        || lowered.contains("secret")
        || lowered.contains("token")
        || lowered.contains("cookie")
    {
        "***".into()
    } else {
        truncate_for_log(value, 64)
    }
}

fn summarize_json(value: &Value) -> String {
    truncate_for_log(&value.to_string(), 512)
}

#[tauri::command]
pub async fn api_request(app: tauri::AppHandle, req: ApiRequest) -> Result<ApiResponse, String> {
    log_backend(&app, "api_request", "[api_request] started");

    let mut client_builder = reqwest::Client::builder();
    if let Some(ms) = req.timeout_ms {
        log_backend(
            &app,
            "api_request",
            &format!("[api_request] setting timeout: {} ms", ms),
        );
        client_builder = client_builder.timeout(Duration::from_millis(ms));
    }
    let client = match client_builder.build() {
        Ok(c) => c,
        Err(e) => {
            log_backend(
                &app,
                "api_request",
                &format!("[api_request] client build error: {}", e),
            );
            return Err(e.to_string());
        }
    };

    let method_str = req.method.clone().unwrap_or_else(|| "POST".to_string());
    let url_for_log = req.url.clone();
    let method = match Method::from_bytes(method_str.as_bytes()) {
        Ok(m) => m,
        Err(e) => {
            log_backend(
                &app,
                "api_request",
                &format!("[api_request] invalid method: {}", method_str),
            );
            return Err(e.to_string());
        }
    };

    let header_preview = req.headers.as_ref().map(|headers| {
        headers
            .iter()
            .map(|(key, value)| format!("{}={}", key, sanitize_header_value(key, value)))
            .collect::<Vec<_>>()
    });
    let query_keys = req
        .query
        .as_ref()
        .map(|query| query.keys().cloned().collect::<Vec<String>>());
    let body_preview = req.body.as_ref().map(summarize_json);

    let mut request_builder = client.request(method.clone(), &req.url);

    log_backend(
        &app,
        "api_request",
        &format!("[api_request] method={} url={}", method_str, url_for_log),
    );

    if let Some(query) = &req.query {
        let mut params: Vec<(String, String)> = Vec::new();
        for (key, value) in query.iter() {
            if let Some(string_value) = json_value_to_string(value) {
                params.push((key.clone(), string_value));
            }
        }
        if !params.is_empty() {
            log_backend(
                &app,
                "api_request",
                &format!("[api_request] adding query params: {:?}", params),
            );
            request_builder = request_builder.query(&params);
        }
    }

    if let Some(headers) = &req.headers {
        let mut header_map = HeaderMap::new();
        for (key, value) in headers {
            log_backend(
                &app,
                "api_request",
                &format!(
                    "[api_request] adding header: {}={}",
                    key,
                    sanitize_header_value(key, value)
                ),
            );
            if let (Ok(name), Ok(header_value)) = (
                HeaderName::from_bytes(key.as_bytes()),
                HeaderValue::from_str(value),
            ) {
                header_map.insert(name, header_value);
            } else {
                log_backend(
                    &app,
                    "api_request",
                    &format!("[api_request] invalid header: {}={}", key, value),
                );
            }
        }
        header_map.insert(
            HeaderName::from_static("referer"),
            HeaderValue::from_static("https://github.com/LettuceAI/"),
        );
        header_map.insert(
            HeaderName::from_static("x-title"),
            HeaderValue::from_static("LettuceAI"),
        );
        log_backend(&app, "api_request", "All headers set");

        request_builder = request_builder.headers(header_map);
    } else {
        let mut header_map = HeaderMap::new();
        header_map.insert(
            HeaderName::from_static("referer"),
            HeaderValue::from_static("https://github.com/LettuceAI/"),
        );
        header_map.insert(
            HeaderName::from_static("x-title"),
            HeaderValue::from_static("LettuceAI"),
        );
        log_backend(&app, "api_request", "[api_request] using default headers");
        request_builder = request_builder.headers(header_map);
    }

    if let Some(body) = req.body.clone() {
        if let Some(text) = body.as_str() {
            log_backend(
                &app,
                "api_request",
                &format!(
                    "[api_request] setting body as text: {}",
                    truncate_for_log(text, 128)
                ),
            );
            request_builder = request_builder.body(text.to_owned());
        } else if !body.is_null() {
            log_backend(
                &app,
                "api_request",
                &format!(
                    "[api_request] setting body as JSON: {}",
                    summarize_json(&body)
                ),
            );
            request_builder = request_builder.json(&body);
        }
    }

    let stream = req.stream.unwrap_or(false);
    let request_id = req.request_id.clone();

    // Extract API key for logging
    let api_key_for_log = req
        .headers
        .as_ref()
        .and_then(|headers| {
            headers.iter().find_map(|(key, value)| {
                let lowered = key.to_ascii_lowercase();
                if lowered.contains("authorization")
                    || lowered.contains("api-key")
                    || lowered.contains("apikey")
                {
                    Some(value.clone())
                } else {
                    None
                }
            })
        })
        .unwrap_or_else(|| "<none>".to_string());

    log_backend(
        &app,
        "api_request",
        &format!(
        "[api_request] method={} full_url={} api_key={} stream={} request_id={:?} timeout_ms={:?}",
        method_str, url_for_log, api_key_for_log, stream, request_id, req.timeout_ms
    ),
    );

    if let Some(headers) = &header_preview {
        if !headers.is_empty() {
            log_backend(
                &app,
                "api_request",
                &format!("[api_request] headers: {}", headers.join(", ")),
            );
        }
    } else {
        log_backend(&app, "api_request", "[api_request] headers: <default>");
    }

    if let Some(keys) = &query_keys {
        if !keys.is_empty() {
            log_backend(
                &app,
                "api_request",
                &format!("[api_request] query params: {:?}", keys),
            );
        }
    }

    if let Some(body) = &body_preview {
        log_backend(
            &app,
            "api_request",
            &format!("[api_request] body preview: {}", body),
        );
    }

    log_backend(&app, "api_request", "[api_request] sending request...");
    let response = match request_builder.send().await {
        Ok(resp) => {
            log_backend(
                &app,
                "api_request",
                "[api_request] request sent successfully",
            );
            resp
        }
        Err(err) => {
            log_backend(
                &app,
                "api_request",
                &format!(
                    "[api_request] request error for {} (api_key={}): {}",
                    url_for_log, api_key_for_log, err
                ),
            );
            return Err(err.to_string());
        }
    };
    let status = response.status();
    let ok = status.is_success();

    log_backend(
        &app,
        "api_request",
        &format!("[api_request] response status: {} ok: {}", status, ok),
    );

    let mut headers = HashMap::new();

    for (key, value) in response.headers().iter() {
        if let Ok(text) = value.to_str() {
            log_backend(
                &app,
                "api_request",
                &format!(
                    "[api_request] response header: {}={}",
                    key,
                    truncate_for_log(text, 64)
                ),
            );
            headers.insert(key.to_string(), text.to_string());
        }
    }

    let data = if stream && request_id.is_some() {
        let mut collected: Vec<u8> = Vec::new();
        let event_name = format!("api://{}", request_id.clone().unwrap());
        let mut body_stream = response.bytes_stream();
        log_backend(
            &app,
            "api_request",
            &format!(
                "[api_request] streaming response for {} (api_key={}, event={})",
                url_for_log, api_key_for_log, event_name
            ),
        );
        while let Some(chunk) = body_stream.next().await {
            match chunk {
                Ok(chunk) => {
                    let text = String::from_utf8_lossy(&chunk).to_string();
                    let _ = app.emit(&event_name, text.clone());
                    log_backend(
                        &app,
                        "api_request",
                        &format!(
                            "[api_request] stream chunk: {} bytes for {}",
                            chunk.len(),
                            url_for_log
                        ),
                    );
                    // Also emit normalized events for consumers that want provider-agnostic stream
                    if let Some(req_id) = &request_id {
                        let normalized_event = format!("api-normalized://{}", req_id);
                        if let Some(delta) = sse::accumulate_text_from_sse(&text) {
                            if !delta.is_empty() {
                                let _ = app.emit(
                                    &normalized_event,
                                    json!({
                                        "requestId": req_id,
                                        "type": "delta",
                                        "data": { "text": delta },
                                    }),
                                );
                            }
                        }
                        if let Some(usage) = sse::usage_from_sse(&text) {
                            let _ = app.emit(
                                &normalized_event,
                                json!({
                                    "requestId": req_id,
                                    "type": "usage",
                                    "data": usage,
                                }),
                            );
                        }
                        if text.contains("[DONE]") {
                            let _ = app.emit(
                                &normalized_event,
                                json!({
                                    "requestId": req_id,
                                    "type": "done",
                                    "data": null,
                                }),
                            );
                        }
                    }
                    collected.extend_from_slice(&chunk);
                }
                Err(e) => {
                    log_backend(
                        &app,
                        "api_request",
                        &format!("[api_request] stream error: {}", e),
                    );
                    return Err(e.to_string());
                }
            }
        }
        let text = String::from_utf8_lossy(&collected).to_string();
        log_backend(
            &app,
            "api_request",
            &format!(
                "[api_request] stream completed, total bytes: {}",
                collected.len()
            ),
        );
        parse_body_to_value(&text)
    } else {
        match response.bytes().await {
            Ok(bytes) => {
                log_backend(
                    &app,
                    "api_request",
                    &format!("[api_request] response body bytes: {}", bytes.len()),
                );
                let text = String::from_utf8_lossy(&bytes).to_string();
                log_backend(
                    &app,
                    "api_request",
                    &format!(
                        "[api_request] response body preview: {}",
                        truncate_for_log(&text, 256)
                    ),
                );
                parse_body_to_value(&text)
            }
            Err(e) => {
                log_backend(
                    &app,
                    "api_request",
                    &format!("[api_request] error reading response body: {}", e),
                );
                return Err(e.to_string());
            }
        }
    };

    log_backend(
        &app,
        "api_request",
        &format!(
            "[api_request] completed {} {} (api_key={}) status={} ok={} stream={} request_id={:?}",
            method_str, url_for_log, api_key_for_log, status, ok, stream, request_id
        ),
    );

    Ok(ApiResponse {
        status: status.as_u16(),
        ok,
        headers,
        data,
    })
}
