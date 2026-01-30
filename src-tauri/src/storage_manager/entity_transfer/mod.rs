use base64::{engine::general_purpose, Engine as _};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::fs;
use unified_entity_card::{assert_uec, create_character_uec, create_persona_uec, UecKind};

#[cfg(not(target_os = "android"))]
use tauri::Manager;

use super::db::{now_ms, open_db};
use super::legacy::storage_root;
use crate::utils::log_info;

mod engine;

pub use engine::{CharacterFileFormat, CharacterFormatInfo};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterExportPackage {
    pub version: u32,
    #[serde(default)]
    pub exported_at: i64,
    pub character: CharacterExportData,
    pub avatar_data: Option<String>,           // base64 data URL
    pub background_image_data: Option<String>, // base64 data URL
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AvatarCrop {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterExportData {
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub definition: Option<String>,
    pub rules: Vec<String>,
    pub scenes: Vec<SceneExport>,
    pub default_scene_id: Option<String>,
    pub default_model_id: Option<String>,
    #[serde(default)]
    pub memory_type: Option<String>,
    pub prompt_template_id: Option<String>,
    pub system_prompt: Option<String>,
    pub voice_config: Option<JsonValue>,
    pub voice_autoplay: Option<bool>,
    pub disable_avatar_gradient: bool,
    pub avatar_crop: Option<AvatarCrop>,
    pub custom_gradient_enabled: Option<bool>,
    pub custom_gradient_colors: Option<Vec<String>>,
    pub custom_text_color: Option<String>,
    pub custom_text_secondary: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneExport {
    pub id: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
    pub selected_variant_id: Option<String>,
    pub variants: Vec<SceneVariantExport>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneVariantExport {
    pub id: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaExportPackage {
    pub version: u32,
    #[serde(default)]
    pub exported_at: i64,
    pub persona: PersonaExportData,
    pub avatar_data: Option<String>, // base64 data URL
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaExportData {
    pub title: String,
    pub description: String,
    pub is_default: Option<bool>,
    pub avatar_crop: Option<AvatarCrop>,
}

fn number_to_i64(value: &JsonValue) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_u64().map(|v| v as i64))
        .or_else(|| value.as_f64().map(|v| v as i64))
}

fn parse_system_prompt_fields(
    payload: &JsonMap<String, JsonValue>,
) -> (Option<String>, Option<String>) {
    match payload.get("systemPrompt").and_then(|value| value.as_str()) {
        Some(value) if value.starts_with("_ID:") => {
            (Some(value.trim_start_matches("_ID:").to_string()), None)
        }
        Some(value) => (None, Some(value.to_string())),
        None => (None, None),
    }
}

fn parse_avatar_crop(value: Option<&JsonValue>) -> Option<AvatarCrop> {
    value.and_then(|crop| crop.as_object()).and_then(|crop| {
        Some(AvatarCrop {
            x: crop.get("x")?.as_f64()?,
            y: crop.get("y")?.as_f64()?,
            scale: crop.get("scale")?.as_f64()?,
        })
    })
}

fn parse_uec_character(value: &JsonValue) -> Result<CharacterExportPackage, String> {
    let uec = assert_uec(value, false)?;
    if uec.kind != UecKind::Character {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            "Invalid import: This is not a character UEC",
        ));
    }

    let payload = uec
        .payload
        .as_object()
        .ok_or_else(|| "Invalid UEC payload: expected object".to_string())?;

    let name = payload
        .get("name")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Invalid UEC payload: missing name".to_string())?
        .to_string();
    let description = payload
        .get("description")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    let definition = payload
        .get("definitions")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .or_else(|| description.clone());

    let rules = payload
        .get("rules")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    let scenes = payload
        .get("scenes")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|scene| {
                    let map = scene.as_object()?;
                    let id = map.get("id")?.as_str()?.to_string();
                    let content = map.get("content")?.as_str()?.to_string();
                    let direction = map
                        .get("direction")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let created_at = map.get("createdAt").and_then(number_to_i64);
                    let selected_variant_id = map
                        .get("selectedVariantId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let variants = map
                        .get("variants")
                        .and_then(|v| v.as_array())
                        .map(|variant_items| {
                            variant_items
                                .iter()
                                .filter_map(|variant| {
                                    let vmap = variant.as_object()?;
                                    let vid = vmap.get("id")?.as_str()?.to_string();
                                    let vcontent = vmap.get("content")?.as_str()?.to_string();
                                    let vdirection = vmap
                                        .get("direction")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                    let vcreated = vmap.get("createdAt").and_then(number_to_i64);
                                    Some(SceneVariantExport {
                                        id: vid,
                                        content: vcontent,
                                        direction: vdirection,
                                        created_at: vcreated,
                                    })
                                })
                                .collect::<Vec<SceneVariantExport>>()
                        })
                        .unwrap_or_default();

                    Some(SceneExport {
                        id,
                        content,
                        direction,
                        created_at,
                        selected_variant_id,
                        variants,
                    })
                })
                .collect::<Vec<SceneExport>>()
        })
        .unwrap_or_default();

    let default_scene_id = payload
        .get("defaultSceneId")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    let default_model_id = payload
        .get("defaultModelId")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());

    let (prompt_template_id, system_prompt) = parse_system_prompt_fields(payload);

    let voice_config = payload.get("voiceConfig").cloned();
    let voice_autoplay = payload.get("voiceAutoplay").and_then(|v| v.as_bool());

    let app_specific = uec
        .app_specific_settings
        .as_ref()
        .and_then(|value| value.as_object());

    let memory_type = app_specific
        .and_then(|map| map.get("memoryType").and_then(|v| v.as_str()))
        .map(|value| value.to_string());
    let disable_avatar_gradient = app_specific
        .and_then(|map| map.get("disableAvatarGradient").and_then(|v| v.as_bool()))
        .unwrap_or(false);
    let custom_gradient_enabled =
        app_specific.and_then(|map| map.get("customGradientEnabled").and_then(|v| v.as_bool()));
    let custom_gradient_colors = app_specific
        .and_then(|map| map.get("customGradientColors").and_then(|v| v.as_array()))
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect::<Vec<String>>()
        });
    let custom_text_color = app_specific
        .and_then(|map| map.get("customTextColor").and_then(|v| v.as_str()))
        .map(|value| value.to_string());
    let custom_text_secondary = app_specific
        .and_then(|map| map.get("customTextSecondary").and_then(|v| v.as_str()))
        .map(|value| value.to_string());
    let avatar_crop = parse_avatar_crop(app_specific.and_then(|map| map.get("avatarCrop")));

    let avatar_data = payload
        .get("avatar")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    let background_image_data = payload
        .get("chatBackground")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());

    Ok(CharacterExportPackage {
        version: 1,
        exported_at: now_ms() as i64,
        character: CharacterExportData {
            name,
            description,
            definition,
            rules,
            scenes,
            default_scene_id,
            default_model_id,
            memory_type,
            prompt_template_id,
            system_prompt,
            voice_config,
            voice_autoplay,
            disable_avatar_gradient,
            avatar_crop,
            custom_gradient_enabled,
            custom_gradient_colors,
            custom_text_color,
            custom_text_secondary,
        },
        avatar_data,
        background_image_data,
    })
}

