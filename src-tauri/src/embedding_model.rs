use futures_util::StreamExt;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex as TokioMutex;
use tokio::time::{timeout, Duration};

use crate::chat_manager::prompts;
use crate::utils::{log_error, log_info, log_warn};

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
const ORT_VERSION: &str = "1.22.0";

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
            fs::remove_file(&file_path).map_err(|e| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    format!("Failed to delete partial file {}: {}", filename, e),
                )
            })?;
        }
    }
    Ok(())
}

use tauri::Emitter;

fn describe_path(path: &std::path::Path) -> String {
    match fs::metadata(path) {
        Ok(meta) => format!(
            "exists=true file={} dir={} size_bytes={}",
            meta.is_file(),
            meta.is_dir(),
            meta.len()
        ),
        Err(err) => format!("exists=false error={}", err),
    }
}

fn log_model_file_status(app: &AppHandle, component: &str, model_dir: &PathBuf) {
    for filename in MODEL_FILES_V1.iter() {
        let path = model_dir.join(filename);
        log_info(
            app,
            component,
            format!("model file v1 {}: {}", filename, describe_path(&path)),
        );
    }

    for filename in MODEL_FILES_V2_LOCAL.iter() {
        let path = model_dir.join(filename);
        log_info(
            app,
            component,
            format!("model file v2 {}: {}", filename, describe_path(&path)),
        );
    }
}

async fn download_file(
    app: &AppHandle,
    url: &str,
    dest_path: &PathBuf,
    state: Arc<TokioMutex<DownloadState>>,
) -> Result<(), String> {
    log_info(
        app,
        "embedding_download",
        format!(
            "download start url={} dest={} temp={}",
            url,
            dest_path.display(),
            dest_path.with_extension("tmp").display()
        ),
    );
    let client = reqwest::Client::new();
    let response = client.get(url).send().await.map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to start download: {}", e),
        )
    })?;

    if !response.status().is_success() {
        log_error(
            app,
            "embedding_download",
            format!("download failed status={} url={}", response.status(), url),
        );
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    log_info(
        app,
        "embedding_download",
        format!("download response ok url={} total_size={}", url, total_size),
    );

    {
        let mut state_lock = state.lock().await;
        state_lock.progress.total += total_size;
        let _ = app.emit("embedding_download_progress", &state_lock.progress);
    }

    let temp_path = dest_path.with_extension("tmp");
    let mut file = tokio::fs::File::create(&temp_path).await.map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to create file: {}", e),
        )
    })?;

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
                return Err(crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    "Download cancelled",
                ));
            }
        }

        let chunk = chunk_result.map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Error reading chunk: {}", e),
            )
        })?;
        file.write_all(&chunk).await.map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Error writing to file: {}", e),
            )
        })?;

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

    file.flush().await.map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Error flushing file: {}", e),
        )
    })?;
    drop(file);

    tokio::fs::rename(&temp_path, dest_path)
        .await
        .map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to rename file: {}", e),
            )
        })?;

    let file_status = describe_path(dest_path);
    log_info(
        app,
        "embedding_download",
        format!(
            "download complete dest={} {}",
            dest_path.display(),
            file_status
        ),
    );

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

    log_info(
        &app,
        "embedding_download",
        format!(
            "download init version={:?} base_url={} remote_files={:?} local_files={:?}",
            target_version, base_url, remote_files, local_files
        ),
    );

    {
        let mut state = DOWNLOAD_STATE.lock().await;
        if state.is_downloading {
            return Err(crate::utils::err_msg(
                module_path!(),
                line!(),
                "Download already in progress",
            ));
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
    log_info(
        &app,
        "embedding_download",
        format!(
            "model_dir={} {}",
            model_dir.display(),
            describe_path(&model_dir)
        ),
    );
    fs::create_dir_all(&model_dir).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to create model directory: {}", e),
        )
    })?;
    log_info(
        &app,
        "embedding_download",
        format!("model_dir ready {}", model_dir.display()),
    );

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

        log_info(
            &app,
            "embedding_download",
            format!(
                "download file {} of {}: {}",
                file_index + 1,
                remote_files.len(),
                local_filename
            ),
        );
        match download_file(&app, &url, &dest_path, state.clone()).await {
            Ok(_) => {}
            Err(e) => {
                log_error(
                    &app,
                    "embedding_download",
                    format!("download failed file={} error={}", local_filename, e),
                );
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

    log_model_file_status(&app, "embedding_download", &model_dir);

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

    log_info(&app, "embedding_download", "cancel requested");

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
    log_info(
        &app,
        "embedding_download",
        format!("delete embedding model files in {}", model_dir.display()),
    );
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
const EMBEDDING_TEST_TIMEOUT_SECS: u64 = 90;

fn compute_embedding_with_session(
    session: &mut Session,
    tokenizer: &Tokenizer,
    text: &str,
    max_seq_length: usize,
) -> Result<Vec<f32>, String> {
    let encoding = tokenizer.encode(text, true).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Tokenization failed: {}", e),
        )
    })?;

    let input_ids = encoding.get_ids();
    let attention_mask = encoding.get_attention_mask();

    let seq_len = input_ids.len().min(max_seq_length);
    let input_ids = &input_ids[..seq_len];
    let attention_mask = &attention_mask[..seq_len];

    let input_ids_i64: Vec<i64> = input_ids.iter().map(|&x| x as i64).collect();
    let attention_mask_i64: Vec<i64> = attention_mask.iter().map(|&x| x as i64).collect();

    let input_ids_value = Value::from_array(([1, seq_len], input_ids_i64)).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to create input_ids tensor: {}", e),
        )
    })?;

    let attention_mask_value =
        Value::from_array(([1, seq_len], attention_mask_i64)).map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to create attention_mask tensor: {}", e),
            )
        })?;

    let outputs = session
        .run(inputs![
            "input_ids" => input_ids_value,
            "attention_mask" => attention_mask_value
        ])
        .map_err(|e| {
            crate::utils::err_msg(module_path!(), line!(), format!("Inference failed: {}", e))
        })?;

    let embedding_value = &outputs[0];
    let (_, embedding_slice) = embedding_value.try_extract_tensor::<f32>().map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to extract embedding: {}", e),
        )
    })?;

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

