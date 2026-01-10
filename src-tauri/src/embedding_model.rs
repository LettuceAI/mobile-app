use futures_util::StreamExt;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex as TokioMutex;

use crate::chat_manager::prompts;
use crate::utils::log_warn;

// V1 model files (legacy - 512 token max)
const MODEL_FILES_V1: [&str; 3] = [
    "lettuce-emb-512d-kd-v1.onnx",
    "lettuce-emb-512d-kd-v1.onnx.data",
    "tokenizer.json",
];

const MODEL_FILES_V2_REMOTE: [&str; 3] = ["model.onnx", "model.onnx.data", "tokenizer.json"];

const MODEL_FILES_V2_LOCAL: [&str; 3] = ["v2-model.onnx", "v2-model.onnx.data", "tokenizer.json"];

const HUGGINGFACE_BASE_V1: &str = "https://huggingface.co/Zeolit/lettuce-emb-512d-v1/resolve/main";
const HUGGINGFACE_BASE_V2: &str = "https://huggingface.co/Zeolit/lettuce-emb-512d-v2/resolve/main";

const MAX_SEQ_LENGTH_V1: usize = 512;
const MAX_SEQ_LENGTH_V2: usize = 4096;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq, Default)]
pub enum EmbeddingModelVersion {
    V1,
    #[default]
    V2,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingModelInfo {
    pub installed: bool,
    pub version: Option<String>,
    pub max_tokens: u32,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub status: String,
    pub current_file_index: usize,
    pub total_files: usize,
    pub current_file_name: String,
}

struct DownloadState {
    progress: DownloadProgress,
    cancel_requested: bool,
    is_downloading: bool,
}

lazy_static::lazy_static! {
    static ref DOWNLOAD_STATE: Arc<TokioMutex<DownloadState>> = Arc::new(TokioMutex::new(DownloadState {
        progress: DownloadProgress {
            downloaded: 0,
            total: 0,
            status: "idle".to_string(),
            current_file_index: 0,
            total_files: 0,
            current_file_name: String::new(),
        },
        cancel_requested: false,
        is_downloading: false,
    }));
}

pub fn embedding_model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let lettuce_dir = crate::utils::lettuce_dir(app)?;
    let model_dir = lettuce_dir.join("models").join("embedding");
    Ok(model_dir)
}

#[tauri::command]
pub fn check_embedding_model(app: AppHandle) -> Result<bool, String> {
    let model_dir = embedding_model_dir(&app)?;

    let v2_exists = MODEL_FILES_V2_LOCAL.iter().all(|filename| {
        let file_path = model_dir.join(filename);
        file_path.exists()
    });

    if v2_exists {
        return Ok(true);
    }

    let v1_exists = MODEL_FILES_V1.iter().all(|filename| {
        let file_path = model_dir.join(filename);
        file_path.exists()
    });

    Ok(v1_exists)
}

pub fn detect_model_version(app: &AppHandle) -> Result<Option<EmbeddingModelVersion>, String> {
    let model_dir = embedding_model_dir(app)?;

    let v2_exists = MODEL_FILES_V2_LOCAL.iter().all(|filename| {
        let file_path = model_dir.join(filename);
        file_path.exists()
    });

    if v2_exists {
        return Ok(Some(EmbeddingModelVersion::V2));
    }

    let v1_exists = MODEL_FILES_V1.iter().all(|filename| {
        let file_path = model_dir.join(filename);
        file_path.exists()
    });

    if v1_exists {
        return Ok(Some(EmbeddingModelVersion::V1));
    }

    Ok(None)
}

#[tauri::command]
pub fn get_embedding_model_info(app: AppHandle) -> Result<EmbeddingModelInfo, String> {
    match detect_model_version(&app)? {
        Some(EmbeddingModelVersion::V2) => Ok(EmbeddingModelInfo {
            installed: true,
            version: Some("v2".to_string()),
            max_tokens: MAX_SEQ_LENGTH_V2 as u32,
        }),
        Some(EmbeddingModelVersion::V1) => Ok(EmbeddingModelInfo {
            installed: true,
            version: Some("v1".to_string()),
            max_tokens: MAX_SEQ_LENGTH_V1 as u32,
        }),
        None => Ok(EmbeddingModelInfo {
            installed: false,
            version: None,
            max_tokens: 0,
        }),
    }
}

