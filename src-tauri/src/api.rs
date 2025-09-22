use futures_util::StreamExt;
use reqwest::{header::HeaderMap, header::HeaderName, header::HeaderValue, Method};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;
use tauri::Emitter;

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

#[tauri::command]
pub async fn api_request(app: tauri::AppHandle, req: ApiRequest) -> Result<ApiResponse, String> {
    let mut client_builder = reqwest::Client::builder();
    if let Some(ms) = req.timeout_ms {
        client_builder = client_builder.timeout(Duration::from_millis(ms));
    }
    let client = client_builder.build().map_err(|e| e.to_string())?;

    let method_str = req.method.unwrap_or_else(|| "POST".to_string());
    let method = Method::from_bytes(method_str.as_bytes()).map_err(|e| e.to_string())?;

    let mut request_builder = client.request(method, &req.url);

    if let Some(query) = &req.query {
        let mut params: Vec<(String, String)> = Vec::new();
        for (key, value) in query.iter() {
            if let Some(string_value) = json_value_to_string(value) {
                params.push((key.clone(), string_value));
            }
        }
        if !params.is_empty() {
            request_builder = request_builder.query(&params);
        }
    }

    if let Some(headers) = &req.headers {
        let mut header_map = HeaderMap::new();
        for (key, value) in headers {
            if let (Ok(name), Ok(header_value)) = (
                HeaderName::from_bytes(key.as_bytes()),
                HeaderValue::from_str(value),
            ) {
                header_map.insert(name, header_value);
            }
        }
        request_builder = request_builder.headers(header_map);
    }

    if let Some(body) = req.body {
        if let Some(text) = body.as_str() {
            request_builder = request_builder.body(text.to_owned());
        } else if !body.is_null() {
            request_builder = request_builder.json(&body);
        }
    }

    let stream = req.stream.unwrap_or(false);
    let request_id = req.request_id.clone();

    let response = request_builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let ok = status.is_success();

    let mut headers = HashMap::new();

    headers.insert(
        "HTTP-Referer".to_string(),
        "https://github.com/LettuceAI/".to_string(),
    );
    headers.insert("X-Title".to_string(), "LettuceAI".to_string());

    for (key, value) in response.headers().iter() {
        if let Ok(text) = value.to_str() {
            headers.insert(key.to_string(), text.to_string());
        }
    }

    let data = if stream && request_id.is_some() {
        let mut collected: Vec<u8> = Vec::new();
        let event_name = format!("api://{}", request_id.unwrap());
        let mut body_stream = response.bytes_stream();
        while let Some(chunk) = body_stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            let text = String::from_utf8_lossy(&chunk).to_string();
            let _ = app.emit(&event_name, text.clone());
            collected.extend_from_slice(&chunk);
        }
        let text = String::from_utf8_lossy(&collected).to_string();
        parse_body_to_value(&text)
    } else {
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&bytes).to_string();
        parse_body_to_value(&text)
    };

    Ok(ApiResponse {
        status: status.as_u16(),
        ok,
        headers,
        data,
    })
}