async fn ensure_ort_init(app: &AppHandle) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let dylib_path = resolve_or_download_onnxruntime(app).await?;
        std::env::set_var("ORT_DYLIB_PATH", &dylib_path);
        if let Err(err) = ort::util::preload_dylib(&dylib_path) {
            return Err(crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to preload ONNX Runtime library: {}", err),
            ));
        }
    }

    let init_result =
        std::panic::catch_unwind(|| ort::init().with_name("lettuce-embedding").commit()).map_err(
            |_| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    "ONNX Runtime initialization panicked (likely incompatible DLL).".to_string(),
                )
            },
        )?;

    let init_ok = init_result.into_init_result().map_err(|err| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to initialize ONNX Runtime: {}", err),
        )
    })?;

    if !init_ok {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            "Failed to initialize ONNX Runtime".to_string(),
        ));
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn resolve_or_download_onnxruntime(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(value) = std::env::var("ORT_DYLIB_PATH") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let path = Path::new(trimmed);
            if path.exists() {
                return Ok(path.to_path_buf());
            }
        }
    }

    let lettuce_dir = crate::utils::ensure_lettuce_dir(app)?;
    let ort_dir = lettuce_dir.join("onnxruntime");
    fs::create_dir_all(&ort_dir)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    let (archive_url, lib_path_in_archive, lib_name) = ort_download_info()?;
    let dest_path = ort_dir.join(lib_name);
    if dest_path.exists() {
        return Ok(dest_path);
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&archive_url)
        .send()
        .await
        .map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to download ONNX Runtime: {}", e),
            )
        })?;
    if !response.status().is_success() {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to download ONNX Runtime: {}", response.status()),
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    extract_onnxruntime_archive(&archive_url, &bytes, &lib_path_in_archive, &dest_path)?;

    if !dest_path.exists() {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            format!(
                "ONNX Runtime library not found after download: {}",
                dest_path.display()
            ),
        ));
    }

    Ok(dest_path)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn ort_download_info() -> Result<(String, String, &'static str), String> {
    let (os, arch) = (std::env::consts::OS, std::env::consts::ARCH);
    match (os, arch) {
        ("windows", "x86_64") => Ok((
            format!(
                "https://github.com/microsoft/onnxruntime/releases/download/v{0}/onnxruntime-win-x64-{0}.zip",
                ORT_VERSION
            ),
            format!("onnxruntime-win-x64-{}/lib/onnxruntime.dll", ORT_VERSION),
            "onnxruntime.dll",
        )),
        ("linux", "x86_64") => Ok((
            format!(
                "https://github.com/microsoft/onnxruntime/releases/download/v{0}/onnxruntime-linux-x64-{0}.tgz",
                ORT_VERSION
            ),
            format!(
                "onnxruntime-linux-x64-{}/lib/libonnxruntime.so.{}",
                ORT_VERSION, ORT_VERSION
            ),
            "libonnxruntime.so",
        )),
        ("macos", "aarch64") => Ok((
            format!(
                "https://github.com/microsoft/onnxruntime/releases/download/v{0}/onnxruntime-osx-arm64-{0}.tgz",
                ORT_VERSION
            ),
            format!(
                "onnxruntime-osx-arm64-{}/lib/libonnxruntime.dylib",
                ORT_VERSION
            ),
            "libonnxruntime.dylib",
        )),
        ("macos", "x86_64") => Ok((
            format!(
                "https://github.com/microsoft/onnxruntime/releases/download/v{0}/onnxruntime-osx-x86_64-{0}.tgz",
                ORT_VERSION
            ),
            format!(
                "onnxruntime-osx-x86_64-{}/lib/libonnxruntime.dylib",
                ORT_VERSION
            ),
            "libonnxruntime.dylib",
        )),
        _ => Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Unsupported platform for ONNX Runtime: {} {}", os, arch),
        )),
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn extract_onnxruntime_archive(
    archive_url: &str,
    bytes: &[u8],
    lib_path_in_archive: &str,
    dest_path: &Path,
) -> Result<(), String> {
    let reader = Cursor::new(bytes);
    if archive_url.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(reader)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        let mut file = zip
            .by_name(lib_path_in_archive)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        let mut outfile = fs::File::create(dest_path)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        std::io::copy(&mut file, &mut outfile)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        return Ok(());
    }

    if archive_url.ends_with(".tgz") {
        let tar = flate2::read::GzDecoder::new(reader);
        let mut archive = tar::Archive::new(tar);
        for entry in archive
            .entries()
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?
        {
            let mut entry = entry
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
            let path = entry
                .path()
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?
                .to_string_lossy()
                .into_owned();
            if path == lib_path_in_archive {
                let mut outfile = fs::File::create(dest_path)
                    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
                std::io::copy(&mut entry, &mut outfile)
                    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
                return Ok(());
            }
        }
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Could not find {} in archive", lib_path_in_archive),
        ));
    }

    Err(crate::utils::err_msg(
        module_path!(),
        line!(),
        format!("Unsupported archive type: {}", archive_url),
    ))
}

