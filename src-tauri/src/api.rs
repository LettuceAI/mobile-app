use futures_util::StreamExt;
use reqwest::{header::HeaderMap, header::HeaderName, header::HeaderValue, Method};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use crate::abort_manager::AbortRegistry;
use crate::utils::{log_error, log_info, log_warn};
use crate::chat_manager::{sse, request as chat_request, types::{ErrorEnvelope, NormalizedEvent}};
use crate::transport::{self, emit_normalized};
use crate::serde_utils::{json_value_to_string, parse_body_to_value, sanitize_header_value, summarize_json, truncate_for_log};

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
    pub provider_id: Option<String>,
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

#[tauri::command]
pub async fn api_request(app: tauri::AppHandle, req: ApiRequest) -> Result<ApiResponse, String> {
    log_info(&app, "api_request", "started");

    let client = match transport::build_client(req.timeout_ms) {
        Ok(c) => c,
        Err(e) => {
            log_error(
                &app,
                "api_request",
                &format!("client build error: {}", e),
            );
            return Err(e.to_string());
        }
    };

    let method_str = req.method.clone().unwrap_or_else(|| "POST".to_string());
    let url_for_log = req.url.clone();
    let method = match Method::from_bytes(method_str.as_bytes()) {
        Ok(m) => m,
        Err(e) => {
            log_error(
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

    log_info(
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
            log_info(
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
            log_info(
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
                log_warn(
                    &app,
                    "api_request",
                    &format!("[api_request] invalid header: {}={}", key, value),
                );
            }
        }
        header_map.insert(
            HeaderName::from_bytes(b"HTTP-Referer").unwrap(),
            HeaderValue::from_static("https://github.com/LettuceAI/"),
        );
        header_map.insert(
            HeaderName::from_bytes(b"X-Title").unwrap(),
            HeaderValue::from_static("LettuceAI"),
        );
        log_info(&app, "api_request", "All headers set");

        request_builder = request_builder.headers(header_map);
    } else {
        let mut header_map = HeaderMap::new();
        header_map.insert(
            HeaderName::from_bytes(b"HTTP-Referer").unwrap(),
            HeaderValue::from_static("https://github.com/LettuceAI/"),
        );
        header_map.insert(
            HeaderName::from_bytes(b"X-Title").unwrap(),
            HeaderValue::from_static("LettuceAI"),
        );
        log_info(&app, "api_request", "[api_request] using default headers");
        request_builder = request_builder.headers(header_map);
    }

    if let Some(body) = req.body.clone() {
        if let Some(text) = body.as_str() {
            log_info(
                &app,
                "api_request",
                &format!(
                    "[api_request] setting body as text: {}",
                    truncate_for_log(text, 512)
                ),
            );
            request_builder = request_builder.body(text.to_owned());
        } else if !body.is_null() {
            log_info(
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

    log_info(
        &app,
        "api_request",
        &format!(
        "[api_request] method={} full_url={} api_key={} stream={} request_id={:?} timeout_ms={:?}",
        method_str, url_for_log, api_key_for_log, stream, request_id, req.timeout_ms
    ),
    );

    if let Some(headers) = &header_preview {
        if !headers.is_empty() {
            log_info(
                &app,
                "api_request",
                &format!("[api_request] headers: {}", headers.join(", ")),
            );
        }
    } else {
        log_info(&app, "api_request", "[api_request] headers: <default>");
    }

    if let Some(keys) = &query_keys {
        if !keys.is_empty() {
            log_info(
                &app,
                "api_request",
                &format!("[api_request] query params: {:?}", keys),
            );
        }
    }

    if let Some(body) = &body_preview {
        log_info(
            &app,
            "api_request",
            &format!("[api_request] body preview: {}", body),
        );
    }

    log_info(&app, "api_request", "[api_request] sending request...");
    let response = match transport::send_with_retries(&app, "api_request", request_builder, 2).await {
        Ok(resp) => {
            log_info(
                &app,
                "api_request",
                "[api_request] request sent successfully",
            );
            resp
        }
        Err(err) => {
            log_info(
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

    log_info(
        &app,
        "api_request",
        &format!("[api_request] response status: {} ok: {}", status, ok),
    );

    let mut headers = HashMap::new();

    for (key, value) in response.headers().iter() {
        if let Ok(text) = value.to_str() {
            log_info(
                &app,
                "api_request",
                &format!(
                    "[api_request] response header: {}={}",
                    key,
                    truncate_for_log(text, 512)
                ),
            );
            headers.insert(key.to_string(), text.to_string());
        }
    }

    let data = if stream && request_id.is_some() {
    let mut collected: Vec<u8> = Vec::new();
        let event_name = format!("api://{}", request_id.clone().unwrap());
        let mut body_stream = response.bytes_stream();
        log_info(
            &app,
            "api_request",
            &format!(
                "[api_request] streaming response for {} (api_key={}, event={})",
                url_for_log, api_key_for_log, event_name
            ),
        );
        
        // Register this request for abort capability
        let mut abort_rx = {
            use tauri::Manager;
            let registry = app.state::<AbortRegistry>();
            registry.register(request_id.clone().unwrap())
        };
        
        let mut usage_emitted = false;
        let mut decoder = sse::SseDecoder::new();
        let mut aborted = false;
        
        loop {
            tokio::select! {
                // Check for abort signal
                _ = &mut abort_rx => {
                    log_warn(
                        &app,
                        "api_request",
                        &format!("[api_request] request aborted by user: {}", url_for_log),
                    );
                    aborted = true;
                    break;
                }
                // Process stream chunks
                chunk_result = body_stream.next() => {
                    match chunk_result {
                        Some(Ok(chunk)) => {
                            let text = String::from_utf8_lossy(&chunk).to_string();
                            transport::emit_raw(&app, &event_name, &text);
                            log_info(
                                &app,
                                "api_request",
                                &format!(
                                    "[api_request] stream chunk: {} bytes for {}",
                                    chunk.len(),
                                    url_for_log
                                ),
                            );
                            // Buffered SSE decoding to normalized events
                            if let Some(req_id) = &request_id {
                                for event in decoder.feed(&text) {
                                    if let NormalizedEvent::Usage { .. } = event { usage_emitted = true; }
                                    emit_normalized(&app, req_id, event);
                                }
                            }
                            collected.extend_from_slice(&chunk);
                        }
                        Some(Err(e)) => {
                            log_error(
                                &app,
                                "api_request",
                                &format!("[api_request] stream error: {}", e),
                            );
                            // Unregister before returning error
                            if let Some(req_id) = &request_id {
                                use tauri::Manager;
                                let registry = app.state::<AbortRegistry>();
                                registry.unregister(req_id);
                            }
                            return Err(e.to_string());
                        }
                        None => {
                            // Stream complete
                            break;
                        }
                    }
                }
            }
        }
        
        // Unregister the request
        if let Some(req_id) = &request_id {
            use tauri::Manager;
            let registry = app.state::<AbortRegistry>();
            registry.unregister(req_id);
        }
        
        if aborted {
            // Emit abort error event
            if let Some(req_id) = &request_id {
                let envelope = ErrorEnvelope {
                    code: Some("ABORTED".to_string()),
                    message: "Request was cancelled by user".to_string(),
                    provider_id: req.provider_id.clone(),
                    request_id: request_id.clone(),
                    retryable: Some(false),
                    status: None,
                };
                emit_normalized(&app, req_id, NormalizedEvent::Error { envelope });
            }
            return Err("Request aborted by user".to_string());
        }
        
    let text = String::from_utf8_lossy(&collected).to_string();
        log_info(
            &app,
            "api_request",
            &format!(
                "[api_request] stream completed, total bytes: {}",
                collected.len()
            ),
        );
        // Emit a final usage event if not already emitted and we can extract it
        if let Some(req_id) = &request_id {
            if !usage_emitted {
                let value = crate::serde_utils::parse_body_to_value(&text);
                if let Some(usage) = chat_request::extract_usage(&value) {
                    emit_normalized(&app, req_id, NormalizedEvent::Usage { usage });
                }
            }
        }

        // If HTTP status was not OK, emit a normalized error event as well
        if !ok {
            if let Some(req_id) = &request_id {
                let value = crate::serde_utils::parse_body_to_value(&text);
                let message = chat_request::extract_error_message(&value)
                    .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
                let envelope = ErrorEnvelope {
                    code: None,
                    message,
                    provider_id: req.provider_id.clone(),
                    request_id: request_id.clone(),
                    retryable: None,
                    status: Some(status.as_u16()),
                };
                emit_normalized(&app, req_id, NormalizedEvent::Error { envelope });
            }
        }
        parse_body_to_value(&text)
    } else {
        match response.bytes().await {
            Ok(bytes) => {
                log_info(
                    &app,
                    "api_request",
                    &format!("[api_request] response body bytes: {}", bytes.len()),
                );
                let text = String::from_utf8_lossy(&bytes).to_string();
                log_info(
                    &app,
                    "api_request",
                    &format!(
                        "[api_request] response body preview: {}",
                        truncate_for_log(&text, 512)
                    ),
                );
                let value = parse_body_to_value(&text);
                if !ok {
                    if let Some(req_id) = &request_id {
                        let message = chat_request::extract_error_message(&value)
                            .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
                        let envelope = ErrorEnvelope {
                            code: None,
                            message,
                            provider_id: req.provider_id.clone(),
                            request_id: request_id.clone(),
                            retryable: None,
                            status: Some(status.as_u16()),
                        };
                        emit_normalized(&app, req_id, NormalizedEvent::Error { envelope });
                    }
                }
                value
            }
            Err(e) => {
                log_error(
                    &app,
                    "api_request",
                    &format!("[api_request] error reading response body: {}", e),
                );
                return Err(e.to_string());
            }
        }
    };

    log_info(
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

#[tauri::command]
pub async fn abort_request(
    app: tauri::AppHandle,
    request_id: String,
) -> Result<(), String> {
    use tauri::Manager;
    
    log_info(
        &app,
        "abort_request",
        &format!("[abort_request] attempting to abort request_id={}", request_id),
    );
    
    let registry = app.state::<AbortRegistry>();
    registry.abort(&request_id)?;

    log_info(
        &app,
        "abort_request",
        &format!("[abort_request] successfully aborted request_id={}", request_id),
    );
    
    Ok(())
}
