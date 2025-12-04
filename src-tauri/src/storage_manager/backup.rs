use base64::{engine::general_purpose, Engine as _};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::rngs::OsRng;
use rand::RngCore;
use rusqlite::backup::Backup;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::Duration;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::db::{db_path, open_db};
use super::legacy::storage_root;
use crate::utils::log_info;

const BACKUP_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct BackupManifest {
    version: u32,
    created_at: u64,
    app_version: String,
    encrypted: bool,
    /// Salt used for key derivation (base64)
    salt: Option<String>,
    /// Nonce used for encryption (base64)
    nonce: Option<String>,
}

/// Derive encryption key from password using BLAKE3
fn derive_key_from_password(password: &str, salt: &[u8; 16]) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new();
    hasher.update(password.as_bytes());
    hasher.update(salt);
    hasher.update(b"lettuce_backup_key_v1");
    let hash = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(hash.as_bytes());
    key
}

/// Encrypt data using XChaCha20-Poly1305
fn encrypt_data(data: &[u8], key: &[u8; 32], nonce: &[u8; 24]) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let xnonce: XNonce = (*nonce).into();
    cipher
        .encrypt(&xnonce, data)
        .map_err(|e| format!("Encryption failed: {}", e))
}

/// Decrypt data using XChaCha20-Poly1305
fn decrypt_data(data: &[u8], key: &[u8; 32], nonce: &[u8; 24]) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let xnonce: XNonce = (*nonce).into();
    cipher
        .decrypt(&xnonce, data)
        .map_err(|e| format!("Decryption failed: {}", e))
}

/// Get the downloads directory path
fn get_downloads_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "android")]
    {
        Ok(PathBuf::from("/storage/emulated/0/Download"))
    }

    #[cfg(not(target_os = "android"))]
    {
        dirs::download_dir().ok_or_else(|| "Could not find Downloads directory".to_string())
    }
}

