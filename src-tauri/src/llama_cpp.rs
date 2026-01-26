use std::collections::HashMap;

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::api::{ApiRequest, ApiResponse};
use crate::chat_manager::types::{ErrorEnvelope, NormalizedEvent, UsageSummary};
use crate::transport;
#[cfg(not(mobile))]
use crate::utils::{emit_toast, log_error, log_info, log_warn};

const LOCAL_PROVIDER_ID: &str = "llamacpp";

#[cfg(not(mobile))]
mod desktop {
    use super::*;
    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::{AddBos, LlamaChatMessage, LlamaChatTemplate, LlamaModel, Special};
    use llama_cpp_2::sampling::LlamaSampler;
    use std::num::NonZeroU32;
    use std::path::Path;
    use std::sync::{Mutex, OnceLock};
    use tokio::sync::oneshot::error::TryRecvError;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct LlamaCppContextInfo {
        max_context_length: u32,
        recommended_context_length: Option<u32>,
        available_memory_bytes: Option<u64>,
        model_size_bytes: Option<u64>,
    }

    struct LlamaState {
        backend: Option<LlamaBackend>,
        model_path: Option<String>,
        model: Option<LlamaModel>,
    }

    static ENGINE: OnceLock<Mutex<LlamaState>> = OnceLock::new();

    fn load_engine(
        app: Option<&AppHandle>,
        model_path: &str,
    ) -> Result<std::sync::MutexGuard<'static, LlamaState>, String> {
        let engine = ENGINE.get_or_init(|| {
            Mutex::new(LlamaState {
                backend: None,
                model_path: None,
                model: None,
            })
        });

        let mut guard = engine
            .lock()
            .map_err(|_| "llama.cpp engine lock poisoned".to_string())?;

        if guard.backend.is_none() {
            guard.backend = Some(
                LlamaBackend::init()
                    .map_err(|e| format!("Failed to initialize llama backend: {e}"))?,
            );
        }

        let should_reload = guard.model_path.as_deref() != Some(model_path);
        if guard.model.is_none() || should_reload {
            let backend = guard
                .backend
                .as_ref()
                .ok_or_else(|| "llama.cpp backend unavailable".to_string())?;
            let supports_gpu = backend.supports_gpu_offload();
            let gpu_params = LlamaModelParams::default().with_n_gpu_layers(u32::MAX);
            let cpu_params = LlamaModelParams::default().with_n_gpu_layers(0);

            let model = if supports_gpu {
                match LlamaModel::load_from_file(backend, model_path, &gpu_params) {
                    Ok(model) => model,
                    Err(err) => {
                        if let Some(app) = app {
                            log_warn(
                                app,
                                "llama_cpp",
                                format!("GPU model load failed, falling back to CPU: {err}"),
                            );
                            emit_toast(
                                app,
                                "warning",
                                "GPU memory is insufficient for this model",
                                Some(
                                    "Falling back to CPU + RAM. Performance may be slower."
                                        .to_string(),
                                ),
                            );
                        }
                        LlamaModel::load_from_file(backend, model_path, &cpu_params).map_err(
                            |e| format!("Failed to load llama model with CPU fallback: {e}"),
                        )?
                    }
                }
            } else {
                LlamaModel::load_from_file(backend, model_path, &cpu_params)
                    .map_err(|e| format!("Failed to load llama model: {e}"))?
            };

            guard.model = Some(model);
            guard.model_path = Some(model_path.to_string());
        }

