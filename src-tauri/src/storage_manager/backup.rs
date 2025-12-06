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
use tauri::Manager;
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

    // Prepare encryption if password provided
    let encryption = if let Some(ref pwd) = password {
        let mut salt = [0u8; 16];
        let mut nonce = [0u8; 24];
        OsRng.fill_bytes(&mut salt);
        OsRng.fill_bytes(&mut nonce);
        let key = derive_key_from_password(pwd, &salt);
        Some((salt, nonce, key))
    } else {
        None
    };

    // Create the zip file
    let file = File::create(&output_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    // Add database to zip (encrypted if password provided)
    let db_bytes = fs::read(&temp_db).map_err(|e| e.to_string())?;
    if let Some((_, nonce, key)) = &encryption {
        let encrypted_db = encrypt_data(&db_bytes, key, nonce)?;
        zip.start_file("database/app.db.enc", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&encrypted_db).map_err(|e| e.to_string())?;
    } else {
        zip.start_file("database/app.db", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&db_bytes).map_err(|e| e.to_string())?;
    }

    log_info(&app, "backup", "Added database to archive");

    // Add images directory
    if images_dir.exists() {
        add_directory_to_zip(
            &mut zip,
            &images_dir,
            "images",
            options,
            encryption.as_ref(),
        )?;
        log_info(&app, "backup", "Added images to archive");
    }

    // Add avatars directory
    if avatars_dir.exists() {
        add_directory_to_zip(
            &mut zip,
            &avatars_dir,
            "avatars",
            options,
            encryption.as_ref(),
        )?;
        log_info(&app, "backup", "Added avatars to archive");
    }

    // Add attachments directory
    if attachments_dir.exists() {
        add_directory_to_zip(
            &mut zip,
            &attachments_dir,
            "attachments",
            options,
            encryption.as_ref(),
        )?;
        log_info(&app, "backup", "Added attachments to archive");
    }

    // Create manifest
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let app_version = app.package_info().version.to_string();

    let manifest = if let Some((salt, nonce, key)) = &encryption {
        // Create encrypted marker to verify password on import
        let marker = b"LETTUCE_BACKUP_VERIFIED";
        let encrypted_marker = encrypt_data(marker, key, nonce)?;

        // Add encrypted marker
        zip.start_file("encrypted_marker.bin", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&encrypted_marker)
            .map_err(|e| e.to_string())?;

        BackupManifest {
            version: BACKUP_VERSION,
            created_at: now,
            app_version,
            encrypted: true,
            salt: Some(general_purpose::STANDARD.encode(salt)),
            nonce: Some(general_purpose::STANDARD.encode(nonce)),
        }
    } else {
        BackupManifest {
            version: BACKUP_VERSION,
            created_at: now,
            app_version,
            encrypted: false,
            salt: None,
            nonce: None,
        }
    };

    // Add manifest
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    zip.start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| e.to_string())?;

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

