use base64::{engine::general_purpose, Engine as _};
use std::fs;

use super::legacy::storage_root;
use crate::utils::{log_debug, log_info};

#[tauri::command]
pub fn storage_write_image(
    app: tauri::AppHandle,
    image_id: String,
    base64_data: String,
) -> Result<String, String> {
    let data = if let Some(comma_idx) = base64_data.find(',') {
        &base64_data[comma_idx + 1..]
    } else {
        &base64_data
    };
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    let images_dir = storage_root(&app)?.join("images");
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    let extension = if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "png"
    } else if bytes.starts_with(&[0x47, 0x49, 0x46]) {
        "gif"
    } else if bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        "webp"
    } else {
        "png"
    };
    let image_path = images_dir.join(format!("{}.{}", image_id, extension));
    fs::write(&image_path, bytes).map_err(|e| e.to_string())?;
    Ok(image_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn storage_get_image_path(app: tauri::AppHandle, image_id: String) -> Result<String, String> {
    let images_dir = storage_root(&app)?.join("images");
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
    for ext in &["jpg", "jpeg", "png", "gif", "webp", "img"] {
        let image_path = images_dir.join(format!("{}.{}", image_id, ext));
        if image_path.exists() {
            fs::remove_file(&image_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn storage_read_image(app: tauri::AppHandle, image_id: String) -> Result<String, String> {
    let images_dir = storage_root(&app)?.join("images");
    for ext in &["jpg", "jpeg", "png", "gif", "webp"] {
        let image_path = images_dir.join(format!("{}.{}", image_id, ext));
        if image_path.exists() {
            let bytes = fs::read(&image_path).map_err(|e| e.to_string())?;
            let mime_type = match *ext {
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => "image/png",
            };
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
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
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
    if avatar_path.exists() {
        fs::remove_file(&avatar_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct GradientColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub hex: String,
}
#[derive(serde::Serialize, serde::Deserialize, Clone)]
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
    for y in (0..height).step_by(sample_step as usize) {
        for x in (0..width).step_by(sample_step as usize) {
            if let Some(pixel) = rgb_img.get_pixel_checked(x, y) {
                let (r, g, b) = (pixel[0], pixel[1], pixel[2]);
                let (_, s, v) = rgb_to_hsv(r, g, b);
                if v > 0.15 && v < 0.95 && s > 0.1 {
                    samples.push((r, g, b));
                }
            }
        }
    }
    if samples.is_empty() {
        return Ok(create_default_gradient());
    }
    let dominant_colors = find_dominant_colors(&samples, 3)?;
    let avg_hue = calculate_average_hue(&dominant_colors);
    let gradient_colors = generate_gradient_colors(&dominant_colors, avg_hue)?;
    let gradient_css = create_css_gradient(&gradient_colors);
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
    for _ in 0..8 {
        let mut clusters: Vec<Vec<(f64, f64, f64)>> = vec![Vec::new(); k];
        for &(r, g, b) in samples {
            let mut best = 0usize;
            let mut bestd = f64::MAX;
            for (i, &(cr, cg, cb)) in centroids.iter().enumerate() {
                let d = (r as f64 - cr).powi(2) + (g as f64 - cg).powi(2) + (b as f64 - cb).powi(2);
                if d < bestd {
                    bestd = d;
                    best = i;
                }
            }
            clusters[best].push((r as f64, g as f64, b as f64));
        }
        for (i, cluster) in clusters.iter().enumerate() {
            if !cluster.is_empty() {
                let (mut sr, mut sg, mut sb) = (0.0, 0.0, 0.0);
                for &(r, g, b) in cluster {
                    sr += r;
                    sg += g;
                    sb += b;
                }
                let l = cluster.len() as f64;
                centroids[i] = (sr / l, sg / l, sb / l);
            }
        }
    }
    Ok(centroids
        .into_iter()
        .map(|(r, g, b)| (r.round() as u8, g.round() as u8, b.round() as u8))
        .collect())
}

fn calculate_average_hue(colors: &[(u8, u8, u8)]) -> f64 {
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    for &(r, g, b) in colors {
        let (h, s, v) = rgb_to_hsv(r, g, b);
        let weight = s * v;
        let angle = h.to_radians();
        sum_x += angle.cos() * weight;
        sum_y += angle.sin() * weight;
    }
    if sum_x == 0.0 && sum_y == 0.0 {
        0.0
    } else {
        sum_y.atan2(sum_x).to_degrees().rem_euclid(360.0)
    }
}

fn calculate_text_colors(colors: &[GradientColor]) -> (String, String) {
    let luminances: Vec<f64> = colors
        .iter()
        .map(|c| {
            0.2126 * (c.r as f64 / 255.0)
                + 0.7152 * (c.g as f64 / 255.0)
                + 0.0722 * (c.b as f64 / 255.0)
        })
        .collect();
    let avg = if luminances.is_empty() {
        0.0
    } else {
        luminances.iter().sum::<f64>() / luminances.len() as f64
    };
    if avg > 0.5 {
        ("#111827".into(), "#374151".into())
    } else {
        ("#F9FAFB".into(), "#D1D5DB".into())
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
        gradient_colors.push(GradientColor { r, g, b, hex });
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
        dominant_hue: 0.0,
        text_color: "#F9FAFB".into(),
        text_secondary: "#D1D5DB".into(),
    }
}

#[tauri::command]
pub fn storage_save_session_attachment(
    app: tauri::AppHandle,
    character_id: String,
    session_id: String,
    message_id: String,
    attachment_id: String,
    role: String, // "user" or "assistant"
    base64_data: String,
) -> Result<String, String> {
    let data = if let Some(comma_idx) = base64_data.find(',') {
        &base64_data[comma_idx + 1..]
    } else {
        &base64_data
    };
    
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    
    let sessions_dir = storage_root(&app)?
        .join("sessions")
        .join(&character_id)
        .join(&session_id);
    fs::create_dir_all(&sessions_dir).map_err(|e| e.to_string())?;
    
    let role_prefix = if role == "assistant" { "ai" } else { "user" };
    
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
    
    // Filename: <role>_<message_id>_<attachment_id>.webp
    let filename = format!("{}_{}_{}.webp", role_prefix, message_id, attachment_id);
    let image_path = sessions_dir.join(&filename);
    fs::write(&image_path, webp_bytes).map_err(|e| e.to_string())?;
    
    let relative_path = format!("sessions/{}/{}/{}", character_id, session_id, filename);
    
    log_debug(
        &app,
        "session_attachment",
        format!("Saved attachment: {}", relative_path),
    );
    
    Ok(relative_path)
}

#[tauri::command]
pub fn storage_load_session_attachment(
    app: tauri::AppHandle,
    storage_path: String,
) -> Result<String, String> {
    let full_path = storage_root(&app)?.join(&storage_path);
    
    if !full_path.exists() {
        return Err(format!("Attachment not found: {}", storage_path));
    }
    
    let bytes = fs::read(&full_path).map_err(|e| e.to_string())?;
    
    // Determine MIME type from extension
    let mime_type = if storage_path.ends_with(".webp") {
        "image/webp"
    } else if storage_path.ends_with(".png") {
        "image/png"
    } else if storage_path.ends_with(".jpg") || storage_path.ends_with(".jpeg") {
        "image/jpeg"
    } else if storage_path.ends_with(".gif") {
        "image/gif"
    } else {
        "image/webp"
    };
    
    let base64_data = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime_type, base64_data))
}

#[tauri::command]
pub fn storage_delete_session_attachments(
    app: tauri::AppHandle,
    character_id: String,
    session_id: String,
) -> Result<(), String> {
    let sessions_dir = storage_root(&app)?
        .join("sessions")
        .join(&character_id)
        .join(&session_id);
    
    if sessions_dir.exists() {
        fs::remove_dir_all(&sessions_dir).map_err(|e| e.to_string())?;
        log_info(
            &app,
            "session_attachment",
            format!("Deleted all attachments for session: {}/{}", character_id, session_id),
        );
    }
    
    Ok(())
}

#[tauri::command]
pub fn storage_session_attachment_exists(
    app: tauri::AppHandle,
    storage_path: String,
) -> Result<bool, String> {
    let full_path = storage_root(&app)?.join(&storage_path);
    Ok(full_path.exists())
}
