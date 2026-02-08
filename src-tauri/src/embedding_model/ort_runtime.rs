use super::*;
use crate::utils::log_info;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

pub(super) async fn ensure_ort_init(app: &AppHandle) -> Result<(), String> {
    if ORT_INITIALIZED.load(Ordering::Acquire) {
        return Ok(());
    }

    #[cfg(target_os = "android")]
    {
        if let Err(err) = ort::util::preload_dylib("libonnxruntime.so") {
            return Err(crate::utils::err_msg(
                module_path!(),
                line!(),
                format!(
                    "Failed to preload Android ONNX Runtime (libonnxruntime.so): {}",
                    err
                ),
            ));
        }
    }

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

    let init_result = std::panic::catch_unwind(|| {
        #[cfg(target_os = "android")]
        {
            ort::init_from("libonnxruntime.so")
                .with_name("lettuce-embedding")
                .commit()
        }
        #[cfg(not(target_os = "android"))]
        {
            ort::init().with_name("lettuce-embedding").commit()
        }
    })
    .map_err(|panic_payload| {
        let panic_msg = panic_payload_to_string(&*panic_payload);
        crate::utils::log_error(
            app,
            "embedding_debug",
            format!("ONNX Runtime init panic detail: {}", panic_msg),
        );
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("ONNX Runtime initialization panicked: {}", panic_msg),
        )
    })?;

    let init_ok = init_result.into_init_result().map_err(|err| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to initialize ONNX Runtime: {}", err),
        )
    })?;

    if !init_ok {
        log_info(
            app,
            "embedding_debug",
            "ONNX Runtime already initialized; continuing",
        );
    }

    ORT_INITIALIZED.store(true, Ordering::Release);
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

    let download_info = ort_download_info()?;
    let dest_path = ort_dir.join(download_info.lib_name);
    if dest_path.exists() {
        if cfg!(target_os = "windows") {
            let shared = ort_dir.join("onnxruntime_providers_shared.dll");
            if shared.exists() {
                return Ok(dest_path);
            }
        } else {
            return Ok(dest_path);
        }
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&download_info.archive_url)
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

    extract_onnxruntime_archive(&download_info, &bytes, &dest_path, &ort_dir)?;

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
struct OrtDownloadInfo {
    archive_url: String,
    lib_path_in_archive: String,
    lib_name: &'static str,
    lib_dir_in_archive: Option<String>,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn ort_download_info() -> Result<OrtDownloadInfo, String> {
    let (os, arch) = (std::env::consts::OS, std::env::consts::ARCH);
    match (os, arch) {
        ("windows", "x86_64") => Ok(OrtDownloadInfo {
            archive_url: format!(
                "https://github.com/microsoft/onnxruntime/releases/download/v{0}/onnxruntime-win-x64-{0}.zip",
                ORT_VERSION
            ),
            lib_path_in_archive: format!("onnxruntime-win-x64-{}/lib/onnxruntime.dll", ORT_VERSION),
            lib_name: "onnxruntime.dll",
            lib_dir_in_archive: Some(format!("onnxruntime-win-x64-{}/lib/", ORT_VERSION)),
        }),
        ("linux", "x86_64") => Ok(OrtDownloadInfo {
            archive_url: format!(
                "https://github.com/microsoft/onnxruntime/releases/download/v{0}/onnxruntime-linux-x64-{0}.tgz",
                ORT_VERSION
            ),
            lib_path_in_archive: format!(
                "onnxruntime-linux-x64-{}/lib/libonnxruntime.so.{}",
                ORT_VERSION, ORT_VERSION
            ),
            lib_name: "libonnxruntime.so",
            lib_dir_in_archive: None,
        }),
        ("macos", "aarch64") => Ok(OrtDownloadInfo {
            archive_url: format!(
                "https://github.com/microsoft/onnxruntime/releases/download/v{0}/onnxruntime-osx-arm64-{0}.tgz",
                ORT_VERSION
            ),
            lib_path_in_archive: format!(
                "onnxruntime-osx-arm64-{}/lib/libonnxruntime.dylib",
                ORT_VERSION
            ),
            lib_name: "libonnxruntime.dylib",
            lib_dir_in_archive: None,
        }),
        ("macos", "x86_64") => Ok(OrtDownloadInfo {
            archive_url: format!(
                "https://github.com/microsoft/onnxruntime/releases/download/v{0}/onnxruntime-osx-x86_64-{0}.tgz",
                ORT_VERSION
            ),
            lib_path_in_archive: format!(
                "onnxruntime-osx-x86_64-{}/lib/libonnxruntime.dylib",
                ORT_VERSION
            ),
            lib_name: "libonnxruntime.dylib",
            lib_dir_in_archive: None,
        }),
        _ => Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Unsupported platform for ONNX Runtime: {} {}", os, arch),
        )),
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn extract_onnxruntime_archive(
    download_info: &OrtDownloadInfo,
    bytes: &[u8],
    dest_path: &Path,
    ort_dir: &Path,
) -> Result<(), String> {
    let reader = Cursor::new(bytes);
    if download_info.archive_url.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(reader)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        if let Some(prefix) = download_info.lib_dir_in_archive.as_deref() {
            for index in 0..zip.len() {
                let mut file = zip
                    .by_index(index)
                    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
                let name = file.name().to_string();
                if !name.starts_with(prefix) || !name.ends_with(".dll") {
                    continue;
                }
                let filename = Path::new(&name)
                    .file_name()
                    .ok_or_else(|| {
                        crate::utils::err_msg(
                            module_path!(),
                            line!(),
                            format!("Invalid ONNX Runtime entry: {}", name),
                        )
                    })?
                    .to_string_lossy()
                    .to_string();
                let out_path = ort_dir.join(filename);
                let mut outfile = fs::File::create(&out_path)
                    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
            }
        } else {
            let mut file = zip
                .by_name(&download_info.lib_path_in_archive)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
            let mut outfile = fs::File::create(dest_path)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        }
        return Ok(());
    }

    if download_info.archive_url.ends_with(".tgz") {
        let tar = flate2::read::GzDecoder::new(reader);
        let mut archive = tar::Archive::new(tar);
        for entry in archive
            .entries()
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?
        {
            let mut entry =
                entry.map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
            let path = entry
                .path()
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?
                .to_string_lossy()
                .into_owned();
            if path == download_info.lib_path_in_archive {
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
            format!(
                "Could not find {} in archive",
                download_info.lib_path_in_archive
            ),
        ));
    }

    Err(crate::utils::err_msg(
        module_path!(),
        line!(),
        format!("Unsupported archive type: {}", download_info.archive_url),
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
