use base64::{engine::general_purpose, Engine as _};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::fs;

use super::db::{now_ms, open_db};
use super::legacy::storage_root;
use crate::utils::log_info;

/// Represents a character export package with all data and embedded media
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterExportPackage {
    /// Export format version for future compatibility
    pub version: u32,
    /// Export timestamp
    pub exported_at: i64,
    /// Character data (without provider/model references)
    pub character: CharacterExportData,
    /// Embedded avatar image as base64 (if exists)
    pub avatar_data: Option<String>,
    /// Embedded background image as base64 (if exists)
    pub background_image_data: Option<String>,
}

/// Character data for export (sanitized - no provider/model info)
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterExportData {
    /// Original character ID (will be regenerated on import)
    pub original_id: String,
    pub name: String,
    pub description: Option<String>,
    pub rules: Vec<String>,
    pub scenes: Vec<SceneExport>,
    pub default_scene_id: Option<String>,
    pub prompt_template_id: Option<String>,
    pub system_prompt: Option<String>,
    pub disable_avatar_gradient: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneExport {
    pub id: String,
    pub content: String,
    pub created_at: i64,
    pub selected_variant_id: Option<String>,
    pub variants: Vec<SceneVariantExport>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneVariantExport {
    pub id: String,
    pub content: String,
    pub created_at: i64,
}

/// Export a character to a portable JSON package
#[tauri::command]
pub fn character_export(app: tauri::AppHandle, character_id: String) -> Result<String, String> {
    log_info(
        &app,
        "character_export",
        format!("Exporting character: {}", character_id),
    );

    let conn = open_db(&app)?;

    // Read character data
    let (name, avatar_path, bg_path, description, default_scene_id, prompt_template_id, system_prompt, disable_avatar_gradient, created_at, updated_at): 
        (String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64, i64) = 
        conn.query_row(
            "SELECT name, avatar_path, background_image_path, description, default_scene_id, prompt_template_id, system_prompt, disable_avatar_gradient, created_at, updated_at FROM characters WHERE id = ?",
            params![&character_id],
            |r| Ok((
                r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get::<_, i64>(7)?, r.get(8)?, r.get(9)?
            )),
        )
        .map_err(|e| format!("Character not found: {}", e))?;

    // Read rules
    let mut rules: Vec<String> = Vec::new();
    let mut stmt = conn
        .prepare("SELECT rule FROM character_rules WHERE character_id = ? ORDER BY idx ASC")
        .map_err(|e| e.to_string())?;
    let rule_rows = stmt
        .query_map(params![&character_id], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| e.to_string())?;
    for rule in rule_rows {
        rules.push(rule.map_err(|e| e.to_string())?);
    }

    // Read scenes
    let mut scenes: Vec<SceneExport> = Vec::new();
    let mut scenes_stmt = conn
        .prepare("SELECT id, content, created_at, selected_variant_id FROM scenes WHERE character_id = ? ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let scene_rows = scenes_stmt
        .query_map(params![&character_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in scene_rows {
        let (scene_id, content, scene_created_at, selected_variant_id) =
            row.map_err(|e| e.to_string())?;

        // Read scene variants
        let mut variants: Vec<SceneVariantExport> = Vec::new();
        let mut var_stmt = conn
            .prepare("SELECT id, content, created_at FROM scene_variants WHERE scene_id = ? ORDER BY created_at ASC")
            .map_err(|e| e.to_string())?;
        let var_rows = var_stmt
            .query_map(params![&scene_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for v in var_rows {
            let (vid, vcontent, vcreated) = v.map_err(|e| e.to_string())?;
            variants.push(SceneVariantExport {
                id: vid,
                content: vcontent,
                created_at: vcreated,
            });
        }

        scenes.push(SceneExport {
            id: scene_id,
            content,
            created_at: scene_created_at,
            selected_variant_id,
            variants,
        });
    }

    // Read avatar image if exists
    let avatar_data = if let Some(ref avatar_filename) = avatar_path {
        read_avatar_as_base64(&app, &character_id, avatar_filename).ok()
    } else {
        None
    };

    // Read background image if exists
    let background_image_data = if let Some(ref bg_id) = bg_path {
        read_background_image_as_base64(&app, bg_id).ok()
    } else {
        None
    };

    // Create export package
    let export_package = CharacterExportPackage {
        version: 1,
        exported_at: now_ms() as i64,
        character: CharacterExportData {
            original_id: character_id.clone(),
            name,
            description,
            rules,
            scenes,
            default_scene_id,
            prompt_template_id,
            system_prompt,
            disable_avatar_gradient: disable_avatar_gradient != 0,
            created_at,
            updated_at,
        },
        avatar_data,
        background_image_data,
    };

    let json = serde_json::to_string_pretty(&export_package)
        .map_err(|e| format!("Failed to serialize export: {}", e))?;

    log_info(
        &app,
        "character_export",
        format!("Successfully exported character: {}", character_id),
    );

    Ok(json)
}

/// Import a character from a JSON package
#[tauri::command]
pub fn character_import(app: tauri::AppHandle, import_json: String) -> Result<String, String> {
    log_info(&app, "character_import", "Starting character import");

    let package: CharacterExportPackage = serde_json::from_str(&import_json)
        .map_err(|e| format!("Invalid import data: {}", e))?;

    // Validate version
    if package.version > 1 {
        return Err(format!(
            "Unsupported export version: {}. Please update your app.",
            package.version
        ));
    }

    let mut conn = open_db(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Generate new ID for imported character
    let new_character_id = uuid::Uuid::new_v4().to_string();
    let now = now_ms() as i64;

    log_info(
        &app,
        "character_import",
        format!("Importing as new character: {}", new_character_id),
    );

    // Save avatar if provided
    let avatar_path = if let Some(ref avatar_base64) = package.avatar_data {
        match save_avatar_from_base64(&app, &new_character_id, avatar_base64) {
            Ok(filename) => Some(filename),
            Err(e) => {
                log_info(
                    &app,
                    "character_import",
                    format!("Warning: Failed to import avatar: {}", e),
                );
                None
            }
        }
    } else {
        None
    };

    // Save background image if provided
    let background_image_path = if let Some(ref bg_base64) = package.background_image_data {
        match save_background_image_from_base64(&app, bg_base64) {
            Ok(image_id) => Some(image_id),
            Err(e) => {
                log_info(
                    &app,
                    "character_import",
                    format!("Warning: Failed to import background image: {}", e),
                );
                None
            }
        }
    } else {
        None
    };

    // Insert character
    tx.execute(
        r#"INSERT INTO characters (id, name, avatar_path, background_image_path, description, default_scene_id, default_model_id, prompt_template_id, system_prompt, disable_avatar_gradient, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)"#,
        params![
            &new_character_id,
            &package.character.name,
            avatar_path,
            background_image_path,
            package.character.description,
            package.character.prompt_template_id,
            package.character.system_prompt,
            package.character.disable_avatar_gradient as i64,
            now,
            now
        ],
    )
    .map_err(|e| format!("Failed to insert character: {}", e))?;

    // Insert rules
    for (idx, rule) in package.character.rules.iter().enumerate() {
        tx.execute(
            "INSERT INTO character_rules (character_id, idx, rule) VALUES (?, ?, ?)",
            params![&new_character_id, idx as i64, rule],
        )
        .map_err(|e| e.to_string())?;
    }

    // Map old scene IDs to new ones
    let mut scene_id_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut new_default_scene_id: Option<String> = None;

    // Insert scenes
    for (i, scene) in package.character.scenes.iter().enumerate() {
        let new_scene_id = uuid::Uuid::new_v4().to_string();
        scene_id_map.insert(scene.id.clone(), new_scene_id.clone());

        // Map old variant IDs to new ones
        let mut variant_id_map: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();

        // Insert scene variants first
        for variant in &scene.variants {
            let new_variant_id = uuid::Uuid::new_v4().to_string();
            variant_id_map.insert(variant.id.clone(), new_variant_id.clone());

            tx.execute(
                "INSERT INTO scene_variants (id, scene_id, content, created_at) VALUES (?, ?, ?, ?)",
                params![new_variant_id, &new_scene_id, &variant.content, variant.created_at],
            )
            .map_err(|e| e.to_string())?;
        }

        // Map selected variant ID
        let new_selected_variant_id = scene
            .selected_variant_id
            .as_ref()
            .and_then(|old_id| variant_id_map.get(old_id).cloned());

        tx.execute(
            "INSERT INTO scenes (id, character_id, content, created_at, selected_variant_id) VALUES (?, ?, ?, ?, ?)",
            params![
                &new_scene_id,
                &new_character_id,
                &scene.content,
                scene.created_at,
                new_selected_variant_id
            ],
        )
        .map_err(|e| e.to_string())?;

        // Set first scene as default if no default was specified
        if i == 0
            && (package.character.default_scene_id.is_none()
                || new_default_scene_id.is_none())
        {
            new_default_scene_id = Some(new_scene_id.clone());
        }

        // Map the original default scene ID
        if let Some(ref old_default) = package.character.default_scene_id {
            if old_default == &scene.id {
                new_default_scene_id = Some(new_scene_id.clone());
            }
        }
    }

    // Update default scene
    tx.execute(
        "UPDATE characters SET default_scene_id = ? WHERE id = ?",
        params![new_default_scene_id, &new_character_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    log_info(
        &app,
        "character_import",
        format!("Successfully imported character: {}", new_character_id),
    );

    // Return the new character as JSON
    let conn2 = open_db(&app)?;
    read_imported_character(&conn2, &new_character_id)
}

/// Helper: Read avatar as base64 data URL
fn read_avatar_as_base64(
    app: &tauri::AppHandle,
    character_id: &str,
    filename: &str,
) -> Result<String, String> {
    let entity_id = format!("character-{}", character_id);
    let avatar_path = storage_root(app)?
        .join("avatars")
        .join(&entity_id)
        .join(filename);

    if !avatar_path.exists() {
        return Err(format!("Avatar not found: {}", filename));
    }

    let bytes = fs::read(&avatar_path).map_err(|e| e.to_string())?;

    // Determine MIME type
    let mime_type = if filename.ends_with(".webp") {
        "image/webp"
    } else if filename.ends_with(".png") {
        "image/png"
    } else if filename.ends_with(".jpg") || filename.ends_with(".jpeg") {
        "image/jpeg"
    } else {
        "image/webp"
    };

    let base64_data = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime_type, base64_data))
}

/// Helper: Read background image as base64 data URL
fn read_background_image_as_base64(
    app: &tauri::AppHandle,
    image_id: &str,
) -> Result<String, String> {
    let images_dir = storage_root(app)?.join("images");

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

    Err(format!("Background image not found: {}", image_id))
}

/// Helper: Save avatar from base64 data URL
fn save_avatar_from_base64(
    app: &tauri::AppHandle,
    character_id: &str,
    base64_data: &str,
) -> Result<String, String> {
    let entity_id = format!("character-{}", character_id);

    // Strip data URL prefix if present
    let data = if let Some(comma_idx) = base64_data.find(',') {
        &base64_data[comma_idx + 1..]
    } else {
        base64_data
    };

    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let avatars_dir = storage_root(app)?.join("avatars").join(&entity_id);
    
    eprintln!("[DEBUG] Creating avatar directory: {:?}", avatars_dir);
    fs::create_dir_all(&avatars_dir).map_err(|e| {
        eprintln!("[ERROR] Failed to create avatar directory: {:?}", e);
        e.to_string()
    })?;

    // Convert to WebP
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

    Ok(filename.to_string())
}

/// Helper: Save background image from base64 data URL
fn save_background_image_from_base64(
    app: &tauri::AppHandle,
    base64_data: &str,
) -> Result<String, String> {
    // Strip data URL prefix if present
    let data = if let Some(comma_idx) = base64_data.find(',') {
        &base64_data[comma_idx + 1..]
    } else {
        base64_data
    };

    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let images_dir = storage_root(app)?.join("images");
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    // Detect image format
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

    let image_id = uuid::Uuid::new_v4().to_string();
    let image_path = images_dir.join(format!("{}.{}", image_id, extension));
    fs::write(&image_path, bytes).map_err(|e| e.to_string())?;

    Ok(image_id)
}

/// Helper: Read imported character and return as JSON
fn read_imported_character(
    conn: &rusqlite::Connection,
    character_id: &str,
) -> Result<String, String> {
    let (name, avatar_path, bg_path, description, default_scene_id, prompt_template_id, system_prompt, disable_avatar_gradient, created_at, updated_at): 
        (String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64, i64) = 
        conn.query_row(
            "SELECT name, avatar_path, background_image_path, description, default_scene_id, prompt_template_id, system_prompt, disable_avatar_gradient, created_at, updated_at FROM characters WHERE id = ?",
            params![character_id],
            |r| Ok((
                r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get::<_, i64>(7)?, r.get(8)?, r.get(9)?
            )),
        )
        .map_err(|e| e.to_string())?;

    // Read rules
    let mut rules: Vec<JsonValue> = Vec::new();
    let mut stmt = conn
        .prepare("SELECT rule FROM character_rules WHERE character_id = ? ORDER BY idx ASC")
        .map_err(|e| e.to_string())?;
    let rule_rows = stmt
        .query_map(params![character_id], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| e.to_string())?;
    for rule in rule_rows {
        rules.push(JsonValue::String(rule.map_err(|e| e.to_string())?));
    }

    // Read scenes
    let mut scenes: Vec<JsonValue> = Vec::new();
    let mut scenes_stmt = conn
        .prepare("SELECT id, content, created_at, selected_variant_id FROM scenes WHERE character_id = ? ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let scene_rows = scenes_stmt
        .query_map(params![character_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in scene_rows {
        let (scene_id, content, scene_created_at, selected_variant_id) =
            row.map_err(|e| e.to_string())?;

        // Read scene variants
        let mut variants: Vec<JsonValue> = Vec::new();
        let mut var_stmt = conn
            .prepare("SELECT id, content, created_at FROM scene_variants WHERE scene_id = ? ORDER BY created_at ASC")
            .map_err(|e| e.to_string())?;
        let var_rows = var_stmt
            .query_map(params![&scene_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for v in var_rows {
            let (vid, vcontent, vcreated) = v.map_err(|e| e.to_string())?;
            variants.push(serde_json::json!({"id": vid, "content": vcontent, "createdAt": vcreated}));
        }

        let mut scene_obj = JsonMap::new();
        scene_obj.insert("id".into(), JsonValue::String(scene_id));
        scene_obj.insert("content".into(), JsonValue::String(content));
        scene_obj.insert("createdAt".into(), JsonValue::from(scene_created_at));
        if !variants.is_empty() {
            scene_obj.insert("variants".into(), JsonValue::Array(variants));
        }
        if let Some(sel) = selected_variant_id {
            scene_obj.insert("selectedVariantId".into(), JsonValue::String(sel));
        }
        scenes.push(JsonValue::Object(scene_obj));
    }

    let mut root = JsonMap::new();
    root.insert("id".into(), JsonValue::String(character_id.to_string()));
    root.insert("name".into(), JsonValue::String(name));
    if let Some(a) = avatar_path {
        root.insert("avatarPath".into(), JsonValue::String(a));
    }
    if let Some(b) = bg_path {
        root.insert("backgroundImagePath".into(), JsonValue::String(b));
    }
    if let Some(d) = description {
        root.insert("description".into(), JsonValue::String(d));
    }
    root.insert("rules".into(), JsonValue::Array(rules));
    root.insert("scenes".into(), JsonValue::Array(scenes));
    if let Some(ds) = default_scene_id {
        root.insert("defaultSceneId".into(), JsonValue::String(ds));
    }
    if let Some(pt) = prompt_template_id {
        root.insert("promptTemplateId".into(), JsonValue::String(pt));
    }
    if let Some(sp) = system_prompt {
        root.insert("systemPrompt".into(), JsonValue::String(sp));
    }
    root.insert(
        "disableAvatarGradient".into(),
        JsonValue::Bool(disable_avatar_gradient != 0),
    );
    root.insert("createdAt".into(), JsonValue::from(created_at));
    root.insert("updatedAt".into(), JsonValue::from(updated_at));

    serde_json::to_string(&JsonValue::Object(root)).map_err(|e| e.to_string())
}