pub async fn reset_download_state() {
    let mut state = DOWNLOAD_STATE.lock().await;
    state.is_downloading = false;
    state.cancel_requested = false;
    state.progress = DownloadProgress {
        downloaded: 0,
        total: 0,
        status: "idle".to_string(),
        current_file_index: 0,
        total_files: 0,
        current_file_name: String::new(),
    };
}

fn cleanup_partial_files(
    model_dir: &std::path::Path,
    version: Option<&EmbeddingModelVersion>,
) -> Result<(), String> {
    let files = match version {
        Some(EmbeddingModelVersion::V1) => MODEL_FILES_V1.to_vec(),
        Some(EmbeddingModelVersion::V2) => MODEL_FILES_V2_LOCAL.to_vec(),
        None => {
            let mut all_files = MODEL_FILES_V1.to_vec();
            all_files.extend(
                MODEL_FILES_V2_LOCAL
                    .iter()
                    .filter(|f| **f != "tokenizer.json"),
            );
            all_files
        }
    };

    for filename in files.iter() {
        let file_path = model_dir.join(filename);
        if file_path.exists() {
            fs::remove_file(&file_path)
                .map_err(|e| format!("Failed to delete partial file {}: {}", filename, e))?;
        }
    }
    Ok(())
}

use tauri::Emitter;