/// Export full app backup to a .lettuce file
#[tauri::command]
pub async fn backup_export(
    app: tauri::AppHandle,
    password: Option<String>,
) -> Result<String, String> {
    let storage = storage_root(&app)?;
    let images_dir = storage.join("images");
    let avatars_dir = storage.join("avatars");
    let attachments_dir = storage.join("attachments");

    // Generate timestamp for filename
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("lettuce_backup_{}.lettuce", timestamp);
    let downloads = get_downloads_dir()?;
    let output_path = downloads.join(&filename);

    log_info(
        &app,
        "backup",
        format!("Starting backup export to {:?}", output_path),
    );

    // Create a temporary directory for staging
    let temp_dir = storage.join(".backup_temp");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    // Backup database using SQLite's backup API (safe, consistent copy)
    let temp_db = temp_dir.join("app.db");
    {
        let src_conn = open_db(&app)?;
        let mut dst_conn =
            Connection::open(&temp_db).map_err(|e| format!("Failed to create backup db: {}", e))?;

        let backup = Backup::new(&src_conn, &mut dst_conn)
            .map_err(|e| format!("Failed to init backup: {}", e))?;

        backup
            .run_to_completion(100, Duration::from_millis(10), None)
            .map_err(|e| format!("Backup failed: {}", e))?;
    }

    log_info(&app, "backup", "Database backup complete");

    // Create the zip file
    let file = File::create(&output_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    // Add database to zip
    let db_bytes = fs::read(&temp_db).map_err(|e| e.to_string())?;
    zip.start_file("database/app.db", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&db_bytes).map_err(|e| e.to_string())?;

    log_info(&app, "backup", "Added database to archive");

    // Add images directory
    if images_dir.exists() {
        add_directory_to_zip(&mut zip, &images_dir, "images", options)?;
        log_info(&app, "backup", "Added images to archive");
    }

    // Add avatars directory
    if avatars_dir.exists() {
        add_directory_to_zip(&mut zip, &avatars_dir, "avatars", options)?;
        log_info(&app, "backup", "Added avatars to archive");
    }

    // Add attachments directory
    if attachments_dir.exists() {
        add_directory_to_zip(&mut zip, &attachments_dir, "attachments", options)?;
        log_info(&app, "backup", "Added attachments to archive");
    }

    // Create manifest
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let app_version = app.package_info().version.to_string();

    let (manifest, encrypted_content) = if let Some(ref pwd) = password {
        // Generate salt and nonce
        let mut salt = [0u8; 16];
        let mut nonce = [0u8; 24];
        OsRng.fill_bytes(&mut salt);
        OsRng.fill_bytes(&mut nonce);

        let key = derive_key_from_password(pwd, &salt);

        // We'll encrypt a marker file to verify password on import
        let marker = b"LETTUCE_BACKUP_VERIFIED";
        let encrypted_marker = encrypt_data(marker, &key, &nonce)?;

        let manifest = BackupManifest {
            version: BACKUP_VERSION,
            created_at: now,
            app_version,
            encrypted: true,
            salt: Some(general_purpose::STANDARD.encode(salt)),
            nonce: Some(general_purpose::STANDARD.encode(nonce)),
        };

        (manifest, Some(encrypted_marker))
    } else {
        let manifest = BackupManifest {
            version: BACKUP_VERSION,
            created_at: now,
            app_version,
            encrypted: false,
            salt: None,
            nonce: None,
        };
        (manifest, None)
    };

    // Add manifest
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    zip.start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| e.to_string())?;

    // Add encrypted marker if password was provided
    if let Some(marker) = encrypted_content {
        zip.start_file("encrypted_marker.bin", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&marker).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;

    // Cleanup temp directory
    fs::remove_dir_all(&temp_dir).ok();

    log_info(
        &app,
        "backup",
        format!("Backup export complete: {:?}", output_path),
    );

    Ok(output_path.to_string_lossy().to_string())
}

/// Helper to add a directory recursively to zip
fn add_directory_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    dir: &PathBuf,
    prefix: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            let relative = path
                .strip_prefix(dir)
                .map_err(|e| e.to_string())?
                .to_string_lossy();
            let zip_path = format!("{}/{}", prefix, relative);

            let bytes = fs::read(path).map_err(|e| e.to_string())?;
            zip.start_file(&zip_path, options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Check if a backup file requires a password
#[tauri::command]
pub fn backup_check_encrypted(backup_path: String) -> Result<bool, String> {
    let file = File::open(&backup_path).map_err(|e| format!("Failed to open backup: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read backup archive: {}", e))?;

    // Read manifest
    let mut manifest_file = archive
        .by_name("manifest.json")
        .map_err(|e| format!("Invalid backup: missing manifest: {}", e))?;

    let mut manifest_str = String::new();
    manifest_file
        .read_to_string(&mut manifest_str)
        .map_err(|e| e.to_string())?;

    let manifest: BackupManifest =
        serde_json::from_str(&manifest_str).map_err(|e| format!("Invalid manifest: {}", e))?;

    Ok(manifest.encrypted)
}

/// Verify password for an encrypted backup
#[tauri::command]
pub fn backup_verify_password(backup_path: String, password: String) -> Result<bool, String> {
    let file = File::open(&backup_path).map_err(|e| format!("Failed to open backup: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read backup archive: {}", e))?;

    // Read manifest
    let mut manifest_file = archive
        .by_name("manifest.json")
        .map_err(|e| format!("Invalid backup: missing manifest: {}", e))?;

    let mut manifest_str = String::new();
    manifest_file
        .read_to_string(&mut manifest_str)
        .map_err(|e| e.to_string())?;

    let manifest: BackupManifest =
        serde_json::from_str(&manifest_str).map_err(|e| format!("Invalid manifest: {}", e))?;

    if !manifest.encrypted {
        return Ok(true); // No password needed
    }

    let salt_b64 = manifest
        .salt
        .ok_or_else(|| "Missing salt in encrypted backup".to_string())?;
    let nonce_b64 = manifest
        .nonce
        .ok_or_else(|| "Missing nonce in encrypted backup".to_string())?;

    let salt_vec = general_purpose::STANDARD
        .decode(&salt_b64)
        .map_err(|e| e.to_string())?;
    let nonce_vec = general_purpose::STANDARD
        .decode(&nonce_b64)
        .map_err(|e| e.to_string())?;

    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 24];
    salt.copy_from_slice(&salt_vec);
    nonce.copy_from_slice(&nonce_vec);

    let key = derive_key_from_password(&password, &salt);

    // Try to decrypt the marker
    drop(manifest_file);
    let mut marker_file = archive
        .by_name("encrypted_marker.bin")
        .map_err(|e| format!("Invalid backup: missing marker: {}", e))?;

    let mut encrypted_marker = Vec::new();
    marker_file
        .read_to_end(&mut encrypted_marker)
        .map_err(|e| e.to_string())?;

    match decrypt_data(&encrypted_marker, &key, &nonce) {
        Ok(decrypted) => Ok(decrypted == b"LETTUCE_BACKUP_VERIFIED"),
        Err(_) => Ok(false),
    }
}

/// Get backup info without importing
#[tauri::command]
pub fn backup_get_info(backup_path: String) -> Result<serde_json::Value, String> {
    let file = File::open(&backup_path).map_err(|e| format!("Failed to open backup: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read backup archive: {}", e))?;

    // Read manifest
    let mut manifest_file = archive
        .by_name("manifest.json")
        .map_err(|e| format!("Invalid backup: missing manifest: {}", e))?;

    let mut manifest_str = String::new();
    manifest_file
        .read_to_string(&mut manifest_str)
        .map_err(|e| e.to_string())?;

    let manifest: BackupManifest =
        serde_json::from_str(&manifest_str).map_err(|e| format!("Invalid manifest: {}", e))?;

    // Count files
    drop(manifest_file);
    let total_files = archive.len();
    let mut image_count = 0;
    let mut avatar_count = 0;
    let mut attachment_count = 0;

    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            let name = file.name();
            if name.starts_with("images/") {
                image_count += 1;
            } else if name.starts_with("avatars/") {
                avatar_count += 1;
            } else if name.starts_with("attachments/") {
                attachment_count += 1;
            }
        }
    }

    Ok(serde_json::json!({
        "version": manifest.version,
        "createdAt": manifest.created_at,
        "appVersion": manifest.app_version,
        "encrypted": manifest.encrypted,
        "totalFiles": total_files,
        "imageCount": image_count,
        "avatarCount": avatar_count,
        "attachmentCount": attachment_count,
    }))
}