fn parse_uec_persona(value: &JsonValue) -> Result<PersonaExportPackage, String> {
    let uec = assert_uec(value, false)?;
    if uec.kind != UecKind::Persona {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            "Invalid import: This is not a persona UEC",
        ));
    }

    let payload = uec
        .payload
        .as_object()
        .ok_or_else(|| "Invalid UEC payload: expected object".to_string())?;

    let title = payload
        .get("title")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Invalid UEC payload: missing title".to_string())?
        .to_string();
    let description = payload
        .get("description")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let is_default = payload.get("isDefault").and_then(|v| v.as_bool());
    let avatar_data = payload
        .get("avatar")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    let avatar_crop = parse_avatar_crop(
        uec.app_specific_settings
            .as_ref()
            .and_then(|v| v.get("avatarCrop")),
    );

    Ok(PersonaExportPackage {
        version: 1,
        exported_at: now_ms() as i64,
        persona: PersonaExportData {
            title,
            description,
            is_default,
            avatar_crop,
        },
        avatar_data,
    })
}

fn looks_like_uec(value: &JsonValue) -> bool {
    value
        .get("schema")
        .and_then(|schema| schema.get("name"))
        .and_then(|name| name.as_str())
        == Some("UEC")
        || value.get("kind").and_then(|kind| kind.as_str()).is_some()
}

fn detect_character_format(value: &JsonValue) -> Option<CharacterFileFormat> {
    if looks_like_uec(value) {
        return Some(CharacterFileFormat::Uec);
    }
    if let Some(format) = engine::guess_chara_card_format(value) {
        return Some(format);
    }
    if serde_json::from_value::<CharacterExportPackage>(value.clone()).is_ok() {
        return Some(CharacterFileFormat::LegacyJson);
    }
    None
}

fn parse_character_import_payload(
    raw_value: &JsonValue,
) -> Result<(CharacterExportPackage, CharacterFileFormat), String> {
    if looks_like_uec(raw_value) {
        return Ok((parse_uec_character(raw_value)?, CharacterFileFormat::Uec));
    }
    if engine::looks_like_chara_card_v3(raw_value) {
        return Ok((
            engine::parse_chara_card_v3(raw_value)?,
            CharacterFileFormat::CharaCardV3,
        ));
    }
    if engine::looks_like_chara_card_v2(raw_value) {
        return Ok((
            engine::parse_chara_card_v2(raw_value)?,
            CharacterFileFormat::CharaCardV2,
        ));
    }
    if engine::looks_like_chara_card_v1(raw_value) {
        return Ok((
            engine::parse_chara_card_v1(raw_value)?,
            CharacterFileFormat::CharaCardV1,
        ));
    }
    let legacy =
        serde_json::from_value::<CharacterExportPackage>(raw_value.clone()).map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Invalid import data: {}", e),
            )
        })?;
    Ok((legacy, CharacterFileFormat::LegacyJson))
}

fn is_http_url(value: &str) -> bool {
    value.starts_with("http://") || value.starts_with("https://")
}

fn legacy_entity_id(raw_value: &JsonValue, key: &str) -> Option<String> {
    raw_value
        .get(key)
        .and_then(|value| value.as_object())
        .and_then(|map| {
            map.get("originalId")
                .or_else(|| map.get("id"))
                .and_then(|value| value.as_str())
        })
        .map(|value| value.to_string())
}

struct CharacterExportSnapshot {
    character_id: String,
    created_at: i64,
    updated_at: i64,
    package: CharacterExportPackage,
}

fn load_character_export_snapshot(
    app: &tauri::AppHandle,
    character_id: &str,
) -> Result<CharacterExportSnapshot, String> {
    let conn = open_db(app)?;

    let (
        name,
        avatar_path,
        bg_path,
        description,
        definition,
        default_scene_id,
        default_model_id,
        prompt_template_id,
        system_prompt,
        voice_config_raw,
        voice_autoplay_raw,
        memory_type,
        disable_avatar_gradient,
        custom_gradient_enabled,
        custom_gradient_colors,
        custom_text_color,
        custom_text_secondary,
        avatar_crop_x,
        avatar_crop_y,
        avatar_crop_scale,
        created_at,
        updated_at,
    ): (
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<String>,
        i64,
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<f64>,
        Option<f64>,
        Option<f64>,
        i64,
        i64,
    ) = conn
        .query_row(
            "SELECT name, avatar_path, background_image_path, description, definition, default_scene_id, default_model_id, prompt_template_id, system_prompt, voice_config, voice_autoplay, memory_type, disable_avatar_gradient, custom_gradient_enabled, custom_gradient_colors, custom_text_color, custom_text_secondary, avatar_crop_x, avatar_crop_y, avatar_crop_scale, created_at, updated_at FROM characters WHERE id = ?",
            params![character_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                    r.get(9)?,
                    r.get(10)?,
                    r.get(11)?,
                    r.get::<_, i64>(12)?,
                    r.get::<_, i64>(13)?,
                    r.get(14)?,
                    r.get(15)?,
                    r.get(16)?,
                    r.get(17)?,
                    r.get(18)?,
                    r.get(19)?,
                    r.get(20)?,
                    r.get(21)?,
                ))
            },
        )
        .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Character not found: {}", e)))?;

    let mut rules: Vec<String> = Vec::new();
    let mut stmt = conn
        .prepare("SELECT rule FROM character_rules WHERE character_id = ? ORDER BY idx ASC")
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let rule_rows = stmt
        .query_map(params![character_id], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    for rule in rule_rows {
        rules.push(rule.map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?);
    }

    let mut scenes: Vec<SceneExport> = Vec::new();
    let mut scenes_stmt = conn
        .prepare("SELECT id, content, direction, created_at, selected_variant_id FROM scenes WHERE character_id = ? ORDER BY created_at ASC")
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let scene_rows = scenes_stmt
        .query_map(params![character_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    for row in scene_rows {
        let (scene_id, content, direction, scene_created_at, selected_variant_id) =
            row.map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

        let mut variants: Vec<SceneVariantExport> = Vec::new();
        let mut var_stmt = conn
            .prepare("SELECT id, content, direction, created_at FROM scene_variants WHERE scene_id = ? ORDER BY created_at ASC")
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        let var_rows = var_stmt
            .query_map(params![&scene_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, i64>(3)?,
                ))
            })
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

        for v in var_rows {
            let (vid, vcontent, vdirection, vcreated) =
                v.map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
            variants.push(SceneVariantExport {
                id: vid,
                content: vcontent,
                direction: vdirection,
                created_at: Some(vcreated),
            });
        }

        scenes.push(SceneExport {
            id: scene_id,
            content,
            direction,
            created_at: Some(scene_created_at),
            selected_variant_id,
            variants,
        });
    }

    let avatar_data = if let Some(ref avatar_filename) = avatar_path {
        read_avatar_as_base64(app, &format!("character-{}", character_id), avatar_filename).ok()
    } else {
        None
    };

    let background_image_data = if let Some(ref bg_id) = bg_path {
        read_background_image_as_base64(app, bg_id).ok()
    } else {
        None
    };

    let resolved_definition = definition.clone().or_else(|| description.clone());
    let memory_value = memory_type.unwrap_or_else(|| "manual".to_string());
    let voice_config = voice_config_raw
        .and_then(|vc| serde_json::from_str::<JsonValue>(&vc).ok())
        .filter(|v| !v.is_null());
    let voice_autoplay = voice_autoplay_raw.map(|v| v != 0);

    let custom_gradient_colors = custom_gradient_colors
        .as_ref()
        .and_then(|colors_json| serde_json::from_str::<Vec<String>>(colors_json).ok());
    let avatar_crop = match (avatar_crop_x, avatar_crop_y, avatar_crop_scale) {
        (Some(x), Some(y), Some(scale)) => Some(AvatarCrop { x, y, scale }),
        _ => None,
    };

    let package = CharacterExportPackage {
        version: 1,
        exported_at: now_ms() as i64,
        character: CharacterExportData {
            name,
            description: description.clone(),
            definition: resolved_definition,
            rules,
            scenes,
            default_scene_id,
            default_model_id,
            memory_type: Some(memory_value),
            prompt_template_id,
            system_prompt,
            voice_config,
            voice_autoplay,
            disable_avatar_gradient: disable_avatar_gradient != 0,
            avatar_crop,
            custom_gradient_enabled: Some(custom_gradient_enabled != 0),
            custom_gradient_colors,
            custom_text_color,
            custom_text_secondary,
        },
        avatar_data,
        background_image_data,
    };

    Ok(CharacterExportSnapshot {
        character_id: character_id.to_string(),
        created_at,
        updated_at,
        package,
    })
}

