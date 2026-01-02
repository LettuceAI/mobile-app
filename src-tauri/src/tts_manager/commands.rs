use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::params;
use std::collections::HashMap;
use tauri::AppHandle;

use super::types::{
    AudioModel, AudioProvider, AudioProviderType, CachedVoice, CreatedVoiceResult,
    TtsPreviewResponse, UserVoice, VoiceDesignPreview,
};
use super::{elevenlabs, gemini};
use crate::abort_manager::AbortRegistry;
use crate::storage_manager::db::{now_ms, open_db};

/// List all audio providers
#[tauri::command]
pub fn audio_provider_list(app: AppHandle) -> Result<Vec<AudioProvider>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, provider_type, label, api_key, project_id, location, created_at, updated_at
             FROM audio_providers ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let providers = stmt
        .query_map([], |row| {
            Ok(AudioProvider {
                id: row.get(0)?,
                provider_type: row.get(1)?,
                label: row.get(2)?,
                api_key: row.get(3)?,
                project_id: row.get(4)?,
                location: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(providers)
}

/// Create or update an audio provider
#[tauri::command]
pub fn audio_provider_upsert(
    app: AppHandle,
    provider_json: String,
) -> Result<AudioProvider, String> {
    let provider: AudioProvider =
        serde_json::from_str(&provider_json).map_err(|e| format!("Invalid JSON: {}", e))?;

    let conn = open_db(&app)?;
    let now = now_ms();

    let id = if provider.id.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        provider.id.clone()
    };

    let location = provider
        .location
        .clone()
        .unwrap_or_else(|| "us-central1".to_string());

    conn.execute(
        "INSERT INTO audio_providers (id, provider_type, label, api_key, project_id, location, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(id) DO UPDATE SET
            provider_type = excluded.provider_type,
            label = excluded.label,
            api_key = excluded.api_key,
            project_id = excluded.project_id,
            location = excluded.location,
            updated_at = excluded.updated_at",
        params![
            id,
            provider.provider_type,
            provider.label,
            provider.api_key,
            provider.project_id,
            location,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(AudioProvider {
        id,
        provider_type: provider.provider_type,
        label: provider.label,
        api_key: provider.api_key,
        project_id: provider.project_id,
        location: provider.location,
        created_at: now,
        updated_at: now,
    })
}

/// Delete an audio provider
#[tauri::command]
pub fn audio_provider_delete(app: AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM audio_providers WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Get models for a provider type
#[tauri::command]
pub fn audio_models_list(provider_type: String) -> Vec<AudioModel> {
    match AudioProviderType::from_str(&provider_type) {
        Some(AudioProviderType::GeminiTts) => gemini::get_models(),
        Some(AudioProviderType::Elevenlabs) => elevenlabs::get_models(),
        None => vec![],
    }
}

#[tauri::command]
pub fn audio_voice_design_models_list(provider_type: String) -> Vec<AudioModel> {
    match AudioProviderType::from_str(&provider_type) {
        Some(AudioProviderType::GeminiTts) => gemini::get_models(),
        Some(AudioProviderType::Elevenlabs) => elevenlabs::get_voice_design_models(),
        None => vec![],
    }
}

/// Get cached voices for a provider
#[tauri::command]
pub fn audio_provider_voices(
    app: AppHandle,
    provider_id: String,
) -> Result<Vec<CachedVoice>, String> {
    let conn = open_db(&app)?;

    // First get the provider type
    let provider_type: String = conn
        .query_row(
            "SELECT provider_type FROM audio_providers WHERE id = ?",
            params![provider_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Provider not found: {}", e))?;

    // For Gemini, return hardcoded voices
    if provider_type == "gemini_tts" {
        let now = now_ms();
        return Ok(gemini::get_voices()
            .into_iter()
            .map(|v| CachedVoice {
                id: format!("{}:{}", provider_id, v.voice_id),
                provider_id: provider_id.clone(),
                voice_id: v.voice_id,
                name: v.name,
                preview_url: v.preview_url,
                labels: v.labels,
                cached_at: now,
            })
            .collect());
    }

    // For ElevenLabs, return cached voices
    let mut stmt = conn
        .prepare(
            "SELECT id, provider_id, voice_id, name, preview_url, labels, cached_at
             FROM audio_voice_cache WHERE provider_id = ?",
        )
        .map_err(|e| e.to_string())?;

    let voices = stmt
        .query_map(params![provider_id], |row| {
            let labels_json: Option<String> = row.get(5)?;
            let labels: HashMap<String, String> = labels_json
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            Ok(CachedVoice {
                id: row.get(0)?,
                provider_id: row.get(1)?,
                voice_id: row.get(2)?,
                name: row.get(3)?,
                preview_url: row.get(4)?,
                labels,
                cached_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(voices)
}

/// Refresh voices from API (ElevenLabs only)
#[tauri::command]
pub async fn audio_provider_refresh_voices(
    app: AppHandle,
    provider_id: String,
) -> Result<Vec<CachedVoice>, String> {
    let conn = open_db(&app)?;

    // Get provider details
    let (provider_type, api_key): (String, Option<String>) = conn
        .query_row(
            "SELECT provider_type, api_key FROM audio_providers WHERE id = ?",
            params![provider_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Provider not found: {}", e))?;

    // Gemini uses hardcoded voices
    if provider_type == "gemini_tts" {
        return audio_provider_voices(app, provider_id);
    }

    // ElevenLabs - fetch from API
    let api_key = api_key.ok_or("API key not configured")?;
    let voices = elevenlabs::fetch_voices(&api_key, None).await?;

    // Clear old cache and insert new voices
    let now = now_ms();
    conn.execute(
        "DELETE FROM audio_voice_cache WHERE provider_id = ?",
        params![provider_id],
    )
    .map_err(|e| e.to_string())?;

    let mut cached = Vec::new();
    for v in voices {
        let id = format!("{}:{}", provider_id, v.voice_id);
        let labels_json = serde_json::to_string(&v.labels).unwrap_or_default();

        conn.execute(
            "INSERT INTO audio_voice_cache (id, provider_id, voice_id, name, preview_url, labels, cached_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![id, provider_id, v.voice_id, v.name, v.preview_url, labels_json, now],
        )
        .map_err(|e| e.to_string())?;

        cached.push(CachedVoice {
            id,
            provider_id: provider_id.clone(),
            voice_id: v.voice_id,
            name: v.name,
            preview_url: v.preview_url,
            labels: v.labels,
            cached_at: now,
        });
    }

    Ok(cached)
}

/// List user voice configurations
#[tauri::command]
pub fn user_voice_list(app: AppHandle) -> Result<Vec<UserVoice>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, provider_id, name, model_id, voice_id, prompt, created_at, updated_at
             FROM user_voices ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let voices = stmt
        .query_map([], |row| {
            Ok(UserVoice {
                id: row.get(0)?,
                provider_id: row.get(1)?,
                name: row.get(2)?,
                model_id: row.get(3)?,
                voice_id: row.get(4)?,
                prompt: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(voices)
}

/// Create or update a user voice configuration
#[tauri::command]
pub fn user_voice_upsert(app: AppHandle, voice_json: String) -> Result<UserVoice, String> {
    let voice: UserVoice =
        serde_json::from_str(&voice_json).map_err(|e| format!("Invalid JSON: {}", e))?;

    let conn = open_db(&app)?;
    let now = now_ms();

    let id = if voice.id.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        voice.id.clone()
    };

    conn.execute(
        "INSERT INTO user_voices (id, provider_id, name, model_id, voice_id, prompt, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(id) DO UPDATE SET
            provider_id = excluded.provider_id,
            name = excluded.name,
            model_id = excluded.model_id,
            voice_id = excluded.voice_id,
            prompt = excluded.prompt,
            updated_at = excluded.updated_at",
        params![
            id,
            voice.provider_id,
            voice.name,
            voice.model_id,
            voice.voice_id,
            voice.prompt,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(UserVoice {
        id,
        provider_id: voice.provider_id,
        name: voice.name,
        model_id: voice.model_id,
        voice_id: voice.voice_id,
        prompt: voice.prompt,
        created_at: now,
        updated_at: now,
    })
}

/// Delete a user voice configuration
#[tauri::command]
pub fn user_voice_delete(app: AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM user_voices WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Generate TTS preview audio
#[tauri::command]
pub async fn tts_preview(
    app: AppHandle,
    provider_id: String,
    model_id: String,
    voice_id: String,
    prompt: Option<String>,
    text: String,
    request_id: Option<String>,
) -> Result<TtsPreviewResponse, String> {
    let conn = open_db(&app)?;

    // Get provider details
    let (provider_type, api_key, project_id, location): (
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT provider_type, api_key, project_id, location FROM audio_providers WHERE id = ?",
            params![provider_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Provider not found: {}", e))?;

    let api_key = api_key.ok_or("API key not configured")?;

    let mut abort_rx = request_id.as_ref().map(|id| {
        use tauri::Manager;
        let registry = app.state::<AbortRegistry>();
        registry.register(id.clone())
    });

    let generate_audio = async {
        match provider_type.as_str() {
            "gemini_tts" => {
                let project_id = project_id.ok_or("Project ID required for Gemini TTS")?;
                let data = gemini::generate_speech(
                    &text,
                    &voice_id,
                    &model_id,
                    prompt.as_deref(),
                    &api_key,
                    &project_id,
                    location.as_deref(),
                )
                .await?;
                Ok((data, "audio/wav".to_string()))
            }
            "elevenlabs" => {
                let data =
                    elevenlabs::generate_speech(&text, &voice_id, &model_id, &api_key).await?;
                Ok((data, "audio/mpeg".to_string()))
            }
            _ => Err(format!("Unknown provider type: {}", provider_type)),
        }
    };

    let result = if let Some(rx) = abort_rx.as_mut() {
        tokio::select! {
            _ = rx => {
                if let Some(id) = request_id.as_ref() {
                    use tauri::Manager;
                    let registry = app.state::<AbortRegistry>();
                    registry.unregister(id);
                }
                return Err("Request aborted by user".to_string());
            }
            value = generate_audio => value,
        }
    } else {
        generate_audio.await
    };

    if let Some(id) = request_id.as_ref() {
        use tauri::Manager;
        let registry = app.state::<AbortRegistry>();
        registry.unregister(id);
    }

    let (audio_data, format) = result?;

    let audio_base64 = STANDARD.encode(&audio_data);

    Ok(TtsPreviewResponse {
        audio_base64,
        format,
    })
}

/// Verify API key for audio provider
#[tauri::command]
pub async fn audio_provider_verify(
    provider_type: String,
    api_key: String,
    project_id: Option<String>,
) -> Result<bool, String> {
    match provider_type.as_str() {
        "gemini_tts" => {
            let project_id = project_id.ok_or("Project ID required for Gemini TTS")?;
            gemini::verify_api_key(&api_key, &project_id).await
        }
        "elevenlabs" => elevenlabs::verify_api_key(&api_key).await,
        _ => Err(format!("Unknown provider type: {}", provider_type)),
    }
}

/// Search voices from ElevenLabs library
#[tauri::command]
pub async fn audio_provider_search_voices(
    app: AppHandle,
    provider_id: String,
    search: String,
) -> Result<Vec<CachedVoice>, String> {
    let conn = open_db(&app)?;

    let (provider_type, api_key): (String, Option<String>) = conn
        .query_row(
            "SELECT provider_type, api_key FROM audio_providers WHERE id = ?",
            params![provider_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Provider not found: {}", e))?;

    if provider_type != "elevenlabs" {
        return Err("Voice search only available for ElevenLabs".to_string());
    }

    let api_key = api_key.ok_or("API key not configured")?;
    let voices = elevenlabs::fetch_voices(&api_key, Some(&search)).await?;

    let now = now_ms();
    Ok(voices
        .into_iter()
        .map(|v| CachedVoice {
            id: format!("{}:{}", provider_id, v.voice_id),
            provider_id: provider_id.clone(),
            voice_id: v.voice_id,
            name: v.name,
            preview_url: v.preview_url,
            labels: v.labels,
            cached_at: now,
        })
        .collect())
}

/// Design a voice from text description (ElevenLabs only)
#[tauri::command]
pub async fn voice_design_preview(
    app: AppHandle,
    provider_id: String,
    text_sample: String,
    voice_description: String,
    model_id: Option<String>,
    num_previews: Option<u32>,
) -> Result<Vec<VoiceDesignPreview>, String> {
    let conn = open_db(&app)?;

    let (provider_type, api_key): (String, Option<String>) = conn
        .query_row(
            "SELECT provider_type, api_key FROM audio_providers WHERE id = ?",
            params![provider_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Provider not found: {}", e))?;

    if provider_type != "elevenlabs" {
        return Err("Voice design only available for ElevenLabs".to_string());
    }

    let api_key = api_key.ok_or("API key not configured")?;
    let previews = elevenlabs::design_voice(
        &api_key,
        &text_sample,
        &voice_description,
        model_id.as_deref(),
        num_previews,
    )
    .await?;

    Ok(previews
        .into_iter()
        .map(|p| VoiceDesignPreview {
            generated_voice_id: p.generated_voice_id,
            audio_base64: p.audio_base_64,
            duration_secs: p.duration_secs,
            media_type: p.media_type,
        })
        .collect())
}

/// Create and save a voice from a design preview (ElevenLabs only)
#[tauri::command]
pub async fn voice_design_create(
    app: AppHandle,
    provider_id: String,
    voice_name: String,
    generated_voice_id: String,
    voice_description: Option<String>,
) -> Result<CreatedVoiceResult, String> {
    let conn = open_db(&app)?;

    let (provider_type, api_key): (String, Option<String>) = conn
        .query_row(
            "SELECT provider_type, api_key FROM audio_providers WHERE id = ?",
            params![provider_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Provider not found: {}", e))?;

    if provider_type != "elevenlabs" {
        return Err("Voice creation only available for ElevenLabs".to_string());
    }

    let api_key = api_key.ok_or("API key not configured")?;
    let result = elevenlabs::create_voice_from_preview(
        &api_key,
        &voice_name,
        &generated_voice_id,
        voice_description.as_deref(),
        None,
    )
    .await?;

    Ok(CreatedVoiceResult {
        voice_id: result.voice_id,
    })
}
