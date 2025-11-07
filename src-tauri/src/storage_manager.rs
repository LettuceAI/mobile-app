use base64::{engine::general_purpose, Engine as _};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
#[cfg(not(target_os = "android"))]
use machine_uid::get as get_machine_uid;
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::utils::{ensure_lettuce_dir, log_debug, log_info, log_warn, now_millis};

const SETTINGS_FILE: &str = "settings.bin";
const CHARACTERS_FILE: &str = "characters.bin";
const PERSONAS_FILE: &str = "personas.bin";
const SESSIONS_INDEX_FILE: &str = "sessions/index.bin";
const SESSIONS_DIR: &str = "sessions";

fn storage_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    ensure_lettuce_dir(app)
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join(SETTINGS_FILE))
}

fn characters_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join(CHARACTERS_FILE))
}

fn personas_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join(PERSONAS_FILE))
}

fn sessions_index_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join(SESSIONS_INDEX_FILE))
}

fn session_file_path(app: &tauri::AppHandle, session_id: &str) -> Result<PathBuf, String> {
    Ok(storage_root(app)?
        .join(SESSIONS_DIR)
        .join(format!("{session_id}.bin")))
}

fn derive_key() -> Result<[u8; 32], String> {
    let machine_id = {
        #[cfg(not(target_os = "android"))]
        {
            get_machine_uid().unwrap_or_else(|_| {
                format!(
                    "{}|{}|{}",
                    whoami::username(),
                    whoami::fallible::hostname().unwrap_or_else(|_| "unknown-host".into()),
                    std::env::consts::OS
                )
            })
        }
        #[cfg(target_os = "android")]
        {
            format!(
                "{}|{}|{}",
                whoami::username(),
                whoami::fallible::hostname().unwrap_or_else(|_| "unknown-host".into()),
                std::env::consts::OS
            )
        }
    };
    let mut hasher = blake3::Hasher::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(b"lettuceai.storage.v1");
    let hash = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(hash.as_bytes());
    Ok(key)
}

fn encrypt(content: &[u8]) -> Result<Vec<u8>, String> {
    let key = derive_key()?;
    let cipher = XChaCha20Poly1305::new(&key.into());
    let mut nonce_bytes = [0u8; 24];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from(nonce_bytes);
    let mut out = Vec::with_capacity(24 + content.len() + 16);
    let ciphertext = cipher
        .encrypt(&nonce, content)
        .map_err(|e| format!("encrypt: {e}"))?;
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 24 {
        return Err("corrupted data".into());
    }
    let (nonce_bytes, ciphertext) = data.split_at(24);
    let key = derive_key()?;
    let cipher = XChaCha20Poly1305::new(&key.into());
    let nonce = XNonce::from(*<&[u8; 24]>::try_from(nonce_bytes).map_err(|_| "invalid nonce")?);
    cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|e| format!("decrypt: {e}"))
}

fn read_encrypted_file(path: &PathBuf) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Ok(None);
    }
    let decrypted = decrypt(&bytes)?;
    let text = String::from_utf8(decrypted).map_err(|e| e.to_string())?;
    if text.is_empty() {
        Ok(None)
    } else {
        Ok(Some(text))
    }
}

fn write_encrypted_file(path: &PathBuf, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = encrypt(content.as_bytes())?;
    fs::write(path, bytes).map_err(|e| e.to_string())
}

fn delete_file_if_exists(path: &PathBuf) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn storage_read_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_settings(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = settings_path(&app)?;
    write_encrypted_file(&path, &data)
}