fn build_uec_from_package(
    package: &CharacterExportPackage,
    character_id: &str,
    created_at: Option<i64>,
    updated_at: Option<i64>,
) -> Result<String, String> {
    let resolved_definition = package
        .character
        .definition
        .clone()
        .or_else(|| package.character.description.clone());
    let memory_value = package
        .character
        .memory_type
        .clone()
        .unwrap_or_else(|| "manual".to_string());

    let mut payload = JsonMap::new();
    payload.insert("id".into(), JsonValue::String(character_id.to_string()));
    payload.insert(
        "name".into(),
        JsonValue::String(package.character.name.clone()),
    );
    if let Some(desc) = package.character.description.clone() {
        payload.insert("description".into(), JsonValue::String(desc));
    }
    if let Some(def) = resolved_definition {
        payload.insert("definitions".into(), JsonValue::String(def));
    }
    if let Some(data) = package.avatar_data.clone() {
        payload.insert("avatar".into(), JsonValue::String(data));
    }
    if let Some(data) = package.background_image_data.clone() {
        payload.insert("chatBackground".into(), JsonValue::String(data));
    }
    payload.insert(
        "rules".into(),
        JsonValue::Array(
            package
                .character
                .rules
                .iter()
                .map(|rule| JsonValue::String(rule.clone()))
                .collect(),
        ),
    );
    let scenes = serde_json::to_value(&package.character.scenes)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    payload.insert("scenes".into(), scenes);
    if let Some(ds) = package.character.default_scene_id.clone() {
        payload.insert("defaultSceneId".into(), JsonValue::String(ds));
    }
    if let Some(dm) = package.character.default_model_id.clone() {
        payload.insert("defaultModelId".into(), JsonValue::String(dm));
    }

    let mut system_prompt_is_id = false;
    if let Some(pt) = package.character.prompt_template_id.clone() {
        payload.insert("systemPrompt".into(), JsonValue::String(pt));
        system_prompt_is_id = true;
    } else if let Some(sp) = package.character.system_prompt.clone() {
        payload.insert("systemPrompt".into(), JsonValue::String(sp));
    }

    if let Some(vc) = package.character.voice_config.clone() {
        if !vc.is_null() {
            payload.insert("voiceConfig".into(), vc);
        }
    }

    payload.insert(
        "voiceAutoplay".into(),
        JsonValue::Bool(package.character.voice_autoplay.unwrap_or(false)),
    );

    let created_at = created_at.unwrap_or(package.exported_at);
    let updated_at = updated_at.unwrap_or(package.exported_at);

    payload.insert("createdAt".into(), JsonValue::from(created_at));
    payload.insert("updatedAt".into(), JsonValue::from(updated_at));

    let mut app_specific = JsonMap::new();
    app_specific.insert(
        "disableAvatarGradient".into(),
        JsonValue::Bool(package.character.disable_avatar_gradient),
    );
    app_specific.insert("memoryType".into(), JsonValue::String(memory_value));
    app_specific.insert(
        "customGradientEnabled".into(),
        JsonValue::Bool(package.character.custom_gradient_enabled.unwrap_or(false)),
    );
    if let Some(colors) = package.character.custom_gradient_colors.clone() {
        app_specific.insert("customGradientColors".into(), serde_json::json!(colors));
    }
    if let Some(color) = package.character.custom_text_color.clone() {
        app_specific.insert("customTextColor".into(), JsonValue::String(color));
    }
    if let Some(color) = package.character.custom_text_secondary.clone() {
        app_specific.insert("customTextSecondary".into(), JsonValue::String(color));
    }
    if let Some(crop) = package.character.avatar_crop.clone() {
        app_specific.insert(
            "avatarCrop".into(),
            serde_json::json!({
                "x": crop.x,
                "y": crop.y,
                "scale": crop.scale,
            }),
        );
    }

    let mut meta = JsonMap::new();
    meta.insert("createdAt".into(), JsonValue::from(created_at));
    meta.insert("updatedAt".into(), JsonValue::from(updated_at));
    meta.insert("source".into(), JsonValue::String("lettuceai".to_string()));

    let export_card = create_character_uec(
        payload,
        system_prompt_is_id,
        None,
        Some(JsonValue::Object(app_specific)),
        Some(JsonValue::Object(meta)),
        Some(JsonValue::Object(JsonMap::new())),
    );

    serde_json::to_string_pretty(&export_card).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to serialize export: {}", e),
        )
    })
}

fn build_uec_from_persona_package(
    package: &PersonaExportPackage,
    persona_id: &str,
    created_at: Option<i64>,
    updated_at: Option<i64>,
) -> Result<String, String> {
    let mut payload = JsonMap::new();
    payload.insert("id".into(), JsonValue::String(persona_id.to_string()));
    payload.insert(
        "title".into(),
        JsonValue::String(package.persona.title.clone()),
    );
    if !package.persona.description.is_empty() {
        payload.insert(
            "description".into(),
            JsonValue::String(package.persona.description.clone()),
        );
    }
    if let Some(data) = package.avatar_data.clone() {
        payload.insert("avatar".into(), JsonValue::String(data));
    }
    if let Some(is_default) = package.persona.is_default {
        payload.insert("isDefault".into(), JsonValue::Bool(is_default));
    }

    let created_at = created_at.unwrap_or(package.exported_at);
    let updated_at = updated_at.unwrap_or(package.exported_at);

    payload.insert("createdAt".into(), JsonValue::from(created_at));
    payload.insert("updatedAt".into(), JsonValue::from(updated_at));

    let mut meta = JsonMap::new();
    meta.insert("createdAt".into(), JsonValue::from(created_at));
    meta.insert("updatedAt".into(), JsonValue::from(updated_at));
    meta.insert("source".into(), JsonValue::String("lettuceai".to_string()));

    let mut app_specific = JsonMap::new();
    if let Some(crop) = package.persona.avatar_crop.clone() {
        app_specific.insert(
            "avatarCrop".into(),
            serde_json::json!({
                "x": crop.x,
                "y": crop.y,
                "scale": crop.scale,
            }),
        );
    }

    let uec = create_persona_uec(
        payload,
        None,
        Some(JsonValue::Object(app_specific)),
        Some(JsonValue::Object(meta)),
        Some(JsonValue::Object(JsonMap::new())),
    );

    serde_json::to_string_pretty(&uec)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
}

#[tauri::command]
pub fn character_export(app: tauri::AppHandle, character_id: String) -> Result<String, String> {
    character_export_with_format(app, character_id, CharacterFileFormat::Uec)
}

