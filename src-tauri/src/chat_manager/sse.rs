use serde_json::Value;

use super::types::{NormalizedEvent, UsageSummary};

pub fn accumulate_text_from_sse(raw: &str) -> Option<String> {
    let mut out = String::new();
    for line in raw.lines() {
        let l = line.trim();
        if !l.starts_with("data:") {
            continue;
        }
        let payload = l[5..].trim();
        if payload.is_empty() || payload == "[DONE]" {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(payload) {
            if let Some(piece) = extract_text_from_value(&v) {
                out.push_str(&piece);
            }
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

pub fn usage_from_sse(raw: &str) -> Option<UsageSummary> {
    let mut last: Option<UsageSummary> = None;
    for line in raw.lines() {
        let l = line.trim();
        if !l.starts_with("data:") {
            continue;
        }
        let payload = l[5..].trim();
        if payload.is_empty() || payload == "[DONE]" {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(payload) {
            if let Some(u) = usage_from_value(&v) {
                last = Some(u);
            }
        }
    }
    last
}

/// Buffered SSE decoder that can handle JSON fragments split across chunk boundaries
/// and produce provider-agnostic normalized events.
#[derive(Default)]
pub struct SseDecoder {
    buffer: String,
}

impl SseDecoder {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
        }
    }

    /// Feed a raw text chunk, returning any complete normalized events parsed from it.
    pub fn feed(&mut self, chunk: &str) -> Vec<NormalizedEvent> {
        self.buffer.push_str(chunk);
        let mut events: Vec<NormalizedEvent> = Vec::new();

        // Process complete lines; keep the trailing partial line in buffer
        let mut last_newline = 0usize;
        for (idx, ch) in self.buffer.char_indices() {
            if ch == '\n' {
                let line = &self.buffer[last_newline..idx];
                last_newline = idx + 1; // skip the newline
                let l = line.trim();
                if l.is_empty() {
                    continue;
                }
                // Common SSE format: data: <payload>
                if let Some(rest) = l.strip_prefix("data:") {
                    let payload = rest.trim();
                    if payload.is_empty() {
                        continue;
                    }
                    if payload == "[DONE]" {
                        events.push(NormalizedEvent::Done);
                        continue;
                    }
                    if let Ok(v) = serde_json::from_str::<Value>(payload) {
                        if let Some(piece) = extract_text_from_value(&v) {
                            if !piece.is_empty() {
                                events.push(NormalizedEvent::Delta { text: piece });
                            }
                        }
                        if let Some(usage) = usage_from_value(&v) {
                            events.push(NormalizedEvent::Usage { usage });
                        }
                    }
                }
            }
        }
        // retain leftover tail (after the last processed newline)
        if last_newline > 0 {
            self.buffer.drain(..last_newline);
        }
        events
    }
}

fn extract_text_from_value(v: &Value) -> Option<String> {
    // Common streaming shapes: OpenAI delta, Mistral content, generic content/text
    if let Some(s) = v
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("delta"))
        .and_then(|d| d.get("content"))
        .and_then(|t| t.as_str())
    {
        return Some(s.to_string());
    }
    // Anthropic Messages API streaming: content_block_delta -> delta -> text
    if v.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
        if let Some(s) = v
            .get("delta")
            .and_then(|d| d.get("text"))
            .and_then(|t| t.as_str())
        {
            return Some(s.to_string());
        }
    }
    if let Some(s) = v.get("content").and_then(|t| t.as_str()) {
        return Some(s.to_string());
    }
    if let Some(s) = v
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|t| t.as_str())
    {
        return Some(s.to_string());
    }
    if let Some(s) = v.get("text").and_then(|t| t.as_str()) {
        return Some(s.to_string());
    }
    None
}

fn usage_from_value(v: &Value) -> Option<UsageSummary> {
    let u = v.get("usage")?;
    let prompt_tokens = take_first(
        u,
        &[
            "prompt_tokens",
            "input_tokens",
            "promptTokens",
            "inputTokens",
        ],
    );
    let completion_tokens = take_first(
        u,
        &[
            "completion_tokens",
            "output_tokens",
            "completionTokens",
            "outputTokens",
        ],
    );
    let total_tokens = take_first(u, &["total_tokens", "totalTokens"]).or_else(|| {
        match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        }
    });
    if prompt_tokens.is_none() && completion_tokens.is_none() && total_tokens.is_none() {
        None
    } else {
        Some(UsageSummary {
            prompt_tokens,
            completion_tokens,
            total_tokens,
        })
    }
}

fn take_first(map: &Value, keys: &[&str]) -> Option<u64> {
    for k in keys {
        if let Some(val) = map.get(*k) {
            if let Some(n) = val.as_u64() {
                return Some(n);
            }
            if let Some(s) = val.as_str() {
                if let Ok(n) = s.trim().parse::<u64>() {
                    return Some(n);
                }
            }
        }
    }
    None
}