#[tauri::command]
pub fn storage_read_characters(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = characters_path(&app)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_characters(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = characters_path(&app)?;
    write_encrypted_file(&path, &data)
}

#[tauri::command]
pub fn storage_read_personas(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = personas_path(&app)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_personas(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = personas_path(&app)?;
    write_encrypted_file(&path, &data)
}

#[tauri::command]
pub fn storage_read_sessions_index(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = sessions_index_path(&app)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_sessions_index(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = sessions_index_path(&app)?;
    write_encrypted_file(&path, &data)
}

#[tauri::command]
pub fn storage_read_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<Option<String>, String> {
    let path = session_file_path(&app, &session_id)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_session(
    app: tauri::AppHandle,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let path = session_file_path(&app, &session_id)?;
    write_encrypted_file(&path, &data)
}

#[tauri::command]
pub fn storage_delete_session(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    let path = session_file_path(&app, &session_id)?;
    delete_file_if_exists(&path)
}

#[tauri::command]
pub fn storage_clear_all(app: tauri::AppHandle) -> Result<(), String> {
    let dir = storage_root(&app)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsageSummary {
    pub file_count: usize,
    pub estimated_sessions: usize,
    pub last_updated_ms: Option<u64>,
}

#[tauri::command]
pub fn storage_usage_summary(app: tauri::AppHandle) -> Result<StorageUsageSummary, String> {
    let mut file_count = 0usize;
    let mut latest: Option<u64> = None;

    let paths = vec![
        settings_path(&app)?,
        characters_path(&app)?,
        personas_path(&app)?,
        sessions_index_path(&app)?,
    ];

    for path in paths {
        if path.exists() {
            file_count += 1;
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(ms) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let timestamp = ms.as_millis() as u64;
                        latest = Some(latest.map_or(timestamp, |current| current.max(timestamp)));
                    }
                }
            }
        }
    }

    let sessions_dir = storage_root(&app)?.join(SESSIONS_DIR);
    let mut session_count = 0usize;
    if sessions_dir.exists() {
        for entry in fs::read_dir(&sessions_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                session_count += 1;
                if let Ok(metadata) = entry.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(ms) = modified.duration_since(std::time::UNIX_EPOCH) {
                            let ts = ms.as_millis() as u64;
                            latest = Some(latest.map_or(ts, |current| current.max(ts)));
                        }
                    }
                }
            }
        }
    }

    let last_updated_ms = match latest {
        Some(ts) => Some(ts),
        None => now_millis().ok(),
    };

    Ok(StorageUsageSummary {
        file_count: file_count + session_count,
        estimated_sessions: session_count,
        last_updated_ms,
    })
}

pub(crate) fn internal_read_settings(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(app)?;
    read_encrypted_file(&path)
}