#[tauri::command]
pub fn character_export_with_format(
    app: tauri::AppHandle,
    character_id: String,
    format: CharacterFileFormat,
) -> Result<String, String> {
    log_info(
        &app,
        "character_export",
        format!("Exporting character {} as {:?}", character_id, format),
    );

    let snapshot = load_character_export_snapshot(&app, &character_id)?;

    let json = match format {
        CharacterFileFormat::Uec => build_uec_from_package(
            &snapshot.package,
            &snapshot.character_id,
            Some(snapshot.created_at),
            Some(snapshot.updated_at),
        )?,
        CharacterFileFormat::CharaCardV3 => {
            let card = engine::export_chara_card_v3(
                &snapshot.package,
                Some(snapshot.created_at),
                Some(snapshot.updated_at),
            );
            serde_json::to_string_pretty(&card).map_err(|e| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    format!("Failed to serialize export: {}", e),
                )
            })?
        }
        CharacterFileFormat::CharaCardV2 => {
            let card = engine::export_chara_card_v2(&snapshot.package);
            serde_json::to_string_pretty(&card).map_err(|e| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    format!("Failed to serialize export: {}", e),
                )
            })?
        }
        CharacterFileFormat::CharaCardV1 => {
            return Err(crate::utils::err_msg(
                module_path!(),
                line!(),
                "Character Card V1 export is read-only",
            ));
        }
        CharacterFileFormat::LegacyJson => {
            return Err(crate::utils::err_msg(
                module_path!(),
                line!(),
                "Legacy JSON export is not supported",
            ));
        }
    };

    log_info(
        &app,
        "character_export",
        format!("Successfully exported character: {}", character_id),
    );

    Ok(json)
}

#[tauri::command]
pub fn character_list_formats() -> Result<Vec<CharacterFormatInfo>, String> {
    Ok(engine::all_character_formats())
}

#[tauri::command]
pub fn character_detect_format(import_json: String) -> Result<CharacterFormatInfo, String> {
    let raw_value: JsonValue = serde_json::from_str(&import_json).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Invalid import data: {}", e),
        )
    })?;
    let format = detect_character_format(&raw_value)
        .ok_or_else(|| "Unsupported character file format".to_string())?;
    Ok(engine::character_format_info(format))
}

/// Import a character from a JSON package
#[tauri::command]
pub fn character_import(app: tauri::AppHandle, import_json: String) -> Result<String, String> {
    log_info(&app, "character_import", "Starting character import");

    let raw_value: JsonValue = serde_json::from_str(&import_json).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Invalid import data: {}", e),
        )
    })?;
    let (package, _format) = parse_character_import_payload(&raw_value)?;

    // Validate version
    if package.version > 1 {
        return Err(format!(
            "Unsupported export version: {}. Please update your app.",
            package.version
        ));
    }

    let mut conn = open_db(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

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
        if is_http_url(avatar_base64) {
            log_info(
                &app,
                "character_import",
                "Skipping remote avatar URL during import",
            );
            None
        } else {
            match save_avatar_from_base64(
                &app,
                &format!("character-{}", new_character_id),
                avatar_base64,
            ) {
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
        }
    } else {
        None
    };

    // Save background image if provided
    let background_image_path = if let Some(ref bg_base64) = package.background_image_data {
        if is_http_url(bg_base64) {
            log_info(
                &app,
                "character_import",
                "Skipping remote background URL during import",
            );
            None
        } else {
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
        }
    } else {
        None
    };

    let memory_type = match package.character.memory_type.as_deref() {
        Some("dynamic") => "dynamic".to_string(),
        _ => "manual".to_string(),
    };
    let custom_gradient_enabled = package.character.custom_gradient_enabled.unwrap_or(false) as i64;
    let custom_gradient_colors = package
        .character
        .custom_gradient_colors
        .as_ref()
        .and_then(|colors| serde_json::to_string(colors).ok());
    let custom_text_color = package.character.custom_text_color.clone();
    let custom_text_secondary = package.character.custom_text_secondary.clone();
    let (avatar_crop_x, avatar_crop_y, avatar_crop_scale) = package
        .character
        .avatar_crop
        .as_ref()
        .map(|crop| (Some(crop.x), Some(crop.y), Some(crop.scale)))
        .unwrap_or((None, None, None));

    let voice_config = package.character.voice_config.as_ref().and_then(|v| {
        if v.is_null() {
            None
        } else {
            serde_json::to_string(v).ok()
        }
    });
    let voice_autoplay = package.character.voice_autoplay.unwrap_or(false) as i64;

    // Insert character
    tx.execute(
        r#"INSERT INTO characters (id, name, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, background_image_path, description, definition, default_scene_id, default_model_id, prompt_template_id, system_prompt, voice_config, voice_autoplay, memory_type, disable_avatar_gradient, custom_gradient_enabled, custom_gradient_colors, custom_text_color, custom_text_secondary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        params![
            &new_character_id,
            &package.character.name,
            avatar_path,
            avatar_crop_x,
            avatar_crop_y,
            avatar_crop_scale,
            background_image_path,
            package.character.description,
            package
                .character
                .definition
                .clone()
                .or(package.character.description.clone()),
            package.character.default_model_id,
            package.character.prompt_template_id,
            package.character.system_prompt,
            voice_config,
            voice_autoplay,
            memory_type,
            package.character.disable_avatar_gradient as i64,
            custom_gradient_enabled,
            custom_gradient_colors,
            custom_text_color,
            custom_text_secondary,
            now,
            now
        ],
    )
    .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to insert character: {}", e)))?;

    // Insert rules
    for (idx, rule) in package.character.rules.iter().enumerate() {
        tx.execute(
            "INSERT INTO character_rules (character_id, idx, rule) VALUES (?, ?, ?)",
            params![&new_character_id, idx as i64, rule],
        )
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
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
            let variant_created_at = variant.created_at.unwrap_or(now);

            tx.execute(
                "INSERT INTO scene_variants (id, scene_id, content, direction, created_at) VALUES (?, ?, ?, ?, ?)",
                params![
                    new_variant_id,
                    &new_scene_id,
                    &variant.content,
                    &variant.direction,
                    variant_created_at
                ],
            )
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        }

        // Map selected variant ID
        let new_selected_variant_id = scene
            .selected_variant_id
            .as_ref()
            .and_then(|old_id| variant_id_map.get(old_id).cloned());

        let scene_created_at = scene.created_at.unwrap_or(now);
        tx.execute(
            "INSERT INTO scenes (id, character_id, content, direction, created_at, selected_variant_id) VALUES (?, ?, ?, ?, ?, ?)",
            params![
                &new_scene_id,
                &new_character_id,
                &scene.content,
                &scene.direction,
                scene_created_at,
                new_selected_variant_id
            ],
        )
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

        // Set first scene as default if no default was specified
        if i == 0
            && (package.character.default_scene_id.is_none() || new_default_scene_id.is_none())
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
    .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    tx.commit()
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    log_info(
        &app,
        "character_import",
        format!("Successfully imported character: {}", new_character_id),
    );

    // Return the new character as JSON
    let conn2 = open_db(&app)?;
    read_imported_character(&conn2, &new_character_id)
}

/// Preview a character import without saving it
#[tauri::command]
pub fn character_import_preview(import_json: String) -> Result<String, String> {
    let raw_value: JsonValue = serde_json::from_str(&import_json).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Invalid import data: {}", e),
        )
    })?;
    let (package, format) = parse_character_import_payload(&raw_value)?;

    if package.version > 1 {
        return Err(format!(
            "Unsupported export version: {}. Please update your app.",
            package.version
        ));
    }

    let description = package.character.description.clone().unwrap_or_default();
    let definition = package
        .character
        .definition
        .clone()
        .or(package.character.description.clone())
        .unwrap_or_default();
    let memory_type = match package.character.memory_type.as_deref() {
        Some("dynamic") => "dynamic".to_string(),
        _ => "manual".to_string(),
    };

    let scenes = serde_json::to_value(&package.character.scenes)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    let preview = serde_json::json!({
        "name": package.character.name,
        "description": description,
        "definition": definition,
        "scenes": scenes,
        "defaultSceneId": package.character.default_scene_id,
        "promptTemplateId": package.character.prompt_template_id,
        "memoryType": memory_type,
        "disableAvatarGradient": package.character.disable_avatar_gradient,
        "fileFormat": format,
        "avatarData": package.avatar_data,
        "avatarCrop": package.character.avatar_crop,
        "backgroundImageData": package.background_image_data
    });

    serde_json::to_string(&preview)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
}