        Ok(guard)
    }

    fn normalize_role(role: &str) -> &'static str {
        match role {
            "system" | "developer" => "system",
            "assistant" => "assistant",
            "user" => "user",
            _ => "user",
        }
    }

    fn sanitize_text(value: &str) -> String {
        value.replace('\0', "")
    }

    fn get_available_memory_bytes() -> Option<u64> {
        let mut sys = sysinfo::System::new();
        sys.refresh_memory();
        Some(sys.available_memory())
    }

    fn estimate_kv_bytes_per_token(model: &LlamaModel) -> Option<u64> {
        let n_layer = u64::from(model.n_layer());
        let n_embd = u64::try_from(model.n_embd()).ok()?;

        // Default to n_head if n_head_kv is not available or zero (older models)
        let n_head = u64::try_from(model.n_head()).unwrap_or(1).max(1);
        let n_head_kv = u64::try_from(model.n_head_kv()).unwrap_or(n_head).max(1);

        // GQA Ratio: In Llama 3, this is 8/32 = 0.25
        // We calculate the effective embedding size for the KV cache
        let gqa_correction = n_head_kv as f64 / n_head as f64;
        let effective_n_embd = (n_embd as f64 * gqa_correction) as u64;

        // F16 (2 bytes) is the default KV cache type in llama.cpp unless changed.
        // K cache + V cache = 2 matrices
        let bytes_per_value = 2_u64;

        Some(
            n_layer
                .saturating_mul(effective_n_embd)
                .saturating_mul(2 * bytes_per_value),
        )
    }

    fn compute_recommended_context(
        model: &LlamaModel,
        available_memory_bytes: Option<u64>,
        max_context_length: u32,
    ) -> Option<u32> {
        let available = available_memory_bytes?;
        let model_size = model.size();
        let reserve = (available / 5).max(512 * 1024 * 1024);
        let available_for_ctx = available.saturating_sub(model_size.saturating_add(reserve));
        let kv_bytes_per_token = estimate_kv_bytes_per_token(model)?;
        if kv_bytes_per_token == 0 {
            return None;
        }
        let mut recommended = available_for_ctx / kv_bytes_per_token;
        if recommended > u64::from(max_context_length) {
            recommended = u64::from(max_context_length);
        }
        Some(recommended as u32)
    }

    fn extract_text_content(message: &Value) -> String {
        let content = message.get("content");
        match content {
            Some(Value::String(text)) => sanitize_text(text),
            Some(Value::Array(parts)) => {
                let mut out: Vec<String> = Vec::new();
                for part in parts {
                    let part_type = part.get("type").and_then(|v| v.as_str());
                    if part_type == Some("text") {
                        if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                            let cleaned = sanitize_text(text);
                            if !cleaned.is_empty() {
                                out.push(cleaned);
                            }
                        }
                    }
                }
                out.join("\n")
            }
            _ => String::new(),
        }
    }

    fn build_fallback_prompt(messages: &[Value]) -> String {
        let mut prompt = String::new();
        for message in messages {
            let role = message
                .get("role")
                .and_then(|v| v.as_str())
                .map(normalize_role)
                .unwrap_or("user");
            let content = extract_text_content(message);
            if content.is_empty() {
                continue;
            }
            prompt.push_str(role);
            prompt.push_str(": ");
            prompt.push_str(&content);
            prompt.push('\n');
        }
        prompt.push_str("assistant: ");
        prompt
    }

    fn build_prompt(model: &LlamaModel, messages: &[Value]) -> Result<String, String> {
        let mut chat_messages = Vec::new();
        for message in messages {
            let role = message
                .get("role")
                .and_then(|v| v.as_str())
                .map(normalize_role)
                .unwrap_or("user");
            let content = extract_text_content(message);
            if content.is_empty() {
                continue;
            }
            let chat_message = LlamaChatMessage::new(role.to_string(), content)
                .map_err(|e| format!("Invalid chat message: {e}"))?;
            chat_messages.push(chat_message);
        }

        if chat_messages.is_empty() {
            return Err("No usable chat messages for llama.cpp".into());
        }

        let template = model
            .chat_template(None)
            .or_else(|_| LlamaChatTemplate::new("chatml"))
            .map_err(|e| format!("Failed to load chat template: {e}"))?;

        let prompt = match model.apply_chat_template(&template, &chat_messages, true) {
            Ok(text) => text,
            Err(_) => build_fallback_prompt(messages),
        };

        Ok(prompt)
    }

    fn build_sampler(temperature: f64, top_p: f64, top_k: Option<u32>) -> LlamaSampler {
        let mut samplers = Vec::new();
        let k = top_k.unwrap_or(40) as i32;
        samplers.push(LlamaSampler::top_k(k));

        let p = if top_p > 0.0 { top_p } else { 1.0 };
        samplers.push(LlamaSampler::top_p(p as f32, 1));

        if temperature > 0.0 {
            samplers.push(LlamaSampler::temp(temperature as f32));
            samplers.push(LlamaSampler::dist(rand::random::<u32>()));
        } else {
            samplers.push(LlamaSampler::greedy());
        }

        LlamaSampler::chain(samplers, false)
    }

    pub async fn llamacpp_context_info(
        app: AppHandle,
        model_path: String,
    ) -> Result<LlamaCppContextInfo, String> {
        if model_path.trim().is_empty() {
            return Err("llama.cpp model path is empty".to_string());
        }
        if !Path::new(&model_path).exists() {
            return Err(format!("llama.cpp model path not found: {}", model_path));
        }

        let engine = load_engine(Some(&app), &model_path)?;
        let model = engine
            .model
            .as_ref()
            .ok_or_else(|| "llama.cpp model unavailable".to_string())?;
        let max_ctx = model.n_ctx_train().max(1);
        let available_memory_bytes = get_available_memory_bytes();
        let recommended_context_length =
            compute_recommended_context(model, available_memory_bytes, max_ctx);

        Ok(LlamaCppContextInfo {
            max_context_length: max_ctx,
            recommended_context_length,
            available_memory_bytes,
            model_size_bytes: Some(model.size()),
        })
    }

    pub async fn handle_local_request(
        app: AppHandle,
        req: ApiRequest,
    ) -> Result<ApiResponse, String> {
        let body = req
            .body
            .as_ref()
            .ok_or_else(|| "llama.cpp request missing body".to_string())?;
        let model_path = body
            .get("model")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "llama.cpp request missing model path".to_string())?;

        if !Path::new(model_path).exists() {
            return Err(format!("llama.cpp model path not found: {}", model_path));
        }

        let messages = body
            .get("messages")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "llama.cpp request missing messages".to_string())?;

        let temperature = body
            .get("temperature")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.7);
        let top_p = body.get("top_p").and_then(|v| v.as_f64()).unwrap_or(1.0);
        let max_tokens = body
            .get("max_tokens")
            .or_else(|| body.get("max_completion_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(512) as u32;
        let requested_context = body
            .get("context_length")
            .and_then(|v| v.as_u64())
            .and_then(|v| u32::try_from(v).ok())
            .filter(|v| *v > 0);

        let request_id = req.request_id.clone();
        let stream = req.stream.unwrap_or(false);

        log_info(
            &app,
            "llama_cpp",
            format!(
                "local inference start model_path={} stream={} request_id={:?}",
                model_path, stream, request_id
            ),
        );

        let mut abort_rx = request_id.as_ref().map(|id| {
            use tauri::Manager;
            let registry = app.state::<crate::abort_manager::AbortRegistry>();
            registry.register(id.clone())
        });

        let mut output = String::new();
        let mut prompt_tokens = 0u64;
        let mut completion_tokens = 0u64;

        let result = (|| -> Result<(), String> {
            let engine = load_engine(Some(&app), model_path)?;
            let model = engine
                .model
                .as_ref()
                .ok_or_else(|| "llama.cpp model unavailable".to_string())?;
            let backend = engine
                .backend
                .as_ref()
                .ok_or_else(|| "llama.cpp backend unavailable".to_string())?;
            let prompt = build_prompt(model, messages)?;
            let tokens = model
                .str_to_token(&prompt, AddBos::Always)
                .map_err(|e| format!("Failed to tokenize prompt: {e}"))?;
            prompt_tokens = tokens.len() as u64;

            let max_ctx = model.n_ctx_train().max(1);
            let available_memory_bytes = get_available_memory_bytes();
            let recommended_ctx =
                compute_recommended_context(model, available_memory_bytes, max_ctx);
            let ctx_size = if let Some(requested) = requested_context {
                requested.min(max_ctx)
            } else if let Some(recommended) = recommended_ctx {
                if recommended == 0 {
                    return Err(
                        "llama.cpp model likely won't fit in memory. Try a smaller model or set a shorter context.".to_string(),
                    );
                }
                recommended.min(max_ctx).max(1)
            } else {
                max_ctx
            };
            let ctx_params = LlamaContextParams::default().with_n_ctx(NonZeroU32::new(ctx_size));
            let mut ctx = model
                .new_context(backend, ctx_params)
                .map_err(|e| format!("Failed to create llama context: {e}"))?;

            let batch_size = tokens.len().max(512);
            let mut batch = LlamaBatch::new(batch_size, 1);

            let last_index = tokens.len().saturating_sub(1) as i32;
            for (i, token) in (0_i32..).zip(tokens.into_iter()) {
                let is_last = i == last_index;
                batch
                    .add(token, i, &[0], is_last)
                    .map_err(|e| format!("Failed to build llama batch: {e}"))?;
            }

            ctx.decode(&mut batch)
                .map_err(|e| format!("llama_decode failed: {e}"))?;

            let prompt_len = batch.n_tokens();
            let mut n_cur = prompt_len;
            let max_new = max_tokens.min(ctx_size.saturating_sub(n_cur as u32 + 1));

            let mut sampler = build_sampler(temperature, top_p, None);

            let target_len = prompt_len + max_new as i32;
            while n_cur < target_len {
                if let Some(rx) = abort_rx.as_mut() {
                    match rx.try_recv() {
                        Ok(()) => {
                            return Err("llama.cpp request aborted by user".to_string());
                        }
                        Err(TryRecvError::Closed) | Err(TryRecvError::Empty) => {}
                    }
                }

                let token = sampler.sample(&ctx, batch.n_tokens() - 1);
                sampler.accept(token);

                if token == model.token_eos() {
                    break;
                }

                let piece = model
                    .token_to_str(token, Special::Plaintext)
                    .map_err(|e| format!("Failed to decode token: {e}"))?;

                output.push_str(&piece);
                completion_tokens += 1;

                if stream {
                    if let Some(ref id) = request_id {
                        transport::emit_normalized(
                            &app,
                            id,
                            NormalizedEvent::Delta { text: piece },
                        );
                    }
                }

                batch.clear();
                batch
                    .add(token, n_cur, &[0], true)
                    .map_err(|e| format!("Failed to update llama batch: {e}"))?;
                n_cur += 1;

                ctx.decode(&mut batch)
                    .map_err(|e| format!("llama_decode failed: {e}"))?;
            }

            Ok(())
        })();

        if let Some(ref id) = request_id {
            use tauri::Manager;
            let registry = app.state::<crate::abort_manager::AbortRegistry>();
            registry.unregister(id);
        }

        if let Err(err) = result {
            log_error(&app, "llama_cpp", format!("local inference error: {}", err));
            if stream {
                if let Some(ref id) = request_id {
                    let envelope = ErrorEnvelope {
                        code: Some("LOCAL_INFERENCE_FAILED".into()),
                        message: err.clone(),
                        provider_id: Some(LOCAL_PROVIDER_ID.to_string()),
                        request_id: Some(id.clone()),
                        retryable: Some(false),
                        status: None,
                    };
                    transport::emit_normalized(&app, id, NormalizedEvent::Error { envelope });
                }
            }
            return Err(err);
        }

        if stream {
            if let Some(ref id) = request_id {
                let usage = UsageSummary {
                    prompt_tokens: Some(prompt_tokens),
                    completion_tokens: Some(completion_tokens),
                    total_tokens: Some(prompt_tokens + completion_tokens),
                    reasoning_tokens: None,
                    image_tokens: None,
                    finish_reason: Some("stop".into()),
                };
                transport::emit_normalized(&app, id, NormalizedEvent::Usage { usage });
                transport::emit_normalized(&app, id, NormalizedEvent::Done);
            }
        }

        let usage_value = json!({
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        });

        let data = json!({
            "id": "local-llama",
            "object": "chat.completion",
            "choices": [{
                "index": 0,
                "message": { "role": "assistant", "content": output },
                "finish_reason": "stop"
            }],
            "usage": usage_value,
        });

        Ok(ApiResponse {
            status: 200,
            ok: true,
            headers: HashMap::new(),
            data,
        })
    }
}

#[cfg(not(mobile))]
pub use desktop::handle_local_request;
#[cfg(mobile)]
pub async fn handle_local_request(
    _app: AppHandle,
    _req: ApiRequest,
) -> Result<ApiResponse, String> {
    Err("llama.cpp is only supported on desktop builds".to_string())
}

#[tauri::command]
pub async fn llamacpp_context_info(
    app: AppHandle,
    model_path: String,
) -> Result<serde_json::Value, String> {
    #[cfg(not(mobile))]
    {
        let info = desktop::llamacpp_context_info(app, model_path).await?;
        return serde_json::to_value(info)
            .map_err(|e| format!("Failed to serialize context info: {e}"));
    }
    #[cfg(mobile)]
    {
        let _ = app;
        let _ = model_path;
        Err("llama.cpp is only supported on desktop builds".to_string())
    }
}

pub fn is_llama_cpp(provider_id: Option<&str>) -> bool {
    provider_id == Some(LOCAL_PROVIDER_ID)
}