/// Helper to add a directory recursively to zip (with optional encryption)
fn add_directory_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    dir: &PathBuf,
    prefix: &str,
    options: SimpleFileOptions,
    encryption: Option<&([u8; 16], [u8; 24], [u8; 32])>,
) -> Result<(), String> {
    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            let relative = path
                .strip_prefix(dir)
                .map_err(|e| e.to_string())?
                .to_string_lossy();

            let bytes = fs::read(path).map_err(|e| e.to_string())?;

            if let Some((_, nonce, key)) = encryption {
                // Encrypt the file content
                let encrypted = encrypt_data(&bytes, key, nonce)?;
                let zip_path = format!("{}/{}.enc", prefix, relative);
                zip.start_file(&zip_path, options)
                    .map_err(|e| e.to_string())?;
                zip.write_all(&encrypted).map_err(|e| e.to_string())?;
            } else {
                let zip_path = format!("{}/{}", prefix, relative);
                zip.start_file(&zip_path, options)
                    .map_err(|e| e.to_string())?;
                zip.write_all(&bytes).map_err(|e| e.to_string())?;
            }
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

    // Prepare encryption params if encrypted
    let encryption_params: Option<([u8; 32], [u8; 24])> = if manifest.encrypted {
        let pwd = password
            .as_ref()
            .ok_or_else(|| "Password required for encrypted backup".to_string())?;

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

        // Verify marker BEFORE proceeding - this validates the password
        let file = File::open(&backup_path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

        let mut marker_file = archive
            .by_name("encrypted_marker.bin")
            .map_err(|e| format!("Invalid backup: missing encryption marker: {}", e))?;

        let mut encrypted_marker = Vec::new();
        marker_file
            .read_to_end(&mut encrypted_marker)
            .map_err(|e| e.to_string())?;

        let decrypted = decrypt_data(&encrypted_marker, &key, &nonce)
            .map_err(|_| "Invalid password - decryption failed".to_string())?;

        if decrypted != b"LETTUCE_BACKUP_VERIFIED" {
            return Err("Invalid password - verification marker mismatch".to_string());
        }

        log_info(&app, "backup", "Password verified successfully");
        Some((key, nonce))
    } else {
        None
    };

    // Now extract the archive
    let file = File::open(&backup_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Create a staging directory
    let staging_dir = storage.join(".import_staging");
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&staging_dir).map_err(|e| e.to_string())?;

    log_info(&app, "backup", "Extracting and decrypting backup files...");

    // Extract all files to staging, decrypting as needed
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let file_name = file.name().to_string();

        // Skip manifest and marker
        if file_name == "manifest.json" || file_name == "encrypted_marker.bin" {
            continue;
        }

        if file.is_dir() {
            let outpath = staging_dir.join(&file_name);
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            // Read file contents
            let mut contents = Vec::new();
            file.read_to_end(&mut contents).map_err(|e| e.to_string())?;

            // Determine output path and whether to decrypt
            // In version 1 backups, only the marker was encrypted, not the actual files
            // In version 2+, encrypted files have .enc extension
            let (outpath, final_contents) = if let Some((ref key, ref nonce)) = encryption_params {
                // Only decrypt files with .enc extension
                // This supports version 1 backups where files weren't encrypted
                if file_name.ends_with(".enc") {
                    let decrypted = decrypt_data(&contents, key, nonce)
                        .map_err(|e| format!("Failed to decrypt {}: {}", file_name, e))?;

                    // Strip .enc extension from filename
                    let out_name = file_name[..file_name.len() - 4].to_string();
                    (staging_dir.join(out_name), decrypted)
                } else {
                    // File without .enc extension - use as-is (version 1 format)
                    (staging_dir.join(&file_name), contents)
                }
            } else {
                // Unencrypted backup - use as-is
                (staging_dir.join(&file_name), contents)
            };

            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            outfile
                .write_all(&final_contents)
                .map_err(|e| e.to_string())?;
        }
    }

    log_info(&app, "backup", "Extraction complete. Applying backup...");

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

    // Copy new data from staging - database is at database/app.db (or decrypted from app.db.enc)
    let staged_db = staging_dir.join("database/app.db");
    if staged_db.exists() {
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

    super::db::reload_database(&app)?;

    log_info(&app, "backup", "Backup import complete!");

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
pub fn backup_list(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let downloads = get_downloads_dir()?;
    let mut backups = Vec::new();

    log_info(
        &app,
        "backup",
        format!("Looking for backups in: {:?}", downloads),
    );

    if !downloads.exists() {
        log_info(
            &app,
            "backup",
            format!("Downloads directory does not exist: {:?}", downloads),
        );
        return Ok(backups);
    }

    let read_result = fs::read_dir(&downloads);
    match &read_result {
        Ok(_) => log_info(
            &app,
            "backup",
            "Successfully opened downloads directory".to_string(),
        ),
        Err(e) => log_info(
            &app,
            "backup",
            format!("Failed to read downloads directory: {}", e),
        ),
    }

    for entry in read_result.map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        log_info(&app, "backup", format!("Found file: {:?}", path));

        if let Some(ext) = path.extension() {
            if ext == "lettuce" {
                log_info(&app, "backup", format!("Found .lettuce backup: {:?}", path));
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

    log_info(
        &app,
        "backup",
        format!("Found {} backups total", backups.len()),
    );

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

/// Get backup info from bytes (for Android content URI support)
#[tauri::command]
pub fn backup_get_info_from_bytes(data: Vec<u8>) -> Result<serde_json::Value, String> {
    let cursor = std::io::Cursor::new(data);
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| format!("Failed to read backup archive: {}", e))?;

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
    let mut total_files = 0;
    let mut image_count = 0;
    let mut avatar_count = 0;
    let mut attachment_count = 0;

    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            let name = file.name();
            if !file.is_dir() {
                total_files += 1;
                if name.starts_with("images/") {
                    image_count += 1;
                } else if name.starts_with("avatars/") {
                    avatar_count += 1;
                } else if name.starts_with("attachments/") {
                    attachment_count += 1;
                }
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

/// Check if backup is encrypted from bytes
#[tauri::command]
pub fn backup_check_encrypted_from_bytes(data: Vec<u8>) -> Result<bool, String> {
    let cursor = std::io::Cursor::new(data);
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| format!("Failed to read backup archive: {}", e))?;

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

/// Verify password for backup from bytes
#[tauri::command]
pub fn backup_verify_password_from_bytes(data: Vec<u8>, password: String) -> Result<bool, String> {
    let cursor = std::io::Cursor::new(data);
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| format!("Failed to read backup archive: {}", e))?;

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
        return Ok(true);
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

/// Import backup from bytes (for Android content URI support)
#[tauri::command]
pub async fn backup_import_from_bytes(
    app: tauri::AppHandle,
    data: Vec<u8>,
    password: Option<String>,
) -> Result<(), String> {
    let storage = storage_root(&app)?;

    log_info(&app, "backup", "Starting backup import from bytes...");

    // Read manifest
    let manifest: BackupManifest = {
        let cursor = std::io::Cursor::new(&data);
        let mut archive =
            ZipArchive::new(cursor).map_err(|e| format!("Failed to read backup archive: {}", e))?;

        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|e| format!("Invalid backup: missing manifest: {}", e))?;

        let mut manifest_str = String::new();
        manifest_file
            .read_to_string(&mut manifest_str)
            .map_err(|e| e.to_string())?;

        serde_json::from_str(&manifest_str).map_err(|e| format!("Invalid manifest: {}", e))?
    };

    // Prepare encryption params if encrypted
    let encryption_params: Option<([u8; 32], [u8; 24])> = if manifest.encrypted {
        let pwd = password
            .as_ref()
            .ok_or_else(|| "Password required for encrypted backup".to_string())?;

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

        // Verify marker BEFORE proceeding - this validates the password
        let cursor = std::io::Cursor::new(&data);
        let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

        let mut marker_file = archive
            .by_name("encrypted_marker.bin")
            .map_err(|e| format!("Invalid backup: missing encryption marker: {}", e))?;

        let mut encrypted_marker = Vec::new();
        marker_file
            .read_to_end(&mut encrypted_marker)
            .map_err(|e| e.to_string())?;

        let decrypted = decrypt_data(&encrypted_marker, &key, &nonce)
            .map_err(|_| "Invalid password - decryption failed".to_string())?;

        if decrypted != b"LETTUCE_BACKUP_VERIFIED" {
            return Err("Invalid password - verification marker mismatch".to_string());
        }

        log_info(&app, "backup", "Password verified successfully");
        Some((key, nonce))
    } else {
        None
    };

    // Create a staging directory
    let staging_dir = storage.join(".import_staging");
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&staging_dir).map_err(|e| e.to_string())?;

    log_info(&app, "backup", "Extracting and decrypting backup files...");

    // Extract all files to staging, decrypting as needed
    let cursor = std::io::Cursor::new(&data);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let file_name = file.name().to_string();

        // Skip manifest and marker
        if file_name == "manifest.json" || file_name == "encrypted_marker.bin" {
            continue;
        }

        if file.is_dir() {
            let outpath = staging_dir.join(&file_name);
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            // Read file contents
            let mut contents = Vec::new();
            file.read_to_end(&mut contents).map_err(|e| e.to_string())?;

            // Determine output path and whether to decrypt
            // In version 1 backups, only the marker was encrypted, not the actual files
            // In version 2+, encrypted files have .enc extension
            let (outpath, final_contents) = if let Some((ref key, ref nonce)) = encryption_params {
                // Only decrypt files with .enc extension
                // This supports version 1 backups where files weren't encrypted
                if file_name.ends_with(".enc") {
                    let decrypted = decrypt_data(&contents, key, nonce)
                        .map_err(|e| format!("Failed to decrypt {}: {}", file_name, e))?;

                    // Strip .enc extension from filename
                    let out_name = file_name[..file_name.len() - 4].to_string();
                    (staging_dir.join(out_name), decrypted)
                } else {
                    // File without .enc extension - use as-is (version 1 format)
                    (staging_dir.join(&file_name), contents)
                }
            } else {
                // Unencrypted backup - use as-is
                (staging_dir.join(&file_name), contents)
            };

            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            outfile
                .write_all(&final_contents)
                .map_err(|e| e.to_string())?;
        }
    }

    log_info(&app, "backup", "Extraction complete. Applying backup...");

    // Apply the backup - database is at database/app.db (decrypted from app.db.enc if encrypted)
    let staging_db = staging_dir.join("database/app.db");
    let target_db = db_path(&app)?;

    log_info(
        &app,
        "backup",
        format!(
            "Staging DB: {:?} (exists: {})",
            staging_db,
            staging_db.exists()
        ),
    );

    if staging_db.exists() {
        log_info(&app, "backup", "Restoring database...");

        // Get the staging DB size for logging
        if let Ok(metadata) = fs::metadata(&staging_db) {
            log_info(
                &app,
                "backup",
                format!("Staging DB size: {} bytes", metadata.len()),
            );
        }

        // Delete the existing database files first
        if target_db.exists() {
            fs::remove_file(&target_db)
                .map_err(|e| format!("Failed to remove old database: {}", e))?;
        }
        let wal = target_db.with_extension("db-wal");
        if wal.exists() {
            let _ = fs::remove_file(&wal);
        }
        let shm = target_db.with_extension("db-shm");
        if shm.exists() {
            let _ = fs::remove_file(&shm);
        }

        // Copy the staging database to the target location
        fs::copy(&staging_db, &target_db).map_err(|e| format!("Failed to copy database: {}", e))?;

        log_info(
            &app,
            "backup",
            format!("Database restored to {:?}", target_db),
        );
    } else {
        log_info(
            &app,
            "backup",
            "WARNING: No database found in backup staging area!",
        );
    }

    // Copy images, avatars, attachments
    for dir_name in &["images", "avatars", "attachments"] {
        let staging_subdir = staging_dir.join(dir_name);
        let target_subdir = storage.join(dir_name);

        if staging_subdir.exists() {
            log_info(&app, "backup", format!("Restoring {}...", dir_name));
            fs::create_dir_all(&target_subdir).map_err(|e| e.to_string())?;

            for entry in WalkDir::new(&staging_subdir)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if path.is_file() {
                    let relative = path
                        .strip_prefix(&staging_subdir)
                        .map_err(|e| e.to_string())?;
                    let target_path = target_subdir.join(relative);

                    if let Some(parent) = target_path.parent() {
                        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }

                    fs::copy(path, &target_path).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // Cleanup staging
    fs::remove_dir_all(&staging_dir).ok();

    // Hot-reload the database pool to use the new database
    super::db::reload_database(&app)?;

    log_info(&app, "backup", "Backup import complete!");

    Ok(())
}

/// Check if a backup contains characters with dynamic memory enabled
#[tauri::command]
pub async fn backup_check_dynamic_memory(
    app: tauri::AppHandle,
    backup_path: String,
    password: Option<String>,
) -> Result<bool, String> {
    use crate::utils::log_info;
    
    log_info(&app, "backup_check_dynamic_memory", format!("Checking backup at: {}", backup_path));
    
    let file = File::open(&backup_path).map_err(|e| format!("Failed to open backup: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read backup archive: {}", e))?;

    // Read manifest to check if encrypted
    let manifest: BackupManifest = {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|e| format!("Invalid backup: missing manifest: {}", e))?;

        let mut manifest_str = String::new();
        manifest_file
            .read_to_string(&mut manifest_str)
            .map_err(|e| e.to_string())?;

        serde_json::from_str(&manifest_str).map_err(|e| format!("Invalid manifest: {}", e))?
    };

    log_info(&app, "backup_check_dynamic_memory", format!("Manifest encrypted: {}", manifest.encrypted));

    // Prepare encryption params if needed
    let encryption_params: Option<([u8; 32], [u8; 24])> = if manifest.encrypted {
        let pwd = password
            .as_ref()
            .ok_or_else(|| "Password required for encrypted backup".to_string())?;

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
        Some((key, nonce))
    } else {
        None
    };

    // Read the database file - path depends on encryption
    let db_path = if manifest.encrypted {
        "database/app.db.enc"
    } else {
        "database/app.db"
    };
    
    log_info(&app, "backup_check_dynamic_memory", format!("Looking for database at: {}", db_path));
    
    let mut db_file = archive
        .by_name(db_path)
        .map_err(|e| format!("Invalid backup: missing database at {}: {}", db_path, e))?;

    let mut db_data = Vec::new();
    db_file.read_to_end(&mut db_data).map_err(|e| e.to_string())?;

    log_info(&app, "backup_check_dynamic_memory", format!("Read {} bytes of database", db_data.len()));

    // Decrypt if needed
    let final_db_data = if let Some((key, nonce)) = encryption_params {
        log_info(&app, "backup_check_dynamic_memory", "Decrypting database...".to_string());
        decrypt_data(&db_data, &key, &nonce)?
    } else {
        db_data
    };

    // Write to a temporary file to query it
    let temp_db = app.path().app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("temp_backup_check.db");

    fs::write(&temp_db, &final_db_data).map_err(|e| e.to_string())?;

    // Query for characters with dynamic memory
    let result = (|| -> Result<bool, String> {
        let conn = Connection::open(&temp_db).map_err(|e| e.to_string())?;
        
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM characters WHERE memory_type = 'dynamic'")
            .map_err(|e| e.to_string())?;
        
        let count: i64 = stmt
            .query_row([], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        
        log_info(&app, "backup_check_dynamic_memory", format!("Found {} characters with dynamic memory", count));
        
        Ok(count > 0)
    })();

    // Clean up temp file
    fs::remove_file(&temp_db).ok();

    log_info(&app, "backup_check_dynamic_memory", format!("Result: {:?}", result));
    result
}

/// Check if a backup (from bytes) contains characters with dynamic memory enabled
#[tauri::command]
pub async fn backup_check_dynamic_memory_from_bytes(
    app: tauri::AppHandle,
    data: Vec<u8>,
    password: Option<String>,
) -> Result<bool, String> {
    use crate::utils::log_info;
    use std::io::Cursor;
    
    log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Checking backup from bytes ({} bytes)", data.len()));

    let cursor = Cursor::new(data);
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| {
            log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Failed to read archive: {}", e));
            format!("Failed to read backup archive: {}", e)
        })?;

    log_info(&app, "backup_check_dynamic_memory_from_bytes", "Successfully opened archive".to_string());

    // Read manifest to check if encrypted
    let manifest: BackupManifest = {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|e| {
                log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Failed to read manifest: {}", e));
                format!("Invalid backup: missing manifest: {}", e)
            })?;

        let mut manifest_str = String::new();
        manifest_file
            .read_to_string(&mut manifest_str)
            .map_err(|e| e.to_string())?;

        serde_json::from_str(&manifest_str).map_err(|e| format!("Invalid manifest: {}", e))?
    };

    log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Manifest encrypted: {}", manifest.encrypted));

    // Prepare encryption params if needed
    let encryption_params: Option<([u8; 32], [u8; 24])> = if manifest.encrypted {
        let pwd = password
            .as_ref()
            .ok_or_else(|| "Password required for encrypted backup".to_string())?;

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
        Some((key, nonce))
    } else {
        None
    };

    // Read the database file - path depends on encryption
    let db_path = if manifest.encrypted {
        "database/app.db.enc"
    } else {
        "database/app.db"
    };
    
    log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Looking for database at: {}", db_path));
    
    let mut db_file = archive
        .by_name(db_path)
        .map_err(|e| {
            log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Failed to find database at {}: {}", db_path, e));
            format!("Invalid backup: missing database at {}: {}", db_path, e)
        })?;

    let mut db_data = Vec::new();
    db_file.read_to_end(&mut db_data).map_err(|e| e.to_string())?;

    log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Read {} bytes of database", db_data.len()));

    // Decrypt if needed
    let final_db_data = if let Some((key, nonce)) = encryption_params {
        log_info(&app, "backup_check_dynamic_memory_from_bytes", "Decrypting database...".to_string());
        decrypt_data(&db_data, &key, &nonce)?
    } else {
        db_data
    };

    // Write to a temporary file to query it
    let temp_db = app.path().app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("temp_backup_check.db");

    fs::write(&temp_db, &final_db_data).map_err(|e| e.to_string())?;

    // Query for characters with dynamic memory
    let result = (|| -> Result<bool, String> {
        let conn = Connection::open(&temp_db).map_err(|e| e.to_string())?;
        
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM characters WHERE memory_type = 'dynamic'")
            .map_err(|e| {
                log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Failed to prepare statement: {}", e));
                e.to_string()
            })?;
        
        let count: i64 = stmt
            .query_row([], |row| row.get(0))
            .map_err(|e| {
                log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Failed to execute query: {}", e));
                e.to_string()
            })?;
        
        log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Found {} characters with dynamic memory", count));
        
        Ok(count > 0)
    })();

    // Clean up temp file
    fs::remove_file(&temp_db).ok();

    log_info(&app, "backup_check_dynamic_memory_from_bytes", format!("Final result: {:?}", result));
    result
}

/// Disable dynamic memory for all characters
/// This is called after importing a backup when the user doesn't want to download the embedding model
#[tauri::command]
pub async fn backup_disable_dynamic_memory(app: tauri::AppHandle) -> Result<(), String> {
    log_info(&app, "backup", "Disabling dynamic memory for all characters...");
    
    let conn = open_db(&app)?;
    
    // Update all characters to use manual memory
    conn.execute(
        "UPDATE characters SET memory_type = 'manual' WHERE memory_type = 'dynamic'",
        [],
    )
    .map_err(|e| {
        log_info(&app, "backup", format!("Failed to disable dynamic memory: {}", e));
        e.to_string()
    })?;
    
    let affected = conn.changes();
    
    log_info(&app, "backup", format!("Updated {} characters to manual memory", affected));
    
    // Reload database to ensure frontend gets updated data
    super::db::reload_database(&app)?;
    
    Ok(())
}