/// Convert a legacy export package to a UEC file (no import performed)
#[tauri::command]
pub fn convert_export_to_uec(import_json: String) -> Result<String, String> {
    let raw_value: JsonValue = serde_json::from_str(&import_json).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Invalid import data: {}", e),
        )
    })?;

    if looks_like_uec(&raw_value) {
        assert_uec(&raw_value, false)?;
        return serde_json::to_string_pretty(&raw_value)
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e));
    }

    if engine::guess_chara_card_format(&raw_value).is_some() {
        let (package, _) = parse_character_import_payload(&raw_value)?;
        let character_id = uuid::Uuid::new_v4().to_string();
        return build_uec_from_package(&package, &character_id, None, None);
    }

    if let Ok(package) = serde_json::from_value::<CharacterExportPackage>(raw_value.clone()) {
        let character_id = uuid::Uuid::new_v4().to_string();
        return build_uec_from_package(&package, &character_id, None, None);
    }

    if let Ok(package) = serde_json::from_value::<PersonaExportPackage>(raw_value.clone()) {
        let persona_id = uuid::Uuid::new_v4().to_string();
        return build_uec_from_persona_package(&package, &persona_id, None, None);
    }

    let kind = raw_value
        .get("type")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Invalid import: missing type".to_string())?;

    match kind {
        "character" => {
            let package: CharacterExportPackage = serde_json::from_value(raw_value.clone())
                .map_err(|e| {
                    crate::utils::err_msg(
                        module_path!(),
                        line!(),
                        format!("Invalid import data: {}", e),
                    )
                })?;
            let legacy_id = legacy_entity_id(&raw_value, "character")
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let legacy_created_at = raw_value
                .get("character")
                .and_then(|value| value.get("createdAt"))
                .and_then(number_to_i64);
            let legacy_updated_at = raw_value
                .get("character")
                .and_then(|value| value.get("updatedAt"))
                .and_then(number_to_i64);

            let mut payload = JsonMap::new();
            payload.insert("id".into(), JsonValue::String(legacy_id));
            payload.insert(
                "name".into(),
                JsonValue::String(package.character.name.clone()),
            );
            if let Some(desc) = package.character.description.clone() {
                payload.insert("description".into(), JsonValue::String(desc.clone()));
            }
            if let Some(def) = package
                .character
                .definition
                .clone()
                .or(package.character.description.clone())
            {
                payload.insert("definitions".into(), JsonValue::String(def));
            }
            if let Some(data) = package.avatar_data.clone() {
                payload.insert("avatar".into(), JsonValue::String(data));
            }
            if let Some(data) = package.background_image_data.clone() {
                payload.insert("chatBackground".into(), JsonValue::String(data));
            }
            payload.insert(
                "rules".into(),
                JsonValue::Array(
                    package
                        .character
                        .rules
                        .iter()
                        .map(|rule| JsonValue::String(rule.clone()))
                        .collect(),
                ),
            );
            let scenes = serde_json::to_value(&package.character.scenes)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
            payload.insert("scenes".into(), scenes);
            if let Some(ds) = package.character.default_scene_id.clone() {
                payload.insert("defaultSceneId".into(), JsonValue::String(ds));
            }
            if let Some(dm) = package.character.default_model_id.clone() {
                payload.insert("defaultModelId".into(), JsonValue::String(dm));
            }

            let mut system_prompt_is_id = false;
            if let Some(pt) = package.character.prompt_template_id.clone() {
                payload.insert("systemPrompt".into(), JsonValue::String(pt));
                system_prompt_is_id = true;
            } else if let Some(sp) = package.character.system_prompt.clone() {
                payload.insert("systemPrompt".into(), JsonValue::String(sp));
            }

            if let Some(vc) = package.character.voice_config.clone() {
                if !vc.is_null() {
                    payload.insert("voiceConfig".into(), vc);
                }
            }
            if let Some(autoplay) = package.character.voice_autoplay {
                payload.insert("voiceAutoplay".into(), JsonValue::Bool(autoplay));
            }
            if let Some(created_at) = legacy_created_at {
                payload.insert("createdAt".into(), JsonValue::from(created_at));
            }
            if let Some(updated_at) = legacy_updated_at {
                payload.insert("updatedAt".into(), JsonValue::from(updated_at));
            }

            let mut app_specific = JsonMap::new();
            app_specific.insert(
                "disableAvatarGradient".into(),
                JsonValue::Bool(package.character.disable_avatar_gradient),
            );
            let memory_type = package
                .character
                .memory_type
                .clone()
                .unwrap_or_else(|| "manual".to_string());
            app_specific.insert("memoryType".into(), JsonValue::String(memory_type));
            if let Some(enabled) = package.character.custom_gradient_enabled {
                app_specific.insert("customGradientEnabled".into(), JsonValue::Bool(enabled));
            }
            if let Some(colors) = package.character.custom_gradient_colors.clone() {
                app_specific.insert("customGradientColors".into(), serde_json::json!(colors));
            }
            if let Some(color) = package.character.custom_text_color.clone() {
                app_specific.insert("customTextColor".into(), JsonValue::String(color));
            }
            if let Some(color) = package.character.custom_text_secondary.clone() {
                app_specific.insert("customTextSecondary".into(), JsonValue::String(color));
            }
            if let Some(crop) = package.character.avatar_crop.clone() {
                app_specific.insert(
                    "avatarCrop".into(),
                    serde_json::json!({
                        "x": crop.x,
                        "y": crop.y,
                        "scale": crop.scale,
                    }),
                );
            }

            let fallback_ts = package.exported_at;
            let mut meta = JsonMap::new();
            meta.insert(
                "createdAt".into(),
                JsonValue::from(legacy_created_at.unwrap_or(fallback_ts)),
            );
            meta.insert(
                "updatedAt".into(),
                JsonValue::from(legacy_updated_at.unwrap_or(fallback_ts)),
            );
            meta.insert("source".into(), JsonValue::String("lettuceai".to_string()));

            let uec = create_character_uec(
                payload,
                system_prompt_is_id,
                None,
                Some(JsonValue::Object(app_specific)),
                Some(JsonValue::Object(meta)),
                Some(JsonValue::Object(JsonMap::new())),
            );
            serde_json::to_string_pretty(&uec)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
        }
        "persona" => {
            let package: PersonaExportPackage =
                serde_json::from_value(raw_value.clone()).map_err(|e| {
                    crate::utils::err_msg(
                        module_path!(),
                        line!(),
                        format!("Invalid import data: {}", e),
                    )
                })?;
            let legacy_id = legacy_entity_id(&raw_value, "persona")
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let legacy_created_at = raw_value
                .get("persona")
                .and_then(|value| value.get("createdAt"))
                .and_then(number_to_i64);
            let legacy_updated_at = raw_value
                .get("persona")
                .and_then(|value| value.get("updatedAt"))
                .and_then(number_to_i64);

            let mut payload = JsonMap::new();
            payload.insert("id".into(), JsonValue::String(legacy_id));
            payload.insert(
                "title".into(),
                JsonValue::String(package.persona.title.clone()),
            );
            if !package.persona.description.is_empty() {
                payload.insert(
                    "description".into(),
                    JsonValue::String(package.persona.description.clone()),
                );
            }
            if let Some(data) = package.avatar_data.clone() {
                payload.insert("avatar".into(), JsonValue::String(data));
            }
            if let Some(is_default) = package.persona.is_default {
                payload.insert("isDefault".into(), JsonValue::Bool(is_default));
            }
            if let Some(created_at) = legacy_created_at {
                payload.insert("createdAt".into(), JsonValue::from(created_at));
            }
            if let Some(updated_at) = legacy_updated_at {
                payload.insert("updatedAt".into(), JsonValue::from(updated_at));
            }

            let fallback_ts = package.exported_at;
            let mut meta = JsonMap::new();
            meta.insert(
                "createdAt".into(),
                JsonValue::from(legacy_created_at.unwrap_or(fallback_ts)),
            );
            meta.insert(
                "updatedAt".into(),
                JsonValue::from(legacy_updated_at.unwrap_or(fallback_ts)),
            );
            meta.insert("source".into(), JsonValue::String("lettuceai".to_string()));

            let uec = create_persona_uec(
                payload,
                None,
                Some(JsonValue::Object(JsonMap::new())),
                Some(JsonValue::Object(meta)),
                Some(JsonValue::Object(JsonMap::new())),
            );
            serde_json::to_string_pretty(&uec)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
        }
        _ => Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            "Unsupported import type",
        )),
    }
}

