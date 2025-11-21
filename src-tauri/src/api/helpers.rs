use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde_json::Value;

use crate::{
    abort_manager::AbortRegistry,
    chat_manager::{
        request as chat_request,
        sse,
        tooling::parse_tool_calls,
        types::{ErrorEnvelope, NormalizedEvent},
    },
    serde_utils::{json_value_to_string, parse_body_to_value, sanitize_header_value, summarize_json},
    transport::{self, emit_normalized},
    utils::{log_error, log_info, log_warn},
};

use super::ApiRequest;

pub(crate) fn apply_query_params(
    app: &tauri::AppHandle,
    builder: reqwest::RequestBuilder,
    req: &ApiRequest,
) -> reqwest::RequestBuilder {
    if let Some(query) = &req.query {
        let mut params: Vec<(String, String)> = Vec::new();
        for (key, value) in query.iter() {
            if let Some(string_value) = json_value_to_string(value) {
                params.push((key.clone(), string_value));
            }
        }
        if !params.is_empty() {
            log_info(
                app,
                "api_request",
                &format!("[api_request] adding query params: {:?}", params),
            );
            return builder.query(&params);
        }
    }
    builder
}

pub(crate) fn apply_headers(
    app: &tauri::AppHandle,
    builder: reqwest::RequestBuilder,
    req: &ApiRequest,
) -> reqwest::RequestBuilder {
    if let Some(headers) = &req.headers {
        let mut header_map = HeaderMap::new();
        for (key, value) in headers {
            log_info(
                app,
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
                    app,
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
        log_info(app, "api_request", "All headers set");

        builder.headers(header_map)
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
        log_info(app, "api_request", "[api_request] using default headers");
        builder.headers(header_map)
    }
}

pub(crate) fn apply_body(
    app: &tauri::AppHandle,
    builder: reqwest::RequestBuilder,
    req: &ApiRequest,
) -> reqwest::RequestBuilder {
    if let Some(body) = req.body.clone() {
        if let Some(text) = body.as_str() {
            log_info(
                app,
                "api_request",
                &format!(
                    "[api_request] setting body as text: {}",
                    crate::serde_utils::truncate_for_log(text, 512)
                ),
            );
            builder.body(text.to_owned())
        } else if !body.is_null() {
            log_info(
                app,
                "api_request",
                &format!(
                    "[api_request] setting body as JSON: {}",
                    summarize_json(&body)
                ),
            );
            builder.json(&body)
        } else {
            builder
        }
    } else {
        builder
    }
}

pub(crate) async fn handle_streaming_response(
    app: &tauri::AppHandle,
    req: &ApiRequest,
    mut response: reqwest::Response,
    request_id: String,
    status: reqwest::StatusCode,
    ok: bool,
    url_for_log: &str,
) -> Result<Value, String> {
    let mut collected: Vec<u8> = Vec::new();
    let event_name = format!("api://{}", request_id);
    let mut body_stream = response.bytes_stream();
    log_info(
        app,
        "api_request",
        &format!(
            "[api_request] streaming response for {} (provider={:?}, event={})",
            url_for_log, req.provider_id, event_name
        ),
    );

    // Register this request for abort capability
    let mut abort_rx = {
        use tauri::Manager;
        let registry = app.state::<AbortRegistry>();
        registry.register(request_id.clone())
    };

    let mut usage_emitted = false;
    let mut decoder = sse::SseDecoder::new();
    let mut aborted = false;

    loop {
        tokio::select! {
            // Check for abort signal
            _ = &mut abort_rx => {
                log_warn(
                    app,
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
                        transport::emit_raw(app, &event_name, &text);
                        log_info(
                            app,
                            "api_request",
                            &format!(
                                "[api_request] stream chunk: {} bytes for {}",
                                chunk.len(),
                                url_for_log
                            ),
                        );
                        // Buffered SSE decoding to normalized events
                        for event in decoder.feed(&text, req.provider_id.as_deref()) {
                            if let NormalizedEvent::Usage { .. } = event { usage_emitted = true; }
                            emit_normalized(app, &request_id, event);
                        }
                        collected.extend_from_slice(&chunk);
                    }
                    Some(Err(e)) => {
                        log_error(
                            app,
                            "api_request",
                            &format!("[api_request] stream error: {}", e),
                        );
                        // Unregister before returning error
                        use tauri::Manager;
                        let registry = app.state::<AbortRegistry>();
                        registry.unregister(&request_id);
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
    {
        use tauri::Manager;
        let registry = app.state::<AbortRegistry>();
        registry.unregister(&request_id);
    }

    if aborted {
        let envelope = ErrorEnvelope {
            code: Some("ABORTED".to_string()),
            message: "Request was cancelled by user".to_string(),
            provider_id: req.provider_id.clone(),
            request_id: Some(request_id.clone()),
            retryable: Some(false),
            status: None,
        };
        emit_normalized(app, &request_id, NormalizedEvent::Error { envelope });
        return Err("Request aborted by user".to_string());
    }

    let text = String::from_utf8_lossy(&collected).to_string();
    log_info(
        app,
        "api_request",
        &format!(
            "[api_request] stream completed, total bytes: {}",
            collected.len()
        ),
    );
    let value = parse_body_to_value(&text);
    let provider_id = req.provider_id.as_deref().unwrap_or_default();
    let calls = parse_tool_calls(provider_id, &value);
    if !calls.is_empty() {
        emit_normalized(app, &request_id, NormalizedEvent::ToolCall { calls });
    }
    // Emit a final usage event if not already emitted and we can extract it
    if !usage_emitted {
        if let Some(usage) = chat_request::extract_usage(&value) {
            emit_normalized(app, &request_id, NormalizedEvent::Usage { usage });
        }
    }

    // If HTTP status was not OK, emit a normalized error event as well
    if !ok {
        let message = chat_request::extract_error_message(&value)
            .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
        let envelope = ErrorEnvelope {
            code: None,
            message,
            provider_id: req.provider_id.clone(),
            request_id: Some(request_id.clone()),
            retryable: None,
            status: Some(status.as_u16()),
        };
        emit_normalized(app, &request_id, NormalizedEvent::Error { envelope });
    }

    Ok(value)
}

pub(crate) async fn handle_non_streaming_response(
    app: &tauri::AppHandle,
    req: &ApiRequest,
    response: reqwest::Response,
    request_id: Option<String>,
    status: reqwest::StatusCode,
    ok: bool,
) -> Result<Value, String> {
    match response.bytes().await {
        Ok(bytes) => {
            log_info(
                app,
                "api_request",
                &format!("[api_request] response body bytes: {}", bytes.len()),
            );
            let text = String::from_utf8_lossy(&bytes).to_string();
            log_info(
                app,
                "api_request",
                &format!(
                    "[api_request] response body preview: {}",
                    crate::serde_utils::truncate_for_log(&text, 512)
                ),
            );
            let value = parse_body_to_value(&text);
            if let Some(req_id) = &request_id {
                let calls = parse_tool_calls(
                    req.provider_id.as_deref().unwrap_or_default(),
                    &value,
                );
                if !calls.is_empty() {
                    emit_normalized(app, req_id, NormalizedEvent::ToolCall { calls });
                }
            }
            if !ok {
                if let Some(req_id) = &request_id {
                    let message = chat_request::extract_error_message(&value)
                        .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
                    let envelope = ErrorEnvelope {
                        code: None,
                        message,
                        provider_id: req.provider_id.clone(),
                        request_id: Some(req_id.clone()),
                        retryable: None,
                        status: Some(status.as_u16()),
                    };
                    emit_normalized(app, req_id, NormalizedEvent::Error { envelope });
                }
            }
            Ok(value)
        }
        Err(e) => {
            log_error(
                app,
                "api_request",
                &format!("[api_request] error reading response body: {}", e),
            );
            Err(e.to_string())
        }
    }
}