// Image storage - returns file path, NOT base64
#[tauri::command]
pub fn storage_write_image(
    app: tauri::AppHandle,
    image_id: String,
    base64_data: String,
) -> Result<String, String> {
    // Remove data URL prefix if present
    let data = if let Some(comma_idx) = base64_data.find(',') {
        &base64_data[comma_idx + 1..]
    } else {
        &base64_data
    };

    // Decode base64
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Create images directory
    let images_dir = storage_root(&app)?.join("images");
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    // Detect file extension from magic bytes
    let extension = if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "png"
    } else if bytes.starts_with(&[0x47, 0x49, 0x46]) {
        "gif"
    } else if bytes.starts_with(&[0x52, 0x49, 0x46, 0x46])
        && bytes.len() > 8
        && &bytes[8..12] == b"WEBP"
    {
        "webp"
    } else {
        "png" // default
    };

    // Write image file with proper extension
    let image_path = images_dir.join(format!("{}.{}", image_id, extension));
    fs::write(&image_path, bytes).map_err(|e| e.to_string())?;

    // Return the absolute file path
    Ok(image_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn storage_get_image_path(app: tauri::AppHandle, image_id: String) -> Result<String, String> {
    let images_dir = storage_root(&app)?.join("images");

    // Check for file with any image extension
    for ext in &["jpg", "jpeg", "png", "gif", "webp"] {
        let image_path = images_dir.join(format!("{}.{}", image_id, ext));
        if image_path.exists() {
            return Ok(image_path.to_string_lossy().to_string());
        }
    }

    Err(format!("Image not found: {}", image_id))
}

#[tauri::command]
pub fn storage_delete_image(app: tauri::AppHandle, image_id: String) -> Result<(), String> {
    let images_dir = storage_root(&app)?.join("images");

    // Delete file with any extension
    for ext in &["jpg", "jpeg", "png", "gif", "webp", "img"] {
        let image_path = images_dir.join(format!("{}.{}", image_id, ext));
        if image_path.exists() {
            delete_file_if_exists(&image_path)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn storage_read_image(app: tauri::AppHandle, image_id: String) -> Result<String, String> {
    let images_dir = storage_root(&app)?.join("images");

    // Find the image file with any extension
    for ext in &["jpg", "jpeg", "png", "gif", "webp"] {
        let image_path = images_dir.join(format!("{}.{}", image_id, ext));
        if image_path.exists() {
            let bytes = fs::read(&image_path).map_err(|e| e.to_string())?;

            // Determine MIME type from extension
            let mime_type = match *ext {
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => "image/png",
            };

            // Encode to base64 and return as data URL
            let base64_data = general_purpose::STANDARD.encode(&bytes);
            return Ok(format!("data:{};base64,{}", mime_type, base64_data));
        }
    }

    Err(format!("Image not found: {}", image_id))
}

#[tauri::command]
pub fn storage_save_avatar(
    app: tauri::AppHandle,
    entity_id: String,
    base64_data: String,
) -> Result<String, String> {
    let data = if let Some(comma_idx) = base64_data.find(',') {
        &base64_data[comma_idx + 1..]
    } else {
        &base64_data
    };

    // Decode base64
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Create avatars/<entity-id> directory
    let avatars_dir = storage_root(&app)?.join("avatars").join(&entity_id);
    fs::create_dir_all(&avatars_dir).map_err(|e| e.to_string())?;

    let webp_bytes = match image::load_from_memory(&bytes) {
        Ok(img) => {
            let mut webp_data: Vec<u8> = Vec::new();
            let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut webp_data);
            img.write_with_encoder(encoder)
                .map_err(|e| format!("Failed to encode WebP: {}", e))?;
            webp_data
        }
        Err(_) => bytes,
    };

    let filename = "avatar.webp";
    let avatar_path = avatars_dir.join(filename);
    fs::write(&avatar_path, webp_bytes).map_err(|e| e.to_string())?;

    // Delete the cached gradient file since avatar changed
    let gradient_cache_path = avatars_dir.join("gradient.json");
    if gradient_cache_path.exists() {
        let _ = fs::remove_file(&gradient_cache_path);
        log_info(
            &app,
            "avatar",
            format!("Deleted gradient cache for {}", entity_id),
        );
    }

    Ok(filename.to_string())
}

#[tauri::command]
pub fn storage_load_avatar(
    app: tauri::AppHandle,
    entity_id: String,
    filename: String,
) -> Result<String, String> {
    let avatar_path = storage_root(&app)?
        .join("avatars")
        .join(&entity_id)
        .join(&filename);

    if !avatar_path.exists() {
        return Err(format!("Avatar not found: {}/{}", entity_id, filename));
    }

    let bytes = fs::read(&avatar_path).map_err(|e| e.to_string())?;

    // Determine MIME type from file extension
    let mime_type = if filename.ends_with(".webp") {
        "image/webp"
    } else if filename.ends_with(".png") {
        "image/png"
    } else if filename.ends_with(".jpg") || filename.ends_with(".jpeg") {
        "image/jpeg"
    } else if filename.ends_with(".gif") {
        "image/gif"
    } else {
        "image/webp"
    };

    // Encode to base64 and return as data URL
    let base64_data = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime_type, base64_data))
}

#[tauri::command]
pub fn storage_delete_avatar(
    app: tauri::AppHandle,
    entity_id: String,
    filename: String,
) -> Result<(), String> {
    let avatar_path = storage_root(&app)?
        .join("avatars")
        .join(&entity_id)
        .join(&filename);

    delete_file_if_exists(&avatar_path)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GradientColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub hex: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AvatarGradient {
    pub colors: Vec<GradientColor>,
    pub gradient_css: String,
    pub dominant_hue: f64,
    pub text_color: String,    
    pub text_secondary: String, 
}

#[tauri::command]
pub fn generate_avatar_gradient(
    app: tauri::AppHandle,
    entity_id: String,
    _filename: String,
) -> Result<AvatarGradient, String> {
    let avatars_dir = storage_root(&app)?.join("avatars").join(&entity_id);

    let avatar_path = avatars_dir.join("avatar.webp");
    let gradient_cache_path = avatars_dir.join("gradient.json");

    if !avatar_path.exists() {
        return Err(format!("Avatar not found: {}/avatar.webp", entity_id));
    }

    if gradient_cache_path.exists() {
        if let Ok(avatar_meta) = fs::metadata(&avatar_path) {
            if let Ok(cache_meta) = fs::metadata(&gradient_cache_path) {
                if let (Ok(avatar_time), Ok(cache_time)) =
                    (avatar_meta.modified(), cache_meta.modified())
                {
                    if cache_time >= avatar_time {
                        if let Ok(cached_json) = fs::read_to_string(&gradient_cache_path) {
                            if let Ok(cached_gradient) =
                                serde_json::from_str::<AvatarGradient>(&cached_json)
                            {
                                log_info(
                                    &app,
                                    "gradient",
                                    format!(
                                        "Using cached gradient from file for entity: {}",
                                        entity_id
                                    ),
                                );
                                return Ok(cached_gradient);
                            }
                        }
                    }
                }
            }
        }
    }

    log_info(
        &app,
        "gradient",
        format!("Processing avatar for entity: {}", entity_id),
    );

    let img = image::open(&avatar_path).map_err(|e| format!("Failed to load image: {}", e))?;

    let rgb_img = img.to_rgb8();
    let (width, height) = rgb_img.dimensions();

    log_debug(
        &app,
        "gradient",
        format!("Image dimensions: {}x{}", width, height),
    );

    let mut samples: Vec<(u8, u8, u8)> = Vec::new();
    let total_pixels = width * height;
    
    let target_samples = 100;
    let sample_step = ((total_pixels as f64 / target_samples as f64).sqrt()).max(1.0) as u32;

    log_debug(
        &app,
        "gradient",
        format!(
            "Total pixels: {}, Sampling with step: {} (target ~{} samples)",
            total_pixels, sample_step, target_samples
        ),
    );

    for y in (0..height).step_by(sample_step as usize) {
        for x in (0..width).step_by(sample_step as usize) {
            if let Some(pixel) = rgb_img.get_pixel_checked(x, y) {
                let (r, g, b) = (pixel[0], pixel[1], pixel[2]);
                let (_, s, v) = rgb_to_hsv(r, g, b);

                // Filter out very dark, very bright, or very desaturated colors
                if v > 0.15 && v < 0.95 && s > 0.1 {
                    samples.push((r, g, b));
                }
            }
        }
    }

    log_info(
        &app,
        "gradient",
        format!("Collected {} samples", samples.len()),
    );

    if samples.is_empty() {
        log_warn(
            &app,
            "gradient",
            "No samples collected, using default gradient",
        );
        return Ok(create_default_gradient());
    }

    log_debug(
        &app,
        "gradient",
        format!("First 5 samples: {:?}", &samples[..samples.len().min(5)]),
    );

    let dominant_colors = find_dominant_colors(&samples, 3)?;

    log_info(
        &app,
        "gradient",
        format!("Dominant colors RGB: {:?}", dominant_colors),
    );

    for (i, color) in dominant_colors.iter().enumerate() {
        let (h, s, v) = rgb_to_hsv(color.0, color.1, color.2);
        log_debug(
            &app,
            "gradient",
            format!(
                "Color {}: RGB({}, {}, {}) -> HSV({:.1}°, {:.2}, {:.2})",
                i, color.0, color.1, color.2, h, s, v
            ),
        );
    }

    let avg_hue = calculate_average_hue(&dominant_colors);

    log_info(&app, "gradient", format!("Average hue: {:.1}°", avg_hue));

    let gradient_colors = generate_gradient_colors(&dominant_colors, avg_hue)?;

    log_info(
        &app,
        "gradient",
        format!("Generated {} gradient colors", gradient_colors.len()),
    );

    let gradient_css = create_css_gradient(&gradient_colors);

    log_info(&app, "gradient", format!("CSS gradient: {}", gradient_css));

    let (text_color, text_secondary) = calculate_text_colors(&gradient_colors);

    let gradient = AvatarGradient {
        colors: gradient_colors,
        gradient_css,
        dominant_hue: avg_hue,
        text_color,
        text_secondary,
    };

    if let Ok(json) = serde_json::to_string_pretty(&gradient) {
        let _ = fs::write(&gradient_cache_path, json);
        log_info(&app, "gradient", "Saved gradient cache to file");
    }

    Ok(gradient)
}

fn find_dominant_colors(samples: &[(u8, u8, u8)], k: usize) -> Result<Vec<(u8, u8, u8)>, String> {
    if samples.is_empty() {
        return Err("No samples provided".to_string());
    }

    let mut centroids: Vec<(f64, f64, f64)> = Vec::new();
    let step = samples.len() / k.max(1);
    for i in 0..k {
        let idx = (i * step).min(samples.len() - 1);
        let sample = samples[idx];
        centroids.push((sample.0 as f64, sample.1 as f64, sample.2 as f64));
    }

    let mut assignments = vec![0; samples.len()];
    
    let max_iterations = 5;
    let convergence_threshold = 0.1;
    
    for iteration in 0..max_iterations {
        let old_centroids = centroids.clone();
        
        for (i, sample) in samples.iter().enumerate() {
            let mut min_dist_sq = f64::MAX;
            let mut closest = 0;

            for (j, centroid) in centroids.iter().enumerate() {
                let dist_sq = (sample.0 as f64 - centroid.0).powi(2)
                    + (sample.1 as f64 - centroid.1).powi(2)
                    + (sample.2 as f64 - centroid.2).powi(2);
                    
                if dist_sq < min_dist_sq {
                    min_dist_sq = dist_sq;
                    closest = j;
                }
            }
            assignments[i] = closest;
        }

        let mut new_centroids = vec![(0.0, 0.0, 0.0); k];
        let mut counts = vec![0; k];

        for (i, &assignment) in assignments.iter().enumerate() {
            let sample = samples[i];
            new_centroids[assignment].0 += sample.0 as f64;
            new_centroids[assignment].1 += sample.1 as f64;
            new_centroids[assignment].2 += sample.2 as f64;
            counts[assignment] += 1;
        }

        for j in 0..k {
            if counts[j] > 0 {
                centroids[j].0 = new_centroids[j].0 / counts[j] as f64;
                centroids[j].1 = new_centroids[j].1 / counts[j] as f64;
                centroids[j].2 = new_centroids[j].2 / counts[j] as f64;
            }
        }
        
        if iteration > 0 {
            let max_movement = centroids.iter().zip(old_centroids.iter())
                .map(|(new, old)| {
                    (new.0 - old.0).abs() + (new.1 - old.1).abs() + (new.2 - old.2).abs()
                })
                .fold(0.0f64, f64::max);
                
            if max_movement < convergence_threshold {
                break;
            }
        }
    }

    let mut result = Vec::new();
    for centroid in centroids {
        result.push((
            centroid.0.clamp(0.0, 255.0) as u8,
            centroid.1.clamp(0.0, 255.0) as u8,
            centroid.2.clamp(0.0, 255.0) as u8,
        ));
    }

    result.sort_by(|a, b| {
        let (_, s_a, v_a) = rgb_to_hsv(a.0, a.1, a.2);
        let (_, s_b, v_b) = rgb_to_hsv(b.0, b.1, b.2);
        let score_a = s_a * 0.7 + v_a * 0.3;
        let score_b = s_b * 0.7 + v_b * 0.3;
        score_b
            .partial_cmp(&score_a)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(result)
}

fn calculate_average_hue(colors: &[(u8, u8, u8)]) -> f64 {
    let mut hsv_colors = Vec::new();

    for (r, g, b) in colors {
        let (h, s, v) = rgb_to_hsv(*r, *g, *b);
        hsv_colors.push((h, s, v));
    }

    let mut total_weight = 0.0;
    let mut weighted_sum = 0.0;
    let mut max_v: f64 = 0.0;

    for (h, s, v) in hsv_colors {
        let weight = s * v;
        if weight > 0.01 {
            weighted_sum += h * weight;
            total_weight += weight;
            if v > max_v {
                max_v = v;
            }
        }
    }

    if total_weight > 0.0 {
        weighted_sum / total_weight
    } else {
        0.0
    }
}

fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let r = r as f64 / 255.0;
    let g = g as f64 / 255.0;
    let b = b as f64 / 255.0;

    let max = r.max(g.max(b));
    let min = r.min(g.min(b));
    let diff = max - min;

    let v = max;
    let s = if max == 0.0 { 0.0 } else { diff / max };

    let h = if diff == 0.0 {
        0.0
    } else if max == r {
        60.0 * (((g - b) / diff) % 6.0)
    } else if max == g {
        60.0 * ((b - r) / diff + 2.0)
    } else {
        60.0 * ((r - g) / diff + 4.0)
    };

    let h = if h < 0.0 { h + 360.0 } else { h };
    (h, s, v)
}

fn hsv_to_rgb(h: f64, s: f64, v: f64) -> (u8, u8, u8) {
    let c = v * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = v - c;

    let (r, g, b) = if h < 60.0 {
        (c, x, 0.0)
    } else if h < 120.0 {
        (x, c, 0.0)
    } else if h < 180.0 {
        (0.0, c, x)
    } else if h < 240.0 {
        (0.0, x, c)
    } else if h < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };

    (
        ((r + m) * 255.0).round() as u8,
        ((g + m) * 255.0).round() as u8,
        ((b + m) * 255.0).round() as u8,
    )
}

fn generate_gradient_colors(
    colors: &[(u8, u8, u8)],
    _base_hue: f64,
) -> Result<Vec<GradientColor>, String> {
    let mut gradient_colors = Vec::new();

    for color in colors.iter() {
        let (h, s, v) = rgb_to_hsv(color.0, color.1, color.2);

        let boosted_s = (s * 1.2).min(0.85);
        let boosted_v = (v * 1.15).min(0.95);

        let (r, g, b) = hsv_to_rgb(h, boosted_s, boosted_v);
        let hex = format!("#{:02x}{:02x}{:02x}", r, g, b);

        gradient_colors.push(GradientColor {
            r,
            g,
            b,
            hex: hex.clone(),
        });
    }

    Ok(gradient_colors)
}

fn create_css_gradient(colors: &[GradientColor]) -> String {
    if colors.is_empty() {
        return "linear-gradient(135deg, #6366f1, #8b5cf6)".to_string();
    }

    let stops: Vec<String> = colors
        .iter()
        .enumerate()
        .map(|(i, color)| {
            let percent = (i as f64 / (colors.len() - 1) as f64) * 100.0;
            format!("{} {}%", color.hex, percent)
        })
        .collect();

    format!("linear-gradient(135deg, {})", stops.join(", "))
}

fn create_default_gradient() -> AvatarGradient {
    let colors = vec![
        GradientColor {
            r: 99,
            g: 102,
            b: 241,
            hex: "#6366f1".to_string(),
        },
        GradientColor {
            r: 139,
            g: 92,
            b: 246,
            hex: "#8b5cf6".to_string(),
        },
        GradientColor {
            r: 236,
            g: 72,
            b: 153,
            hex: "#ec4899".to_string(),
        },
    ];

    let gradient_css = "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)".to_string();

    AvatarGradient {
        colors,
        gradient_css,
        dominant_hue: 270.0,
        text_color: "#ffffff".to_string(),
        text_secondary: "rgba(255, 255, 255, 0.7)".to_string(),
    }
}

fn calculate_text_colors(gradient_colors: &[GradientColor]) -> (String, String) {
    if gradient_colors.is_empty() {
        return (
            "#ffffff".to_string(),
            "rgba(255, 255, 255, 0.7)".to_string(),
        );
    }

    let mut total_luminance = 0.0;
    for color in gradient_colors {
        let r = color.r as f64 / 255.0;
        let g = color.g as f64 / 255.0;
        let b = color.b as f64 / 255.0;

        let r_lin = if r <= 0.03928 {
            r / 12.92
        } else {
            ((r + 0.055) / 1.055).powf(2.4)
        };
        let g_lin = if g <= 0.03928 {
            g / 12.92
        } else {
            ((g + 0.055) / 1.055).powf(2.4)
        };
        let b_lin = if b <= 0.03928 {
            b / 12.92
        } else {
            ((b + 0.055) / 1.055).powf(2.4)
        };

        let luminance = 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin;
        total_luminance += luminance;
    }

    let avg_luminance = total_luminance / gradient_colors.len() as f64;

    if avg_luminance < 0.5 {
        (
            "#ffffff".to_string(),
            "rgba(255, 255, 255, 0.7)".to_string(),
        )
    } else {
        ("#000000".to_string(), "rgba(0, 0, 0, 0.6)".to_string())
    }
}