async fn download_file(
    app: &AppHandle,
    url: &str,
    dest_path: &PathBuf,
    state: Arc<TokioMutex<DownloadState>>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);

    {
        let mut state_lock = state.lock().await;
        state_lock.progress.total += total_size;
        let _ = app.emit("embedding_download_progress", &state_lock.progress);
    }

    let temp_path = dest_path.with_extension("tmp");
    let mut file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut _downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_result) = stream.next().await {
        {
            let state_lock = state.lock().await;
            if state_lock.cancel_requested {
                drop(file);
                let _ = tokio::fs::remove_file(&temp_path).await;
                let _ = app.emit("embedding_download_progress", &state_lock.progress);
                return Err("Download cancelled".to_string());
            }
        }

        let chunk = chunk_result.map_err(|e| format!("Error reading chunk: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Error writing to file: {}", e))?;

        _downloaded += chunk.len() as u64;

        {
            let mut state_lock = state.lock().await;
            state_lock.progress.downloaded += chunk.len() as u64;

            if last_emit.elapsed().as_millis() > 100 {
                let _ = app.emit("embedding_download_progress", &state_lock.progress);
                last_emit = std::time::Instant::now();
            }
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Error flushing file: {}", e))?;
    drop(file);

    tokio::fs::rename(&temp_path, dest_path)
        .await
        .map_err(|e| format!("Failed to rename file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn start_embedding_download(
    app: AppHandle,
    version: Option<String>,
) -> Result<(), String> {
    let target_version = match version.as_deref() {
        Some("v1") => EmbeddingModelVersion::V1,
        _ => EmbeddingModelVersion::V2,
    };

    let (remote_files, local_files, base_url) = match target_version {
        EmbeddingModelVersion::V1 => (
            MODEL_FILES_V1.to_vec(),
            MODEL_FILES_V1.to_vec(),
            HUGGINGFACE_BASE_V1,
        ),
        EmbeddingModelVersion::V2 => (
            MODEL_FILES_V2_REMOTE.to_vec(),
            MODEL_FILES_V2_LOCAL.to_vec(),
            HUGGINGFACE_BASE_V2,
        ),
    };

    {
        let mut state = DOWNLOAD_STATE.lock().await;
        if state.is_downloading {
            return Err("Download already in progress".to_string());
        }
        state.is_downloading = true;
        state.cancel_requested = false;
        state.progress = DownloadProgress {
            downloaded: 0,
            total: 0,
            status: "downloading".to_string(),
            current_file_index: 1,
            total_files: remote_files.len(),
            current_file_name: local_files
                .first()
                .map(|s| s.to_string())
                .unwrap_or_default(),
        };
        let _ = app.emit("embedding_download_progress", &state.progress);
    }

    let model_dir = embedding_model_dir(&app)?;
    fs::create_dir_all(&model_dir)
        .map_err(|e| format!("Failed to create model directory: {}", e))?;

    let state = DOWNLOAD_STATE.clone();

    for (file_index, (remote_filename, local_filename)) in
        remote_files.iter().zip(local_files.iter()).enumerate()
    {
        let url = format!("{}/{}", base_url, remote_filename);
        let dest_path = model_dir.join(local_filename);

        {
            let mut state_lock = state.lock().await;
            state_lock.progress.status = format!("Downloading {}", local_filename);
            state_lock.progress.current_file_index = file_index + 1;
            state_lock.progress.current_file_name = local_filename.to_string();
            let _ = app.emit("embedding_download_progress", &state_lock.progress);
        }

        match download_file(&app, &url, &dest_path, state.clone()).await {
            Ok(_) => {}
            Err(e) => {
                let _ = cleanup_partial_files(&model_dir, Some(&target_version));
                let mut state_lock = state.lock().await;
                state_lock.is_downloading = false;
                state_lock.progress.status = "failed".to_string();
                let _ = app.emit("embedding_download_progress", &state_lock.progress);
                return Err(e);
            }
        }
    }

    {
        let mut state_lock = state.lock().await;
        state_lock.is_downloading = false;
        state_lock.progress.status = "completed".to_string();
        let _ = app.emit("embedding_download_progress", &state_lock.progress);
    }

    if let Err(err) = prompts::ensure_dynamic_memory_templates(&app) {
        log_warn(
            &app,
            "embedding_download",
            format!("Failed to ensure dynamic memory prompts: {}", err),
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn get_embedding_download_progress() -> Result<DownloadProgress, String> {
    let state = DOWNLOAD_STATE.lock().await;
    Ok(state.progress.clone())
}

#[tauri::command]
pub async fn cancel_embedding_download(app: AppHandle) -> Result<(), String> {
    {
        let mut state = DOWNLOAD_STATE.lock().await;
        if !state.is_downloading {
            return Ok(());
        }
        state.cancel_requested = true;
    }

    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let model_dir = embedding_model_dir(&app)?;
    cleanup_partial_files(&model_dir, None)?;

    {
        let mut state = DOWNLOAD_STATE.lock().await;
        state.is_downloading = false;
        state.cancel_requested = false;
        state.progress = DownloadProgress {
            downloaded: 0,
            total: 0,
            status: "cancelled".to_string(),
            current_file_index: 0,
            total_files: 0,
            current_file_name: String::new(),
        };
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_embedding_model(app: AppHandle) -> Result<(), String> {
    reset_download_state().await;

    let model_dir = embedding_model_dir(&app)?;
    cleanup_partial_files(&model_dir, None)?;

    Ok(())
}

use ort::{
    inputs,
    session::{builder::GraphOptimizationLevel, Session},
    value::Value,
};
use tokenizers::Tokenizer;

const EMBEDDING_DIM: usize = 512;

async fn ensure_ort_init() -> Result<(), String> {
    let _ = ort::init().with_name("lettuce-embedding").commit();
    Ok(())
}

#[tauri::command]
pub async fn compute_embedding(app: AppHandle, text: String) -> Result<Vec<f32>, String> {
    crate::utils::log_info(
        &app,
        "embedding_debug",
        format!("computing embedding for text='{}'", text),
    );

    let model_dir = embedding_model_dir(&app)?;

    let (model_path, max_seq_length) = match detect_model_version(&app)? {
        Some(EmbeddingModelVersion::V2) => {
            let user_max_tokens = crate::storage_manager::settings::internal_read_settings(&app)
                .ok()
                .flatten()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|json| {
                    json.pointer("/advancedSettings/embeddingMaxTokens")?
                        .as_u64()
                })
                .map(|t| t as usize)
                .unwrap_or(MAX_SEQ_LENGTH_V2);

            // Clamp to valid range [512, 4096]
            let clamped = user_max_tokens.clamp(512, MAX_SEQ_LENGTH_V2);

            (model_dir.join("v2-model.onnx"), clamped)
        }
        Some(EmbeddingModelVersion::V1) => (
            model_dir.join("lettuce-emb-512d-kd-v1.onnx"),
            MAX_SEQ_LENGTH_V1,
        ),
        None => {
            return Err("Model files not found. Please download the model first.".to_string());
        }
    };

    let tokenizer_path = model_dir.join("tokenizer.json");

    ensure_ort_init().await?;

    let mut session = Session::builder()
        .map_err(|e| format!("Failed to create session builder: {}", e))?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| format!("Failed to set optimization level: {}", e))?
        .commit_from_file(&model_path)
        .map_err(|e| format!("Failed to load model: {}", e))?;

    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| format!("Failed to load tokenizer from {:?}: {}", tokenizer_path, e))?;

    // Tokenize input
    let encoding = tokenizer
        .encode(text.clone(), true)
        .map_err(|e| format!("Tokenization failed: {}", e))?;

    let input_ids = encoding.get_ids();
    let attention_mask = encoding.get_attention_mask();

    let seq_len = input_ids.len().min(max_seq_length);
    let input_ids = &input_ids[..seq_len];
    let attention_mask = &attention_mask[..seq_len];

    // Convert to i64 arrays
    let input_ids_i64: Vec<i64> = input_ids.iter().map(|&x| x as i64).collect();
    let attention_mask_i64: Vec<i64> = attention_mask.iter().map(|&x| x as i64).collect();

    // Create tensors using (shape, data) tuple format for ort
    let input_ids_value = Value::from_array(([1, seq_len], input_ids_i64))
        .map_err(|e| format!("Failed to create input_ids tensor: {}", e))?;

    let attention_mask_value = Value::from_array(([1, seq_len], attention_mask_i64))
        .map_err(|e| format!("Failed to create attention_mask tensor: {}", e))?;

    let outputs = session
        .run(inputs![
            "input_ids" => input_ids_value,
            "attention_mask" => attention_mask_value
        ])
        .map_err(|e| format!("Inference failed: {}", e))?;

    let embedding_value = &outputs[0];
    let (_, embedding_slice) = embedding_value
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Failed to extract embedding: {}", e))?;

    let embedding_vec: Vec<f32> = embedding_slice.to_vec();

    match embedding_vec.len() {
        len if len == EMBEDDING_DIM => Ok(embedding_vec),
        len if len > EMBEDDING_DIM && len % EMBEDDING_DIM == 0 => {
            Ok(embedding_vec[..EMBEDDING_DIM].to_vec())
        }
        len => Err(format!(
            "Unexpected embedding dimension: {} (expected {} or multiple thereof)",
            len, EMBEDDING_DIM
        )),
    }
}

#[tauri::command]
pub async fn initialize_embedding_model(app: AppHandle) -> Result<(), String> {
    if detect_model_version(&app)?.is_none() {
        return Err("Model files not found. Please download the model first.".to_string());
    }

    ensure_ort_init().await?;

    Ok(())
}

fn cosine_similarity(v1: &[f32], v2: &[f32]) -> f32 {
    if v1.len() != v2.len() {
        return 0.0;
    }

    let mut dot_product = 0.0;
    let mut norm_v1 = 0.0;
    let mut norm_v2 = 0.0;

    for i in 0..v1.len() {
        dot_product += v1[i] * v2[i];
        norm_v1 += v1[i] * v1[i];
        norm_v2 += v2[i] * v2[i];
    }

    if norm_v1 == 0.0 || norm_v2 == 0.0 {
        return 0.0;
    }

    dot_product / (norm_v1.sqrt() * norm_v2.sqrt())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    success: bool,
    message: String,
    scores: Vec<ScoreComparison>,
    model_info: ModelTestInfo,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTestInfo {
    version: String,
    max_tokens: u32,
    embedding_dimensions: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreComparison {
    pair_name: String,
    text_a: String,
    text_b: String,
    similarity_score: f32,
    expected: String,
    passed: bool,
    category: String,
}

#[tauri::command]
pub async fn run_embedding_test(app: AppHandle) -> Result<TestResult, String> {
    println!("Starting comprehensive embedding test...");

    // Test cases organized by category
    let test_cases: Vec<(&str, &str, &str, &str, f32, &str)> = vec![
        // Semantic similarity tests
        (
            "Semantic: Animal Description",
            "The quick brown fox jumps over the lazy dog",
            "A fast fox leaps over a sleepy canine",
            "semantic",
            0.6,
            "High similarity expected - same meaning, different words",
        ),
        (
            "Semantic: Weather",
            "It's raining heavily outside today",
            "There's a big storm with lots of precipitation",
            "semantic",
            0.5,
            "High similarity expected - related weather concepts",
        ),
        (
            "Semantic: Greeting",
            "Hello, how are you doing today?",
            "Hi there, how's it going?",
            "semantic",
            0.6,
            "High similarity expected - same intent",
        ),
        // Dissimilar tests (should have low scores)
        (
            "Dissimilar: Fox vs Physics",
            "The quick brown fox jumps over the lazy dog",
            "Quantum mechanics describes subatomic particle behavior",
            "dissimilar",
            0.5,
            "Low similarity expected - unrelated topics",
        ),
        (
            "Dissimilar: Food vs Technology",
            "I love eating pizza with extra cheese",
            "The computer crashed and lost all my files",
            "dissimilar",
            0.5,
            "Low similarity expected - unrelated topics",
        ),
        // Roleplay-relevant tests
        (
            "Roleplay: Emotional State",
            "She felt a wave of sadness wash over her",
            "Her heart ached with sorrow and grief",
            "roleplay",
            0.55,
            "High similarity expected - same emotional content",
        ),
        (
            "Roleplay: Action Description",
            "He drew his sword and charged at the enemy",
            "The warrior unsheathed his blade and rushed forward to attack",
            "roleplay",
            0.55,
            "High similarity expected - same action described differently",
        ),
        (
            "Roleplay: Setting",
            "The tavern was dimly lit with flickering candles",
            "Candlelight cast shadows across the dark inn",
            "roleplay",
            0.5,
            "High similarity expected - similar scene description",
        ),
    ];

    let mut scores: Vec<ScoreComparison> = Vec::new();
    let mut all_passed = true;
    let mut embedding_dim = 0;

    for (name, text_a, text_b, category, threshold, expected_desc) in test_cases {
        println!("Testing: {}", name);

        let emb_a = compute_embedding(app.clone(), text_a.to_string())
            .await
            .map_err(|e| format!("Failed to embed '{}': {}", name, e))?;

        if embedding_dim == 0 {
            embedding_dim = emb_a.len();
        }

        let emb_b = compute_embedding(app.clone(), text_b.to_string())
            .await
            .map_err(|e| format!("Failed to embed '{}': {}", name, e))?;

        let similarity = cosine_similarity(&emb_a, &emb_b);

        let passed = if category == "dissimilar" {
            similarity < threshold
        } else {
            similarity >= threshold
        };

        if !passed {
            all_passed = false;
        }

        scores.push(ScoreComparison {
            pair_name: name.to_string(),
            text_a: text_a.to_string(),
            text_b: text_b.to_string(),
            similarity_score: similarity,
            expected: expected_desc.to_string(),
            passed,
            category: category.to_string(),
        });
    }

    // Get model info
    let model_info = get_embedding_model_info(app.clone())?;

    let passed_count = scores.iter().filter(|s| s.passed).count();
    let total_count = scores.len();

    let message = if all_passed {
        format!(
            "All {} tests passed! The embedding model is working correctly.",
            total_count
        )
    } else {
        format!(
            "{}/{} tests passed. Some results were unexpected - the model may need reinstallation.",
            passed_count, total_count
        )
    };

    Ok(TestResult {
        success: all_passed,
        message,
        scores,
        model_info: ModelTestInfo {
            version: model_info.version.unwrap_or_else(|| "unknown".to_string()),
            max_tokens: model_info.max_tokens,
            embedding_dimensions: embedding_dim,
        },
    })
}

#[tauri::command]
pub async fn compare_custom_texts(
    app: AppHandle,
    text_a: String,
    text_b: String,
) -> Result<f32, String> {
    if text_a.trim().is_empty() || text_b.trim().is_empty() {
        return Err("Both texts must be non-empty".to_string());
    }

    let emb_a = compute_embedding(app.clone(), text_a)
        .await
        .map_err(|e| format!("Failed to embed first text: {}", e))?;

    let emb_b = compute_embedding(app.clone(), text_b)
        .await
        .map_err(|e| format!("Failed to embed second text: {}", e))?;

    Ok(cosine_similarity(&emb_a, &emb_b))
}
