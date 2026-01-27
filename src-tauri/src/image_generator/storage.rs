use base64::{engine::general_purpose, Engine};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub fn save_image(
    app: &AppHandle,
    image_data: &str,
    session_id: Option<&str>,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to get app data dir: {}", e)))?;

    let images_dir = if let Some(sid) = session_id {
        app_data_dir.join("generated_images").join(sid)
    } else {
        app_data_dir.join("generated_images").join("standalone")
    };

    fs::create_dir_all(&images_dir)
        .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to create images directory: {}", e)))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let uuid = uuid::Uuid::new_v4();
    let filename = format!("{}_{}.png", timestamp, uuid);
    let file_path = images_dir.join(&filename);

    if image_data.starts_with("http://") || image_data.starts_with("https://") {
        download_image_from_url(image_data, &file_path)?;
    } else if image_data.starts_with("data:image") {
        save_base64_image(image_data, &file_path)?;
    } else {
        save_raw_base64(image_data, &file_path)?;
    }

    file_path
        .to_str()
        .ok_or_else(|| "Failed to convert path to string".to_string())
        .map(|s| s.to_string())
}

fn download_image_from_url(url: &str, dest: &PathBuf) -> Result<(), String> {
    let rt =
        tokio::runtime::Runtime::new().map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to create runtime: {}", e)))?;

    rt.block_on(async {
        let response = reqwest::get(url)
            .await
            .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to download image: {}", e)))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to download image: HTTP {}",
                response.status()
            ));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to read image bytes: {}", e)))?;

        fs::write(dest, bytes).map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to write image file: {}", e)))?;

        Ok(())
    })
}

fn save_base64_image(data_url: &str, dest: &PathBuf) -> Result<(), String> {
    let base64_data = data_url
        .split(',')
        .nth(1)
        .ok_or_else(|| "Invalid data URL format".to_string())?;

    save_raw_base64(base64_data, dest)
}

fn save_raw_base64(base64_data: &str, dest: &PathBuf) -> Result<(), String> {
    let bytes = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to decode base64: {}", e)))?;

    fs::write(dest, bytes).map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to write image file: {}", e)))?;

    Ok(())
}