/// Convert a character export between supported formats without importing.
#[tauri::command]
pub fn convert_export_to_format(
    import_json: String,
    target_format: CharacterFileFormat,
) -> Result<String, String> {
    if target_format == CharacterFileFormat::Uec {
        return convert_export_to_uec(import_json);
    }

    let raw_value: JsonValue = serde_json::from_str(&import_json).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Invalid import data: {}", e),
        )
    })?;

    if looks_like_uec(&raw_value) {
        let kind = raw_value
            .get("kind")
            .and_then(|value| value.as_str())
            .unwrap_or("character");
        if kind == "persona" {
            return Err("Persona conversions are only supported for UEC.".to_string());
        }
    }

    let package = if looks_like_uec(&raw_value) {
        parse_uec_character(&raw_value)?
    } else if engine::guess_chara_card_format(&raw_value).is_some() {
        parse_character_import_payload(&raw_value)?.0
    } else if let Ok(package) = serde_json::from_value::<CharacterExportPackage>(raw_value.clone())
    {
        package
    } else {
        return Err("Unsupported or invalid character format".to_string());
    };

    let json = match target_format {
        CharacterFileFormat::CharaCardV2 => {
            let card = engine::export_chara_card_v2(&package);
            serde_json::to_string_pretty(&card).map_err(|e| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    format!("Failed to serialize export: {}", e),
                )
            })?
        }
        CharacterFileFormat::CharaCardV3 => {
            let card = engine::export_chara_card_v3(&package, None, None);
            serde_json::to_string_pretty(&card).map_err(|e| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    format!("Failed to serialize export: {}", e),
                )
            })?
        }
        CharacterFileFormat::Uec => unreachable!(),
        CharacterFileFormat::LegacyJson | CharacterFileFormat::CharaCardV1 => {
            return Err("Target format is not supported for conversion.".to_string());
        }
    };

    Ok(json)
}

/// Helper: Read avatar as base64 data URL
fn read_avatar_as_base64(
    app: &tauri::AppHandle,
    entity_id: &str,
    filename: &str,
) -> Result<String, String> {
    let avatar_path = storage_root(app)?
        .join("avatars")
        .join(entity_id)
        .join(filename);

    if !avatar_path.exists() {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Avatar not found: {}", filename),
        ));
    }

    let bytes = fs::read(&avatar_path)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

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
            let bytes = fs::read(&image_path)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
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

    Err(crate::utils::err_msg(
        module_path!(),
        line!(),
        format!("Background image not found: {}", image_id),
    ))
}

/// Helper: Save avatar from base64 data URL
/// entity_id should be "character-{id}" or "persona-{id}"
fn save_avatar_from_base64(
    app: &tauri::AppHandle,
    entity_id: &str,
    base64_data: &str,
) -> Result<String, String> {
    // Strip data URL prefix if present
    let data = if let Some(comma_idx) = base64_data.find(',') {
        &base64_data[comma_idx + 1..]
    } else {
        base64_data
    };

    let bytes = general_purpose::STANDARD.decode(data).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to decode base64: {}", e),
        )
    })?;

    let avatars_dir = storage_root(app)?.join("avatars").join(entity_id);

    crate::utils::log_debug(
        app,
        "entity_transfer",
        format!("Creating avatar directory: {:?}", avatars_dir),
    );
    fs::create_dir_all(&avatars_dir).map_err(|e| {
        crate::utils::log_error(
            app,
            "entity_transfer",
            format!("Failed to create avatar directory: {:?}", e),
        );
        e.to_string()
    })?;

    // Convert to WebP
    let webp_bytes = match image::load_from_memory(&bytes) {
        Ok(img) => {
            let mut webp_data: Vec<u8> = Vec::new();
            let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut webp_data);
            img.write_with_encoder(encoder).map_err(|e| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    format!("Failed to encode WebP: {}", e),
                )
            })?;
            webp_data
        }
        Err(_) => bytes,
    };

    let base_filename = "avatar_base.webp";
    let base_path = avatars_dir.join(base_filename);
    fs::write(&base_path, &webp_bytes)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let legacy_path = avatars_dir.join("avatar.webp");
    fs::write(&legacy_path, &webp_bytes)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let round_path = avatars_dir.join("avatar_round.webp");
    fs::write(&round_path, &webp_bytes)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    Ok(base_filename.to_string())
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

    let bytes = general_purpose::STANDARD.decode(data).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to decode base64: {}", e),
        )
    })?;

    let images_dir = storage_root(app)?.join("images");
    fs::create_dir_all(&images_dir)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

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
    fs::write(&image_path, bytes)
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    Ok(image_id)
}