trait IntoInitResult {
    fn into_init_result(self) -> Result<bool, String>;
}

impl IntoInitResult for bool {
    fn into_init_result(self) -> Result<bool, String> {
        Ok(self)
    }
}

impl<E: std::fmt::Display> IntoInitResult for Result<bool, E> {
    fn into_init_result(self) -> Result<bool, String> {
        self.map_err(|err| err.to_string())
    }
}

#[tauri::command]
pub async fn compute_embedding(app: AppHandle, text: String) -> Result<Vec<f32>, String> {
    let text_len = text.len();
    crate::utils::log_info(
        &app,
        "embedding_debug",
        format!(
            "computing embedding for text_len_bytes={} text='{}'",
            text_len, text
        ),
    );

    let model_dir = embedding_model_dir(&app)?;
    log_info(
        &app,
        "embedding_debug",
        format!(
            "model_dir={} {}",
            model_dir.display(),
            describe_path(&model_dir)
        ),
    );

    let detected_version = detect_model_version(&app)?;
    log_info(
        &app,
        "embedding_debug",
        format!("detected_model_version={:?}", detected_version),
    );

    let (model_path, max_seq_length, version_label) = match detected_version {
        Some(EmbeddingModelVersion::V2) => {
            let settings_max_tokens =
                crate::storage_manager::settings::internal_read_settings(&app)
                    .ok()
                    .flatten()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                    .and_then(|json| {
                        json.pointer("/advancedSettings/embeddingMaxTokens")?
                            .as_u64()
                    })
                    .map(|t| t as usize);

            let resolved_max_tokens = settings_max_tokens.unwrap_or(MAX_SEQ_LENGTH_V2);
            let clamped = resolved_max_tokens.clamp(512, MAX_SEQ_LENGTH_V2);

            log_info(
                &app,
                "embedding_debug",
                format!(
                    "embedding max tokens settings={:?} resolved={} clamped={}",
                    settings_max_tokens, resolved_max_tokens, clamped
                ),
            );

            (model_dir.join("v2-model.onnx"), clamped, "v2")
        }
        Some(EmbeddingModelVersion::V1) => (
            model_dir.join("lettuce-emb-512d-kd-v1.onnx"),
            MAX_SEQ_LENGTH_V1,
            "v1",
        ),
        None => {
            log_error(
                &app,
                "embedding_debug",
                "model files not found; compute_embedding aborted",
            );
            return Err(crate::utils::err_msg(
                module_path!(),
                line!(),
                "Model files not found. Please download the model first.",
            ));
        }
    };

    let tokenizer_path = model_dir.join("tokenizer.json");
    log_info(
        &app,
        "embedding_debug",
        format!(
            "embedding model version={} model_path={} tokenizer_path={}",
            version_label,
            model_path.display(),
            tokenizer_path.display()
        ),
    );
    log_model_file_status(&app, "embedding_debug", &model_dir);
    log_info(
        &app,
        "embedding_debug",
        format!("model_path status {}", describe_path(&model_path)),
    );
    log_info(
        &app,
        "embedding_debug",
        format!("tokenizer_path status {}", describe_path(&tokenizer_path)),
    );

    ensure_ort_init(&app).await?;
    log_info(&app, "embedding_debug", "ort initialized");

    let mut session = Session::builder()
        .map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to create session builder: {}", e),
            )
        })?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to set optimization level: {}", e),
            )
        })?
        .commit_from_file(&model_path)
        .map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to load model: {}", e),
            )
        })?;
    log_info(
        &app,
        "embedding_debug",
        format!("onnx session ready model_path={}", model_path.display()),
    );

    let tokenizer = Tokenizer::from_file(&tokenizer_path).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to load tokenizer from {:?}: {}", tokenizer_path, e),
        )
    })?;
    log_info(&app, "embedding_debug", "tokenizer loaded");

    log_info(&app, "embedding_debug", "running embedding inference");
    let embedding_vec =
        compute_embedding_with_session(&mut session, &tokenizer, &text, max_seq_length)?;
    log_info(
        &app,
        "embedding_debug",
        format!("embedding extracted len={}", embedding_vec.len()),
    );
    Ok(embedding_vec)
}

