use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use crate::abort_manager::AbortRegistry;
use crate::serde_utils::truncate_for_log;
use crate::transport;
use crate::utils::{log_error, log_info};

mod helpers;
use helpers::{
    apply_body, apply_headers, apply_query_params, handle_non_streaming_response,
    handle_streaming_response,
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
            log_error(&app, "api_request", format!("client build error: {}", e));
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
                format!("[api_request] invalid method: {}", method_str),
            );
            return Err(e.to_string());
        }
    };

    let header_preview = req.headers.as_ref().map(|headers| {
        headers
            .iter()
            .map(|(key, value)| format!("{}={}", key, truncate_for_log(value, 64)))
            .collect::<Vec<_>>()
    });
    let query_keys = req
        .query
        .as_ref()
        .map(|query| query.keys().cloned().collect::<Vec<String>>());
    let body_preview = req.body.as_ref().map(crate::serde_utils::summarize_json);

    let mut request_builder = client.request(method.clone(), &req.url);

    log_info(
        &app,
        "api_request",
        format!("[api_request] method={} url={}", method_str, url_for_log),
    );

    request_builder = apply_query_params(&app, request_builder, &req);
    request_builder = apply_headers(&app, request_builder, &req);
    request_builder = apply_body(&app, request_builder, &req);

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
        format!(
            "[api_request] method={} full_url={} api_key={} stream={} request_id={:?} timeout_ms={:?}",
            method_str, url_for_log, api_key_for_log, stream, request_id, req.timeout_ms
        ),
    );

    if let Some(headers) = &header_preview {
        if !headers.is_empty() {
            log_info(
                &app,
                "api_request",
                format!("[api_request] headers: {}", headers.join(", ")),
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
                format!("[api_request] query params: {:?}", keys),
            );
        }
    }

    if let Some(body) = &body_preview {
        log_info(
            &app,
            "api_request",
            format!("[api_request] body preview: {}", body),
        );
    }

    log_info(&app, "api_request", "[api_request] sending request...");
    let response = match transport::send_with_retries(&app, "api_request", request_builder, 2).await
    {
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
                format!(
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
        format!("[api_request] response status: {} ok: {}", status, ok),
    );

    let mut headers = HashMap::new();

    for (key, value) in response.headers().iter() {
        if let Ok(text) = value.to_str() {
            log_info(
                &app,
                "api_request",
                format!(
                    "[api_request] response header: {}={}",
                    key,
                    truncate_for_log(text, 512)
                ),
            );
            headers.insert(key.to_string(), text.to_string());
        }
    }

    let data = if stream && request_id.is_some() {
        handle_streaming_response(
            &app,
            &req,
            response,
            request_id.clone().unwrap(),
            status,
            ok,
            &url_for_log,
        )
        .await?
    } else {
        handle_non_streaming_response(&app, &req, response, request_id.clone(), status, ok).await?
    };

    log_info(
        &app,
        "api_request",
        format!(
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
pub async fn abort_request(app: tauri::AppHandle, request_id: String) -> Result<(), String> {
    use tauri::Manager;

    log_info(
        &app,
        "abort_request",
        format!(
            "[abort_request] attempting to abort request_id={}",
            request_id
        ),
    );

    let registry = app.state::<AbortRegistry>();
    registry.abort(&request_id)?;

    log_info(
        &app,
        "abort_request",
        format!(
            "[abort_request] successfully aborted request_id={}",
            request_id
        ),
    );

    Ok(())
}