/// Helper: Read imported character and return as JSON
fn read_imported_character(
    conn: &rusqlite::Connection,
    character_id: &str,
) -> Result<String, String> {
    let (
        name,
        avatar_path,
        avatar_crop_x,
        avatar_crop_y,
        avatar_crop_scale,
        bg_path,
        description,
        definition,
        default_scene_id,
        default_model_id,
        prompt_template_id,
        system_prompt,
        voice_config,
        voice_autoplay,
        memory_type,
        disable_avatar_gradient,
        custom_gradient_enabled,
        custom_gradient_colors,
        custom_text_color,
        custom_text_secondary,
        created_at,
        updated_at,
    ): (
        String,
        Option<String>,
        Option<f64>,
        Option<f64>,
        Option<f64>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<String>,
        i64,
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        i64,
        i64,
    ) = conn
        .query_row(
            "SELECT name, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, background_image_path, description, definition, default_scene_id, default_model_id, prompt_template_id, system_prompt, voice_config, voice_autoplay, memory_type, disable_avatar_gradient, custom_gradient_enabled, custom_gradient_colors, custom_text_color, custom_text_secondary, created_at, updated_at FROM characters WHERE id = ?",
            params![character_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                    r.get(9)?,
                    r.get(10)?,
                    r.get(11)?,
                    r.get(12)?,
                    r.get(13)?,
                    r.get(14)?,
                    r.get::<_, i64>(15)?,
                    r.get::<_, i64>(16)?,
                    r.get(17)?,
                    r.get(18)?,
                    r.get(19)?,
                    r.get(20)?,
                    r.get(21)?,
                ))
            },
        )
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    // Read rules
    let mut rules: Vec<JsonValue> = Vec::new();
    let mut stmt = conn
        .prepare("SELECT rule FROM character_rules WHERE character_id = ? ORDER BY idx ASC")
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let rule_rows = stmt
        .query_map(params![character_id], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    for rule in rule_rows {
        rules.push(JsonValue::String(rule.map_err(|e| {
            crate::utils::err_to_string(module_path!(), line!(), e)
        })?));
    }

    // Read scenes
    let mut scenes: Vec<JsonValue> = Vec::new();
    let mut scenes_stmt = conn
        .prepare("SELECT id, content, direction, created_at, selected_variant_id FROM scenes WHERE character_id = ? ORDER BY created_at ASC")
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
    let scenes_rows = scenes_stmt
        .query_map(params![character_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    for row in scenes_rows {
        let (scene_id, content, direction, _scene_created_at, selected_variant_id) =
            row.map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

        // Read scene variants
        let mut variants: Vec<JsonValue> = Vec::new();
        let mut var_stmt = conn
            .prepare("SELECT id, content, direction, created_at FROM scene_variants WHERE scene_id = ? ORDER BY created_at ASC")
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
        let var_rows = var_stmt
            .query_map(params![&scene_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, i64>(3)?,
                ))
            })
            .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

        for v in var_rows {
            let (vid, vcontent, vdirection, vcreated) =
                v.map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
            let mut variant_obj =
                serde_json::json!({"id": vid, "content": vcontent, "createdAt": vcreated});
            if let Some(dir) = vdirection {
                variant_obj["direction"] = serde_json::json!(dir);
            }
            variants.push(variant_obj);
        }

        let mut scene_obj = JsonMap::new();
        scene_obj.insert("id".into(), JsonValue::String(scene_id));
        scene_obj.insert("content".into(), JsonValue::String(content));
        if let Some(dir) = direction {
            scene_obj.insert("direction".into(), JsonValue::String(dir));
        }
        scene_obj.insert("createdAt".into(), JsonValue::from(_scene_created_at));
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
    if let (Some(x), Some(y), Some(scale)) = (avatar_crop_x, avatar_crop_y, avatar_crop_scale) {
        root.insert(
            "avatarCrop".into(),
            serde_json::json!({ "x": x, "y": y, "scale": scale }),
        );
    }
    if let Some(b) = bg_path {
        root.insert("backgroundImagePath".into(), JsonValue::String(b));
    }
    let resolved_definition = definition.or_else(|| description.clone());
    if let Some(def) = resolved_definition {
        root.insert("definition".into(), JsonValue::String(def));
    }
    if let Some(d) = description {
        root.insert("description".into(), JsonValue::String(d));
    }
    root.insert("rules".into(), JsonValue::Array(rules));
    root.insert("scenes".into(), JsonValue::Array(scenes));
    if let Some(ds) = default_scene_id {
        root.insert("defaultSceneId".into(), JsonValue::String(ds));
    }
    if let Some(dm) = default_model_id {
        root.insert("defaultModelId".into(), JsonValue::String(dm));
    }
    let memory_value = memory_type.unwrap_or_else(|| "manual".to_string());
    root.insert("memoryType".into(), JsonValue::String(memory_value));
    if let Some(pt) = prompt_template_id {
        root.insert("promptTemplateId".into(), JsonValue::String(pt));
    }
    if let Some(sp) = system_prompt {
        root.insert("systemPrompt".into(), JsonValue::String(sp));
    }
    if let Some(vc) = voice_config {
        if let Ok(value) = serde_json::from_str::<JsonValue>(&vc) {
            if !value.is_null() {
                root.insert("voiceConfig".into(), value);
            }
        }
    }
    root.insert(
        "voiceAutoplay".into(),
        JsonValue::Bool(voice_autoplay.unwrap_or(0) != 0),
    );
    root.insert(
        "disableAvatarGradient".into(),
        JsonValue::Bool(disable_avatar_gradient != 0),
    );
    root.insert(
        "customGradientEnabled".into(),
        JsonValue::Bool(custom_gradient_enabled != 0),
    );
    if let Some(colors_json) = custom_gradient_colors {
        if let Ok(colors) = serde_json::from_str::<Vec<String>>(&colors_json) {
            root.insert("customGradientColors".into(), serde_json::json!(colors));
        }
    }
    if let Some(tc) = custom_text_color {
        root.insert("customTextColor".into(), JsonValue::String(tc));
    }
    if let Some(ts) = custom_text_secondary {
        root.insert("customTextSecondary".into(), JsonValue::String(ts));
    }
    root.insert("createdAt".into(), JsonValue::from(created_at));
    root.insert("updatedAt".into(), JsonValue::from(updated_at));

    serde_json::to_string(&JsonValue::Object(root))
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
}

#[tauri::command]
pub fn persona_export(app: tauri::AppHandle, persona_id: String) -> Result<String, String> {
    log_info(
        &app,
        "persona_export",
        format!("Exporting persona: {}", persona_id),
    );

    let conn = open_db(&app)?;

    // Read persona data
    let (title, description, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, is_default, created_at, updated_at): (
        String,
        String,
        Option<String>,
        Option<f64>,
        Option<f64>,
        Option<f64>,
        i64,
        i64,
        i64,
    ) = conn
        .query_row(
            "SELECT title, description, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, is_default, created_at, updated_at FROM personas WHERE id = ?",
            params![&persona_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)),
        )
        .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Persona not found: {}", e)))?;

    // Read avatar image if exists
    let avatar_data = if let Some(ref avatar_filename) = avatar_path {
        read_avatar_as_base64(&app, &format!("persona-{}", persona_id), avatar_filename).ok()
    } else {
        None
    };

    let mut payload = JsonMap::new();
    payload.insert("id".into(), JsonValue::String(persona_id.clone()));
    payload.insert("title".into(), JsonValue::String(title));
    payload.insert("description".into(), JsonValue::String(description));
    payload.insert("isDefault".into(), JsonValue::Bool(is_default != 0));
    payload.insert("createdAt".into(), JsonValue::from(created_at));
    payload.insert("updatedAt".into(), JsonValue::from(updated_at));
    if let Some(data) = avatar_data {
        payload.insert("avatar".into(), JsonValue::String(data));
    }

    let mut meta = JsonMap::new();
    meta.insert("createdAt".into(), JsonValue::from(created_at));
    meta.insert("updatedAt".into(), JsonValue::from(updated_at));
    meta.insert("source".into(), JsonValue::String("lettuceai".to_string()));

    let mut app_specific = JsonMap::new();
    if let (Some(x), Some(y), Some(scale)) = (avatar_crop_x, avatar_crop_y, avatar_crop_scale) {
        app_specific.insert(
            "avatarCrop".into(),
            serde_json::json!({ "x": x, "y": y, "scale": scale }),
        );
    }

    let export_card = create_persona_uec(
        payload,
        None,
        Some(JsonValue::Object(app_specific)),
        Some(JsonValue::Object(meta)),
        Some(JsonValue::Object(JsonMap::new())),
    );

    let json = serde_json::to_string_pretty(&export_card).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to serialize export: {}", e),
        )
    })?;

    log_info(
        &app,
        "persona_export",
        format!("Successfully exported persona: {}", persona_id),
    );

    Ok(json)
}