#[tauri::command]
pub async fn initialize_embedding_model(app: AppHandle) -> Result<(), String> {
    let detected_version = detect_model_version(&app)?;
    log_info(
        &app,
        "embedding_init",
        format!("initialize embedding model version={:?}", detected_version),
    );
    if detected_version.is_none() {
        log_error(&app, "embedding_init", "model files not found");
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            "Model files not found. Please download the model first.",
        ));
    }

    let model_dir = embedding_model_dir(&app)?;
    let (model_path, version_label) = match detected_version {
        Some(EmbeddingModelVersion::V2) => (model_dir.join("v2-model.onnx"), "v2"),
        Some(EmbeddingModelVersion::V1) => (model_dir.join("lettuce-emb-512d-kd-v1.onnx"), "v1"),
        None => unreachable!(),
    };
    let tokenizer_path = model_dir.join("tokenizer.json");

    if !model_path.exists() {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Model file missing: {}", model_path.display()),
        ));
    }
    if !tokenizer_path.exists() {
        return Err(format!(
            "Tokenizer file missing: {}",
            tokenizer_path.display()
        ));
    }

    let model_size = fs::metadata(&model_path).map(|m| m.len()).unwrap_or(0);
    let tokenizer_size = fs::metadata(&tokenizer_path).map(|m| m.len()).unwrap_or(0);
    if model_size == 0 || tokenizer_size == 0 {
        return Err(format!(
            "Model files look invalid (sizes: model={} bytes, tokenizer={} bytes)",
            model_size, tokenizer_size
        ));
    }

    ensure_ort_init(&app).await?;
    log_info(&app, "embedding_init", "ort initialized");

    let _session = Session::builder()
        .map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to create session builder: {}", e),
            )
        })?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to set optimization level: {}", e),
            )
        })?
        .commit_from_file(&model_path)
        .map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to load {} model: {}", version_label, e),
            )
        })?;
    let _tokenizer = Tokenizer::from_file(&tokenizer_path).map_err(|e| {
        format!(
            "Failed to load tokenizer from {}: {}",
            tokenizer_path.display(),
            e
        )
    })?;

    log_info(
        &app,
        "embedding_init",
        format!(
            "model validation ok version={} model_path={} tokenizer_path={}",
            version_label,
            model_path.display(),
            tokenizer_path.display()
        ),
    );

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
    log_info(&app, "embedding_test", "starting embedding test");
    log_info(&app, "embedding_test", "Starting embedding test...");

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

    let total_tests = test_cases.len();
    let _ = app.emit(
        "embedding_test_progress",
        serde_json::json!({
            "current": 0,
            "total": total_tests,
            "stage": "starting"
        }),
    );

    let app_for_test = app.clone();
    ensure_ort_init(&app_for_test).await?;

    let test_future = tokio::task::spawn_blocking(move || {
        let mut scores: Vec<ScoreComparison> = Vec::new();
        let mut all_passed = true;
        let mut embedding_dim = 0;

        let detected_version = detect_model_version(&app_for_test)?;
        log_info(
            &app_for_test,
            "embedding_test",
            format!("detected model version {:?}", detected_version),
        );

        let model_dir = embedding_model_dir(&app_for_test)?;
        let (model_path, max_seq_length, version_label) = match detected_version {
            Some(EmbeddingModelVersion::V2) => {
                let settings_max_tokens =
                    crate::storage_manager::settings::internal_read_settings(&app_for_test)
                        .ok()
                        .flatten()
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                        .and_then(|json| {
                            json.pointer("/advancedSettings/embeddingMaxTokens")?
                                .as_u64()
                        })
                        .map(|t| t as usize);

                let resolved_max_tokens = settings_max_tokens.unwrap_or(MAX_SEQ_LENGTH_V2);
                let clamped = resolved_max_tokens.clamp(512, MAX_SEQ_LENGTH_V2);

                (model_dir.join("v2-model.onnx"), clamped, "v2")
            }
            Some(EmbeddingModelVersion::V1) => (
                model_dir.join("lettuce-emb-512d-kd-v1.onnx"),
                MAX_SEQ_LENGTH_V1,
                "v1",
            ),
            None => {
                return Err(crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    "Model files not found. Please download the model first.",
                ));
            }
        };

        let tokenizer_path = model_dir.join("tokenizer.json");

        log_info(&app_for_test, "embedding_test", "ort initialized");

        let mut session = Session::builder()
            .map_err(|e| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    format!("Failed to create session builder: {}", e),
                )
            })?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    format!("Failed to set optimization level: {}", e),
                )
            })?
            .commit_from_file(&model_path)
            .map_err(|e| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    format!("Failed to load {} model: {}", version_label, e),
                )
            })?;

        let tokenizer = Tokenizer::from_file(&tokenizer_path).map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to load tokenizer: {}", e),
            )
        })?;

        for (idx, (name, text_a, text_b, category, threshold, expected_desc)) in
            test_cases.iter().enumerate()
        {
            log_info(&app_for_test, "embedding_test", format!("testing {}", name));
            log_info(
                &app_for_test,
                "embedding_test",
                format!("Testing: {}", name),
            );

            let emb_a =
                compute_embedding_with_session(&mut session, &tokenizer, text_a, max_seq_length)
                    .map_err(|e| {
                        log_error(
                            &app_for_test,
                            "embedding_test",
                            format!("failed to embed {} text_a error={}", name, e),
                        );
                        format!("Failed to embed '{}': {}", name, e)
                    })?;

            if embedding_dim == 0 {
                embedding_dim = emb_a.len();
                log_info(
                    &app_for_test,
                    "embedding_test",
                    format!("embedding dimension set to {}", embedding_dim),
                );
            }

            let emb_b =
                compute_embedding_with_session(&mut session, &tokenizer, text_b, max_seq_length)
                    .map_err(|e| {
                        log_error(
                            &app_for_test,
                            "embedding_test",
                            format!("failed to embed {} text_b error={}", name, e),
                        );
                        format!("Failed to embed '{}': {}", name, e)
                    })?;

            let similarity = cosine_similarity(&emb_a, &emb_b);

            let passed = if *category == "dissimilar" {
                similarity < *threshold
            } else {
                similarity >= *threshold
            };

            if !passed {
                all_passed = false;
            }

            log_info(
                &app_for_test,
                "embedding_test",
                format!(
                    "result name={} category={} similarity={} threshold={} passed={}",
                    name, category, similarity, threshold, passed
                ),
            );

            scores.push(ScoreComparison {
                pair_name: (*name).to_string(),
                text_a: (*text_a).to_string(),
                text_b: (*text_b).to_string(),
                similarity_score: similarity,
                expected: (*expected_desc).to_string(),
                passed,
                category: (*category).to_string(),
            });

            let _ = app_for_test.emit(
                "embedding_test_progress",
                serde_json::json!({
                    "current": idx + 1,
                    "total": total_tests,
                    "stage": "running"
                }),
            );
        }

        let model_info = get_embedding_model_info(app_for_test.clone())?;

        let passed_count = scores.iter().filter(|s| s.passed).count();
        let total_count = scores.len();
        log_info(
            &app_for_test,
            "embedding_test",
            format!(
                "embedding test complete passed={} total={} all_passed={}",
                passed_count, total_count, all_passed
            ),
        );

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
    });

    let result = timeout(
        Duration::from_secs(EMBEDDING_TEST_TIMEOUT_SECS),
        test_future,
    )
    .await
    .map_err(|_| "Embedding test timed out. Please try again.".to_string())?
    .map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Embedding test failed to start: {}", e),
        )
    })?;

    let _ = app.emit(
        "embedding_test_progress",
        serde_json::json!({
            "current": total_tests,
            "total": total_tests,
            "stage": "completed"
        }),
    );

    result
}

#[tauri::command]
pub async fn compare_custom_texts(
    app: AppHandle,
    text_a: String,
    text_b: String,
) -> Result<f32, String> {
    if text_a.trim().is_empty() || text_b.trim().is_empty() {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            "Both texts must be non-empty",
        ));
    }

    log_info(
        &app,
        "embedding_test",
        format!(
            "compare custom texts len_a={} len_b={}",
            text_a.len(),
            text_b.len()
        ),
    );

    let emb_a = compute_embedding(app.clone(), text_a).await.map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to embed first text: {}", e),
        )
    })?;

    let emb_b = compute_embedding(app.clone(), text_b).await.map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to embed second text: {}", e),
        )
    })?;

    Ok(cosine_similarity(&emb_a, &emb_b))
}