/// Import a backup file, replacing all existing data
#[tauri::command]
pub async fn backup_import(
    app: tauri::AppHandle,
    backup_path: String,
    password: Option<String>,
) -> Result<(), String> {
    let storage = storage_root(&app)?;
    
    // First, read and validate manifest
    let manifest: BackupManifest = {
        let file = File::open(&backup_path).map_err(|e| format!("Failed to open backup: {}", e))?;
        let mut archive =
            ZipArchive::new(file).map_err(|e| format!("Failed to read backup archive: {}", e))?;

        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|e| format!("Invalid backup: missing manifest: {}", e))?;

        let mut manifest_str = String::new();
        manifest_file
            .read_to_string(&mut manifest_str)
            .map_err(|e| e.to_string())?;

        serde_json::from_str(&manifest_str).map_err(|e| format!("Invalid manifest: {}", e))?
    };

    log_info(
        &app,
        "backup",
        format!("Starting backup import from {:?}", backup_path),
    );

    // Verify password if encrypted
    if manifest.encrypted {
        let pwd = password.as_ref().ok_or_else(|| "Password required for encrypted backup".to_string())?;

        let salt_b64 = manifest
            .salt
            .as_ref()
            .ok_or_else(|| "Missing salt".to_string())?;
        let nonce_b64 = manifest
            .nonce
            .as_ref()
            .ok_or_else(|| "Missing nonce".to_string())?;

        let salt_vec = general_purpose::STANDARD
            .decode(salt_b64)
            .map_err(|e| e.to_string())?;
        let nonce_vec = general_purpose::STANDARD
            .decode(nonce_b64)
            .map_err(|e| e.to_string())?;

        let mut salt = [0u8; 16];
        let mut nonce = [0u8; 24];
        salt.copy_from_slice(&salt_vec);
        nonce.copy_from_slice(&nonce_vec);

        let key = derive_key_from_password(pwd, &salt);

        // Verify marker in a separate scope
        let file = File::open(&backup_path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        
        let mut marker_file = archive
            .by_name("encrypted_marker.bin")
            .map_err(|e| format!("Invalid backup: missing marker: {}", e))?;

        let mut encrypted_marker = Vec::new();
        marker_file
            .read_to_end(&mut encrypted_marker)
            .map_err(|e| e.to_string())?;

        let decrypted = decrypt_data(&encrypted_marker, &key, &nonce)?;
        if decrypted != b"LETTUCE_BACKUP_VERIFIED" {
            return Err("Invalid password".to_string());
        }
    }

    // Now extract the archive
    let file = File::open(&backup_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Create a staging directory
    let staging_dir = storage.join(".import_staging");
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&staging_dir).map_err(|e| e.to_string())?;

    log_info(&app, "backup", "Extracting backup files...");

    // Extract all files to staging
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = staging_dir.join(file.name());

        if file.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    log_info(&app, "backup", "Extraction complete. Applying backup...");

    // Close the current database connection pool before replacing
    // Note: We need to be careful here - the pool is managed by Tauri state
    // The safest approach is to close connections, replace file, then app needs restart

    // Backup current data in case of failure
    let backup_current = storage.join(".current_backup");
    if backup_current.exists() {
        fs::remove_dir_all(&backup_current).ok();
    }
    fs::create_dir_all(&backup_current).map_err(|e| e.to_string())?;

    let current_db = db_path(&app)?;
    let images_dir = storage.join("images");
    let avatars_dir = storage.join("avatars");
    let attachments_dir = storage.join("attachments");

    // Backup current files
    if current_db.exists() {
        fs::copy(&current_db, backup_current.join("app.db")).ok();
    }
    if images_dir.exists() {
        copy_dir_all(&images_dir, &backup_current.join("images")).ok();
    }
    if avatars_dir.exists() {
        copy_dir_all(&avatars_dir, &backup_current.join("avatars")).ok();
    }
    if attachments_dir.exists() {
        copy_dir_all(&attachments_dir, &backup_current.join("attachments")).ok();
    }

    // Now replace with new data
    // Remove current directories
    if images_dir.exists() {
        fs::remove_dir_all(&images_dir).map_err(|e| e.to_string())?;
    }
    if avatars_dir.exists() {
        fs::remove_dir_all(&avatars_dir).map_err(|e| e.to_string())?;
    }
    if attachments_dir.exists() {
        fs::remove_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
    }

    // Copy new data from staging
    let staged_db = staging_dir.join("database/app.db");
    if staged_db.exists() {
        // For the database, we need to be more careful
        // Copy to a temp location first
        let temp_db = storage.join("app_new.db");
        fs::copy(&staged_db, &temp_db).map_err(|e| e.to_string())?;

        // Remove old and rename new
        if current_db.exists() {
            fs::remove_file(&current_db).map_err(|e| e.to_string())?;
        }
        // Also remove WAL and SHM files if they exist
        let wal_file = current_db.with_extension("db-wal");
        let shm_file = current_db.with_extension("db-shm");
        if wal_file.exists() {
            fs::remove_file(&wal_file).ok();
        }
        if shm_file.exists() {
            fs::remove_file(&shm_file).ok();
        }

        fs::rename(&temp_db, &current_db).map_err(|e| e.to_string())?;
        log_info(&app, "backup", "Database restored");
    }

    let staged_images = staging_dir.join("images");
    if staged_images.exists() {
        copy_dir_all(&staged_images, &images_dir)?;
        log_info(&app, "backup", "Images restored");
    }

    let staged_avatars = staging_dir.join("avatars");
    if staged_avatars.exists() {
        copy_dir_all(&staged_avatars, &avatars_dir)?;
        log_info(&app, "backup", "Avatars restored");
    }

    let staged_attachments = staging_dir.join("attachments");
    if staged_attachments.exists() {
        copy_dir_all(&staged_attachments, &attachments_dir)?;
        log_info(&app, "backup", "Attachments restored");
    }

    // Cleanup
    fs::remove_dir_all(&staging_dir).ok();
    fs::remove_dir_all(&backup_current).ok();

    log_info(&app, "backup", "Backup import complete. App restart required.");

    Ok(())
}

