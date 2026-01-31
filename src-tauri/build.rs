use std::env;
use std::fs;
use std::io::{self, Cursor};
use std::path::PathBuf;

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").map_or(false, |s| s == "android") {
        println!("cargo:warning=Detected Android build, checking ONNX Runtime libraries...");
        setup_android_libs().expect("Failed to setup Android libraries");
    } else {
        println!("cargo:warning=Detected Desktop build, checking ONNX Runtime libraries...");
        setup_desktop_libs().expect("Failed to setup Desktop libraries");
    }

    tauri_build::build();
}

fn setup_desktop_libs() -> anyhow::Result<()> {
    let target_os = env::var("CARGO_CFG_TARGET_OS")?;
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH")?;
    let out_dir = PathBuf::from(env::var("OUT_DIR")?);
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);

    let target_dir = out_dir
        .ancestors()
        .nth(3)
        .ok_or_else(|| anyhow::anyhow!("Failed to determine target directory"))?;

    let ort_version = "1.22.0";

    let (archive_url, _lib_name, lib_path_in_archive) = match (target_os.as_str(), target_arch.as_str()) {
        ("linux", "x86_64") => (
            format!("https://github.com/microsoft/onnxruntime/releases/download/v{}/onnxruntime-linux-x64-{}.tgz", ort_version, ort_version),
            "libonnxruntime.so",
            format!("onnxruntime-linux-x64-{}/lib/libonnxruntime.so.{}", ort_version, ort_version)
        ),
        ("windows", "x86_64") => (
            format!("https://github.com/microsoft/onnxruntime/releases/download/v{}/onnxruntime-win-x64-{}.zip", ort_version, ort_version),
            "onnxruntime.dll",
            format!("onnxruntime-win-x64-{}/lib/onnxruntime.dll", ort_version)
        ),
        ("macos", "aarch64") => (
            format!("https://github.com/microsoft/onnxruntime/releases/download/v{}/onnxruntime-osx-arm64-{}.tgz", ort_version, ort_version),
            "libonnxruntime.dylib",
            format!("onnxruntime-osx-arm64-{}/lib/libonnxruntime.dylib", ort_version)
        ),
        ("macos", "x86_64") => (
            format!("https://github.com/microsoft/onnxruntime/releases/download/v{}/onnxruntime-osx-x86_64-{}.tgz", ort_version, ort_version),
            "libonnxruntime.dylib",
            format!("onnxruntime-osx-x86_64-{}/lib/libonnxruntime.dylib", ort_version)
        ),
        _ => {
            println!("cargo:warning=Unsupported desktop platform: {} {}, skipping ONNX Runtime download.", target_os, target_arch);
            return Ok(());
        }
    };

    let simple_lib_name = if target_os == "windows" {
        "onnxruntime.dll"
    } else if target_os == "macos" {
        "libonnxruntime.dylib"
    } else {
        "libonnxruntime.so"
    };
    let dest_path = target_dir.join(simple_lib_name);
    let resource_dir = manifest_dir.join("onnxruntime");
    let resource_path = resource_dir.join(simple_lib_name);

    if dest_path.exists() {
        if resource_path.exists() {
            println!(
                "cargo:warning=ONNX Runtime library already exists at {:?} and {:?}",
                dest_path, resource_path
            );
            return Ok(());
        }

        fs::create_dir_all(&resource_dir)?;
        fs::copy(&dest_path, &resource_path)?;
        println!(
            "cargo:warning=Copied ONNX Runtime library to {:?}",
            resource_path
        );
        return Ok(());
    }

    println!(
        "cargo:warning=Downloading ONNX Runtime v{} from {}...",
        ort_version, archive_url
    );

    let response = reqwest::blocking::get(&archive_url)?;
    if !response.status().is_success() {
        return Err(anyhow::anyhow!(
            "Failed to download ONNX Runtime: {}",
            response.status()
        ));
    }

    let content = response.bytes()?;
    let reader = Cursor::new(content);

    if archive_url.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(reader)?;
        let mut file = zip.by_name(&lib_path_in_archive)?;
        let mut outfile = fs::File::create(&dest_path)?;
        io::copy(&mut file, &mut outfile)?;
    } else if archive_url.ends_with(".tgz") {
        let tar = flate2::read::GzDecoder::new(reader);
        let mut archive = tar::Archive::new(tar);

        let mut found = false;
        for entry in archive.entries()? {
            let mut entry = entry?;
            let path = entry.path()?.to_string_lossy().into_owned();

            if path.contains("libonnxruntime")
                && (path.ends_with(".so")
                    || path.ends_with(".so.1.22.0")
                    || path.ends_with(".dylib")
                    || path.ends_with(".dll"))
            {
                if path == lib_path_in_archive {
                    let mut outfile = fs::File::create(&dest_path)?;
                    io::copy(&mut entry, &mut outfile)?;
                    found = true;
                    break;
                }
            }
        }

        if !found {
            return Err(anyhow::anyhow!(
                "Could not find {} in archive",
                lib_path_in_archive
            ));
        }
    }

    println!(
        "cargo:warning=Extracted ONNX Runtime library to {:?}",
        dest_path
    );

    fs::create_dir_all(&resource_dir)?;
    fs::copy(&dest_path, &resource_path)?;
    println!(
        "cargo:warning=Copied ONNX Runtime library to {:?}",
        resource_path
    );

    Ok(())
}

fn setup_android_libs() -> anyhow::Result<()> {
    let ort_version = "1.22.0";
    let jni_libs_path = PathBuf::from("gen/android/app/src/main/jniLibs");

    let targets = vec![
        ("arm64-v8a", "jni/arm64-v8a/libonnxruntime.so"),
        ("x86_64", "jni/x86_64/libonnxruntime.so"),
    ];

    let mut missing = false;
    for (arch, _) in &targets {
        let lib_path = jni_libs_path.join(arch).join("libonnxruntime.so");
        if !lib_path.exists() {
            missing = true;
            break;
        }
    }

    if !missing {
        println!("cargo:warning=ONNX Runtime libs already present.");
        return Ok(());
    }

    println!(
        "cargo:warning=Downloading ONNX Runtime Android v{}...",
        ort_version
    );
    let url = format!(
        "https://repo1.maven.org/maven2/com/microsoft/onnxruntime/onnxruntime-android/{0}/onnxruntime-android-{0}.aar",
        ort_version
    );

    let response = reqwest::blocking::get(&url)?.bytes()?;
    let reader = Cursor::new(response);
    let mut zip = zip::ZipArchive::new(reader)?;

    for (arch, internal_path) in targets {
        let dest_dir = jni_libs_path.join(arch);
        fs::create_dir_all(&dest_dir)?;

        let dest_file = dest_dir.join("libonnxruntime.so");

        match zip.by_name(internal_path) {
            Ok(mut file) => {
                let mut outfile = fs::File::create(&dest_file)?;
                io::copy(&mut file, &mut outfile)?;
                println!("cargo:warning=Extracted: {:?}", dest_file);
            }
            Err(_) => {
                println!(
                    "cargo:warning=Could not find {} in AAR, skipping...",
                    internal_path
                );
            }
        }
    }

    Ok(())
}
