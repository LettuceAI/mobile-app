use futures_util::StreamExt;
use reqwest;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

const MODEL_FILES: [&str; 3] = [
    "lettuce-emb-512d-kd-v1.onnx",
    "lettuce-emb-512d-kd-v1.onnx.data",
    "tokenizer.json",
];

const HUGGINGFACE_BASE: &str = "https://huggingface.co/Zeolit/lettuce-emb-512d-v1/resolve/main";

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
    // Global environment - lazy loaded
    static ref DOWNLOAD_STATE: Arc<Mutex<DownloadState>> = Arc::new(Mutex::new(DownloadState {
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

/// Get the embedding model directory path
fn embedding_model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let lettuce_dir = crate::utils::lettuce_dir(app)?;
    let model_dir = lettuce_dir.join("models").join("embedding");
    Ok(model_dir)
}

/// Check if the embedding model files exist
#[tauri::command]
pub fn check_embedding_model(app: AppHandle) -> Result<bool, String> {
    let model_dir = embedding_model_dir(&app)?;

    for filename in MODEL_FILES.iter() {
        let file_path = model_dir.join(filename);
        if !file_path.exists() {
            return Ok(false);
        }
    }

    Ok(true)
}

/// Reset the download state to idle (useful after deleting model files)
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

/// Delete partial/incomplete model files
fn cleanup_partial_files(model_dir: &PathBuf) -> Result<(), String> {
    for filename in MODEL_FILES.iter() {
        let file_path = model_dir.join(filename);
        if file_path.exists() {
            fs::remove_file(&file_path)
                .map_err(|e| format!("Failed to delete partial file {}: {}", filename, e))?;
        }
    }
    Ok(())
}

use tauri::Emitter;

/// Download a single file from HuggingFace
async fn download_file(
    app: &AppHandle,
    url: &str,
    dest_path: &PathBuf,
    state: Arc<Mutex<DownloadState>>,
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

    // Update total size in state
    {
        let mut state_lock = state.lock().await;
        state_lock.progress.total += total_size;
        let _ = app.emit("embedding_download_progress", &state_lock.progress);
    }

    // Create temporary file
    let temp_path = dest_path.with_extension("tmp");
    let mut file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut _downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_result) = stream.next().await {
        // Check for cancellation
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

        // Update progress
        {
            let mut state_lock = state.lock().await;
            state_lock.progress.downloaded += chunk.len() as u64;

            // Emit event (throttled to every 100ms)
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

    // Rename temp file to final name
    tokio::fs::rename(&temp_path, dest_path)
        .await
        .map_err(|e| format!("Failed to rename file: {}", e))?;

    Ok(())
}

/// Start downloading the embedding model
#[tauri::command]
pub async fn start_embedding_download(app: AppHandle) -> Result<(), String> {
    // Check if already downloading
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
            total_files: MODEL_FILES.len(),
            current_file_name: MODEL_FILES
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

    // Download each file
    for (file_index, filename) in MODEL_FILES.iter().enumerate() {
        let url = format!("{}/{}", HUGGINGFACE_BASE, filename);
        let dest_path = model_dir.join(filename);

        {
            let mut state_lock = state.lock().await;
            state_lock.progress.status = format!("Downloading {}", filename);
            state_lock.progress.current_file_index = file_index + 1;
            state_lock.progress.current_file_name = filename.to_string();
            let _ = app.emit("embedding_download_progress", &state_lock.progress);
        }

        match download_file(&app, &url, &dest_path, state.clone()).await {
            Ok(_) => {}
            Err(e) => {
                // Cleanup on error
                let _ = cleanup_partial_files(&model_dir);
                let mut state_lock = state.lock().await;
                state_lock.is_downloading = false;
                state_lock.progress.status = "failed".to_string();
                let _ = app.emit("embedding_download_progress", &state_lock.progress);
                return Err(e);
            }
        }
    }

    // Mark as completed
    {
        let mut state_lock = state.lock().await;
        state_lock.is_downloading = false;
        state_lock.progress.status = "completed".to_string();
        let _ = app.emit("embedding_download_progress", &state_lock.progress);
    }

    Ok(())
}

/// Get current download progress
#[tauri::command]
pub async fn get_embedding_download_progress() -> Result<DownloadProgress, String> {
    let state = DOWNLOAD_STATE.lock().await;
    Ok(state.progress.clone())
}

/// Cancel ongoing download
#[tauri::command]
pub async fn cancel_embedding_download(app: AppHandle) -> Result<(), String> {
    {
        let mut state = DOWNLOAD_STATE.lock().await;
        if !state.is_downloading {
            return Ok(());
        }
        state.cancel_requested = true;
    }

    // Wait a bit for cancellation to propagate
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Clean up partial files
    let model_dir = embedding_model_dir(&app)?;
    cleanup_partial_files(&model_dir)?;

    // Reset state
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

/// Delete all embedding model files and reset state
#[tauri::command]
pub async fn delete_embedding_model(app: AppHandle) -> Result<(), String> {
    // 1. Reset state first to stop any potential downloads/usage
    reset_download_state().await;

    // 2. Delete files
    let model_dir = embedding_model_dir(&app)?;
    cleanup_partial_files(&model_dir)?;

    Ok(())
}

// ============================================================================
// ONNX Inference Implementation
// ============================================================================

// IMPORTANT: Ensure your Cargo.toml has ndarray = "0.15" to match ort 1.16 dependencies.
use ndarray::Array2;
use ort::{
    inputs,
    session::{builder::GraphOptimizationLevel, Session},
    value::Value,
};
use tokenizers::Tokenizer;

const MAX_SEQ_LENGTH: usize = 512;
const EMBEDDING_DIM: usize = 512;
const MODEL_ID: &str = "Zeolit/lettuce-emb-512d-v1";

/// Initialize ONNX Runtime
async fn ensure_ort_init() -> Result<(), String> {
    if ort::init().with_name("lettuce-embedding").commit().is_err() {}
    Ok(())
}

#[tauri::command]
pub async fn compute_embedding(app: AppHandle, text: String) -> Result<Vec<f32>, String> {
    let model_dir = embedding_model_dir(&app)?;
    let model_path = model_dir.join("lettuce-emb-512d-kd-v1.onnx");

    if !model_path.exists() {
        return Err("Model files not found. Please download the model first.".to_string());
    }

    ensure_ort_init().await?;

    let mut session = Session::builder()
        .map_err(|e| format!("Failed to create session builder: {}", e))?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| format!("Failed to set optimization level: {}", e))?
        .commit_from_file(&model_path)
        .map_err(|e| format!("Failed to load model: {}", e))?;

    // Load tokenizer from local file
    let tokenizer_path = model_dir.join("tokenizer.json");
    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| format!("Failed to load tokenizer from {:?}: {}", tokenizer_path, e))?;

    // Tokenize input
    let encoding = tokenizer
        .encode(text, true)
        .map_err(|e| format!("Tokenization failed: {}", e))?;

    let input_ids = encoding.get_ids();
    let attention_mask = encoding.get_attention_mask();

    let seq_len = input_ids.len().min(MAX_SEQ_LENGTH);
    let input_ids = &input_ids[..seq_len];
    let attention_mask = &attention_mask[..seq_len];

    // Convert to i64 arrays (ONNX expects i64 for input_ids and attention_mask)
    let input_ids_i64: Vec<i64> = input_ids.iter().map(|&x| x as i64).collect();
    let attention_mask_i64: Vec<i64> = attention_mask.iter().map(|&x| x as i64).collect();

    // Create ndarray tensors with shape [1, seq_len]
    let input_ids_array = Array2::from_shape_vec((1, seq_len), input_ids_i64)
        .map_err(|e| format!("Failed to create input_ids array: {}", e))?;

    let attention_mask_array = Array2::from_shape_vec((1, seq_len), attention_mask_i64)
        .map_err(|e| format!("Failed to create attention_mask array: {}", e))?;

    let input_ids_value = Value::from_array(input_ids_array)
        .map_err(|e| format!("Failed to create input_ids tensor: {}", e))?;

    let attention_mask_value = Value::from_array(attention_mask_array)
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

    if embedding_vec.len() == EMBEDDING_DIM {
        Ok(embedding_vec)
    } else if embedding_vec.len() > EMBEDDING_DIM && embedding_vec.len() % EMBEDDING_DIM == 0 {
        Ok(embedding_vec[..EMBEDDING_DIM].to_vec())
    } else {
        Err(format!(
            "Unexpected embedding dimension: {} (expected {} or multiple thereof)",
            embedding_vec.len(),
            EMBEDDING_DIM
        ))
    }
}

#[tauri::command]
pub async fn initialize_embedding_model(app: AppHandle) -> Result<(), String> {
    let model_dir = embedding_model_dir(&app)?;
    let model_path = model_dir.join("lettuce-emb-512d-kd-v1.onnx");

    if !model_path.exists() {
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
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreComparison {
    pair_name: String,
    text_a: String,
    text_b: String,
    similarity_score: f32,
    expected: String,
}

#[tauri::command]
pub async fn run_embedding_test(app: AppHandle) -> Result<TestResult, String> {
    let anchor_text = "The quick brown fox jumps over the dog";
    let positive_text = "A fast fox leaps over a canine";
    let negative_text = "Planetary motion relies on gravity and mass";

    println!("Starting embedding test...");

    println!("Embedding anchor text...");
    let anchor_emb = compute_embedding(app.clone(), anchor_text.to_string())
        .await
        .map_err(|e| format!("Failed to embed anchor: {}", e))?;

    println!("Embedding positive text...");
    let positive_emb = compute_embedding(app.clone(), positive_text.to_string())
        .await
        .map_err(|e| format!("Failed to embed positive text: {}", e))?;

    println!("Embedding negative text...");
    let negative_emb = compute_embedding(app.clone(), negative_text.to_string())
        .await
        .map_err(|e| format!("Failed to embed negative text: {}", e))?;

    println!("Calculating similarities...");

    let pos_score = cosine_similarity(&anchor_emb, &positive_emb);
    let neg_score = cosine_similarity(&anchor_emb, &negative_emb);

    // 4. Analyze Results
    // We expect the positive score to be significantly higher than the negative score.
    // For standard embedding models:
    // - High similarity is usually > 0.7 or 0.8
    // - Low similarity is usually < 0.3 or 0.4

    let passed = pos_score > neg_score && pos_score > 0.6;

    let message = if passed {
        format!(
            "Test PASSED: Model correctly identified similarity. (Positive: {:.4} > Negative: {:.4})", 
            pos_score, neg_score
        )
    } else {
        format!(
            "Test FAILED: Scores were unexpected. (Positive: {:.4}, Negative: {:.4})",
            pos_score, neg_score
        )
    };

    Ok(TestResult {
        success: passed,
        message,
        scores: vec![
            ScoreComparison {
                pair_name: "Positive Match".to_string(),
                text_a: anchor_text.to_string(),
                text_b: positive_text.to_string(),
                similarity_score: pos_score,
                expected: "High (> 0.6)".to_string(),
            },
            ScoreComparison {
                pair_name: "Negative Match".to_string(),
                text_a: anchor_text.to_string(),
                text_b: negative_text.to_string(),
                similarity_score: neg_score,
                expected: "Low (< positive score)".to_string(),
            },
        ],
    })
}