/// Helper to copy directory recursively
fn copy_dir_all(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let relative = path.strip_prefix(src).map_err(|e| e.to_string())?;
        let target = dst.join(relative);

        if path.is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(path, &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// List available backups in downloads directory
#[tauri::command]
pub fn backup_list() -> Result<Vec<serde_json::Value>, String> {
    let downloads = get_downloads_dir()?;
    let mut backups = Vec::new();

    if !downloads.exists() {
        return Ok(backups);
    }

    for entry in fs::read_dir(&downloads).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if let Some(ext) = path.extension() {
            if ext == "lettuce" {
                if let Ok(info) = backup_get_info(path.to_string_lossy().to_string()) {
                    let mut info_obj = info;
                    if let Some(obj) = info_obj.as_object_mut() {
                        obj.insert(
                            "path".to_string(),
                            serde_json::Value::String(path.to_string_lossy().to_string()),
                        );
                        obj.insert(
                            "filename".to_string(),
                            serde_json::Value::String(
                                path.file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default(),
                            ),
                        );
                    }
                    backups.push(info_obj);
                }
            }
        }
    }

    // Sort by creation date descending
    backups.sort_by(|a, b| {
        let a_time = a.get("createdAt").and_then(|v| v.as_u64()).unwrap_or(0);
        let b_time = b.get("createdAt").and_then(|v| v.as_u64()).unwrap_or(0);
        b_time.cmp(&a_time)
    });

    Ok(backups)
}

/// Delete a backup file
#[tauri::command]
pub fn backup_delete(backup_path: String) -> Result<(), String> {
    fs::remove_file(&backup_path).map_err(|e| format!("Failed to delete backup: {}", e))
}
