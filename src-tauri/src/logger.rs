use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub component: String,
    pub function: Option<String>,
    pub message: String,
}

pub struct LogManager {
    file: Mutex<Option<File>>,
    log_dir: PathBuf,
}

impl LogManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let log_dir = app_handle
            .path()
            .app_log_dir()
            .map_err(|e| format!("Failed to get log directory: {}", e))?;

        fs::create_dir_all(&log_dir)?;

        Ok(Self {
            file: Mutex::new(None),
            log_dir,
        })
    }

    fn get_current_log_file_path(&self) -> PathBuf {
        let now = chrono::Local::now();
        let filename = format!("app-{}.txt", now.format("%Y-%m-%d"));
        self.log_dir.join(filename)
    }

    pub fn write_log(&self, entry: LogEntry) -> Result<(), String> {
        let log_path = self.get_current_log_file_path();
        let mut file_lock = self.file.lock().map_err(|e| format!("Lock error: {}", e))?;

        // Check if we need to rotate to a new file (date changed)
        let needs_new_file = file_lock.is_none() || {
            if let Some(ref f) = *file_lock {
                // Check if current file still matches today's date
                !log_path.exists() || f.metadata().is_err()
            } else {
                true
            }
        };

        if needs_new_file {
            let new_file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .map_err(|e| format!("Failed to open log file: {}", e))?;
            *file_lock = Some(new_file);
        }

        if let Some(ref mut file) = *file_lock {
            let scope = if let Some(ref f) = entry.function {
                format!("{}/{}", entry.component, f)
            } else {
                entry.component.clone()
            };

            let log_line = format!(
                "[{}] {} {} {}\n",
                entry.timestamp, scope, entry.level, entry.message
            );

            file.write_all(log_line.as_bytes())
                .map_err(|e| format!("Failed to write log: {}", e))?;

            file.flush()
                .map_err(|e| format!("Failed to flush log: {}", e))?;
        }

        Ok(())
    }

    pub fn list_log_files(&self) -> Result<Vec<String>, String> {
        let entries = fs::read_dir(&self.log_dir)
            .map_err(|e| format!("Failed to read log directory: {}", e))?;

        let mut log_files: Vec<String> = entries
            .filter_map(|entry| {
                entry.ok().and_then(|e| {
                    let path = e.path();
                    if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("txt") {
                        path.file_name()
                            .and_then(|n| n.to_str())
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                })
            })
            .collect();

        log_files.sort_by(|a, b| b.cmp(a)); // Most recent first
        Ok(log_files)
    }

    pub fn read_log_file(&self, filename: &str) -> Result<String, String> {
        let path = self.log_dir.join(filename);

        if !path.exists() || !path.is_file() {
            return Err("Log file not found".to_string());
        }

        fs::read_to_string(path).map_err(|e| format!("Failed to read log file: {}", e))
    }

    pub fn delete_log_file(&self, filename: &str) -> Result<(), String> {
        let path = self.log_dir.join(filename);

        if !path.exists() || !path.is_file() {
            return Err("Log file not found".to_string());
        }

        fs::remove_file(path).map_err(|e| format!("Failed to delete log file: {}", e))
    }

    pub fn clear_all_logs(&self) -> Result<(), String> {
        let entries = fs::read_dir(&self.log_dir)
            .map_err(|e| format!("Failed to read log directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension() == Some("txt".as_ref()) {
                fs::remove_file(path).map_err(|e| format!("Failed to delete log file: {}", e))?;
            }
        }

        Ok(())
    }

    pub fn get_log_dir_path(&self) -> String {
        self.log_dir.to_string_lossy().to_string()
    }
}

#[tauri::command]
pub async fn log_to_file(
    app_handle: AppHandle,
    timestamp: String,
    level: String,
    component: String,
    function: Option<String>,
    message: String,
) -> Result<(), String> {
    let logger = app_handle.state::<LogManager>();

    let entry = LogEntry {
        timestamp,
        level,
        component,
        function,
        message,
    };

    logger.write_log(entry)
}

#[tauri::command]
pub async fn list_log_files(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let logger = app_handle.state::<LogManager>();
    logger.list_log_files()
}

#[tauri::command]
pub async fn read_log_file(app_handle: AppHandle, filename: String) -> Result<String, String> {
    let logger = app_handle.state::<LogManager>();
    logger.read_log_file(&filename)
}

#[tauri::command]
pub async fn delete_log_file(app_handle: AppHandle, filename: String) -> Result<(), String> {
    let logger = app_handle.state::<LogManager>();
    logger.delete_log_file(&filename)
}

#[tauri::command]
pub async fn clear_all_logs(app_handle: AppHandle) -> Result<(), String> {
    let logger = app_handle.state::<LogManager>();
    logger.clear_all_logs()
}

#[tauri::command]
pub async fn get_log_dir_path(app_handle: AppHandle) -> Result<String, String> {
    let logger = app_handle.state::<LogManager>();
    Ok(logger.get_log_dir_path())
}

#[tauri::command]
pub async fn save_log_to_downloads(
    app_handle: AppHandle,
    filename: String,
) -> Result<String, String> {
    let logger = app_handle.state::<LogManager>();
    let content = logger.read_log_file(&filename)?;

    #[cfg(target_os = "android")]
    {
        // Save to the public Downloads folder
        let download_dir = std::path::PathBuf::from("/storage/emulated/0/Download");

        if !download_dir.exists() {
            std::fs::create_dir_all(&download_dir)
                .map_err(|e| format!("Failed to create downloads directory: {}", e))?;
        }

        let file_path = download_dir.join(&filename);

        std::fs::write(&file_path, content.as_bytes())
            .map_err(|e| format!("Failed to write file: {}", e))?;

        let path_str = file_path.to_string_lossy().to_string();

        Ok(path_str)
    }

    #[cfg(not(target_os = "android"))]
    {
        let download_dir = app_handle
            .path()
            .download_dir()
            .map_err(|e| format!("Failed to get downloads directory: {}", e))?;

        if !download_dir.exists() {
            std::fs::create_dir_all(&download_dir)
                .map_err(|e| format!("Failed to create downloads directory: {}", e))?;
        }

        let file_path = download_dir.join(&filename);

        std::fs::write(&file_path, content.as_bytes())
            .map_err(|e| format!("Failed to write file: {}", e))?;

        let path_str = file_path
            .to_str()
            .ok_or_else(|| "Invalid path".to_string())?
            .to_string();

        Ok(path_str)
    }
}