/// Import a persona from a JSON package
#[tauri::command]
pub fn persona_import(app: tauri::AppHandle, import_json: String) -> Result<String, String> {
    log_info(&app, "persona_import", "Starting persona import");

    let raw_value: JsonValue = serde_json::from_str(&import_json).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Invalid import data: {}", e),
        )
    })?;
    let package = if looks_like_uec(&raw_value) {
        parse_uec_persona(&raw_value)?
    } else {
        serde_json::from_value::<PersonaExportPackage>(raw_value).map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Invalid import data: {}", e),
            )
        })?
    };

    // Validate version
    if package.version > 1 {
        return Err(format!(
            "Unsupported export version: {}. Please update your app.",
            package.version
        ));
    }

    let mut conn = open_db(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    // Generate new ID for imported persona
    let new_persona_id = uuid::Uuid::new_v4().to_string();
    let now = now_ms() as i64;

    log_info(
        &app,
        "persona_import",
        format!("Importing as new persona: {}", new_persona_id),
    );

    // Save avatar if provided
    let avatar_path = if let Some(ref avatar_base64) = package.avatar_data {
        if is_http_url(avatar_base64) {
            log_info(
                &app,
                "persona_import",
                "Skipping remote avatar URL during import",
            );
            None
        } else {
            match save_avatar_from_base64(
                &app,
                &format!("persona-{}", new_persona_id),
                avatar_base64,
            ) {
                Ok(filename) => Some(filename),
                Err(e) => {
                    log_info(
                        &app,
                        "persona_import",
                        format!("Warning: Failed to import avatar: {}", e),
                    );
                    None
                }
            }
        }
    } else {
        None
    };

    let is_default = package.persona.is_default.unwrap_or(false);
    let (avatar_crop_x, avatar_crop_y, avatar_crop_scale) = package
        .persona
        .avatar_crop
        .as_ref()
        .map(|crop| (Some(crop.x), Some(crop.y), Some(crop.scale)))
        .unwrap_or((None, None, None));
    if is_default {
        tx.execute("UPDATE personas SET is_default = 0", [])
            .map_err(|e| {
                crate::utils::err_msg(
                    module_path!(),
                    line!(),
                    format!("Failed to clear default persona: {}", e),
                )
            })?;
    }

    tx.execute(
        r#"INSERT INTO personas (id, title, description, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        params![
            &new_persona_id,
            &package.persona.title,
            &package.persona.description,
            avatar_path,
            avatar_crop_x,
            avatar_crop_y,
            avatar_crop_scale,
            is_default as i64,
            now,
            now
        ],
    )
    .map_err(|e| crate::utils::err_msg(module_path!(), line!(), format!("Failed to insert persona: {}", e)))?;

    tx.commit()
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    log_info(
        &app,
        "persona_import",
        format!("Successfully imported persona: {}", new_persona_id),
    );

    // Return the new persona as JSON
    let conn2 = open_db(&app)?;
    read_imported_persona(&conn2, &new_persona_id)
}

/// Helper: Read imported persona and return as JSON
fn read_imported_persona(conn: &rusqlite::Connection, persona_id: &str) -> Result<String, String> {
    let (title, description, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, is_default, created_at, updated_at):
        (String, String, Option<String>, Option<f64>, Option<f64>, Option<f64>, i64, i64, i64) =
        conn.query_row(
            "SELECT title, description, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, is_default, created_at, updated_at FROM personas WHERE id = ?",
            params![persona_id],
            |r| Ok((
                r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get::<_, i64>(6)?, r.get(7)?, r.get(8)?
            )),
        )
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;

    let mut root = JsonMap::new();
    root.insert("id".into(), JsonValue::String(persona_id.to_string()));
    root.insert("title".into(), JsonValue::String(title));
    root.insert("description".into(), JsonValue::String(description));
    if let Some(a) = avatar_path {
        root.insert("avatarPath".into(), JsonValue::String(a));
    }
    if let (Some(x), Some(y), Some(scale)) = (avatar_crop_x, avatar_crop_y, avatar_crop_scale) {
        root.insert(
            "avatarCrop".into(),
            serde_json::json!({ "x": x, "y": y, "scale": scale }),
        );
    }
    root.insert("isDefault".into(), JsonValue::Bool(is_default != 0));
    root.insert("createdAt".into(), JsonValue::from(created_at));
    root.insert("updatedAt".into(), JsonValue::from(updated_at));

    serde_json::to_string(&JsonValue::Object(root))
        .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
}

/// Generic import that auto-detects whether it's a character or persona export
/// Returns a JSON object with "importType" field indicating what was imported
#[tauri::command]
pub fn import_package(app: tauri::AppHandle, import_json: String) -> Result<String, String> {
    log_info(&app, "import_package", "Auto-detecting import type");

    let raw_value: JsonValue = serde_json::from_str(&import_json).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Invalid import data: {}", e),
        )
    })?;

    let import_kind = if looks_like_uec(&raw_value) {
        raw_value
            .get("kind")
            .and_then(|value| value.as_str())
            .ok_or_else(|| "Invalid UEC: missing kind".to_string())?
            .to_string()
    } else if let Some(kind) = raw_value.get("type").and_then(|value| value.as_str()) {
        kind.to_string()
    } else if engine::guess_chara_card_format(&raw_value).is_some() {
        "character".to_string()
    } else {
        return Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            "Invalid import: missing type",
        ));
    };

    match import_kind.as_str() {
        "character" => {
            log_info(&app, "import_package", "Detected character export");
            let result = character_import(app, import_json)?;

            let mut result_obj = serde_json::from_str::<JsonMap<String, JsonValue>>(&result)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
            result_obj.insert(
                "importType".into(),
                JsonValue::String("character".to_string()),
            );
            serde_json::to_string(&JsonValue::Object(result_obj))
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
        }
        "persona" => {
            log_info(&app, "import_package", "Detected persona export");
            let result = persona_import(app, import_json)?;

            let mut result_obj = serde_json::from_str::<JsonMap<String, JsonValue>>(&result)
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))?;
            result_obj.insert(
                "importType".into(),
                JsonValue::String("persona".to_string()),
            );
            serde_json::to_string(&JsonValue::Object(result_obj))
                .map_err(|e| crate::utils::err_to_string(module_path!(), line!(), e))
        }
        _ => Err(crate::utils::err_msg(
            module_path!(),
            line!(),
            "Unsupported import type",
        )),
    }
}

#[tauri::command]
pub fn save_json_to_downloads(
    app: tauri::AppHandle,
    filename: String,
    json_content: String,
) -> Result<String, String> {
    log_info(
        &app,
        "save_json_to_downloads",
        format!("Saving file to downloads: {}", filename),
    );

    #[cfg(target_os = "android")]
    let download_dir = {
        use std::path::PathBuf;
        PathBuf::from("/storage/emulated/0/Download")
    };

    #[cfg(not(target_os = "android"))]
    let download_dir = app.path().download_dir().map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to get downloads directory: {}", e),
        )
    })?;

    if !download_dir.exists() {
        fs::create_dir_all(&download_dir).map_err(|e| {
            crate::utils::err_msg(
                module_path!(),
                line!(),
                format!("Failed to create downloads directory: {}", e),
            )
        })?;
    }

    let file_path = download_dir.join(&filename);

    fs::write(&file_path, json_content.as_bytes()).map_err(|e| {
        crate::utils::err_msg(
            module_path!(),
            line!(),
            format!("Failed to write file: {}", e),
        )
    })?;

    let path_str = file_path
        .to_str()
        .ok_or_else(|| "Invalid path".to_string())?
        .to_string();

    log_info(
        &app,
        "save_json_to_downloads",
        format!("Successfully saved file to: {}", path_str),
    );

    Ok(path_str)
}
