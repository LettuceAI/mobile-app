use base64::{engine::general_purpose, Engine as _};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
#[cfg(not(target_os = "android"))]
use machine_uid::get as get_machine_uid;
use rand::rngs::OsRng;
use rand::RngCore;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::fs;
use std::path::PathBuf;

use crate::utils::{ensure_lettuce_dir, log_debug, log_info, log_warn, now_millis};

const SETTINGS_FILE: &str = "settings.bin";
const CHARACTERS_FILE: &str = "characters.bin";

fn storage_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    ensure_lettuce_dir(app)
}

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join("app.db"))
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", &true)
        .map_err(|e| e.to_string())?;
    init_db(&conn)?;
    Ok(conn)
}

fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY CHECK(id=1),
          default_provider_credential_id TEXT,
          default_model_id TEXT,
          app_state TEXT NOT NULL DEFAULT '{}',
          advanced_model_settings TEXT,
          prompt_template_id TEXT,
          system_prompt TEXT,
          migration_version INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_credentials (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          label TEXT NOT NULL,
          api_key_ref TEXT,
          base_url TEXT,
          default_model TEXT,
          headers TEXT
        );

        CREATE TABLE IF NOT EXISTS models (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          provider_label TEXT NOT NULL,
          display_name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          advanced_model_settings TEXT,
          prompt_template_id TEXT,
          system_prompt TEXT
        );

        -- Characters
        CREATE TABLE IF NOT EXISTS characters (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          avatar_path TEXT,
          background_image_path TEXT,
          description TEXT,
          default_scene_id TEXT,
          default_model_id TEXT,
          prompt_template_id TEXT,
          system_prompt TEXT,
          disable_avatar_gradient INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS character_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          character_id TEXT NOT NULL,
          idx INTEGER NOT NULL,
          rule TEXT NOT NULL,
          FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS scenes (
          id TEXT PRIMARY KEY,
          character_id TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          selected_variant_id TEXT,
          FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS scene_variants (
          id TEXT PRIMARY KEY,
          scene_id TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
        );

        -- Personas
        CREATE TABLE IF NOT EXISTS personas (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          avatar_path TEXT,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        -- Sessions and messages
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          character_id TEXT NOT NULL,
          title TEXT NOT NULL,
          system_prompt TEXT,
          selected_scene_id TEXT,
          persona_id TEXT,
          temperature REAL,
          top_p REAL,
          max_output_tokens INTEGER,
          frequency_penalty REAL,
          presence_penalty REAL,
          top_k INTEGER,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE,
          FOREIGN KEY(persona_id) REFERENCES personas(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          total_tokens INTEGER,
          selected_variant_id TEXT,
          is_pinned INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS message_variants (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          total_tokens INTEGER,
          FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
        );
        "#,
    )
    .map_err(|e| e.to_string())
}

fn now_ms() -> u64 {
    now_millis().unwrap_or(0)
}

fn db_read_settings_json(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let conn = open_db(app)?;

    // Check if we have any data
    let exists: Option<i64> = conn
        .query_row("SELECT COUNT(*) FROM settings", [], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if exists.unwrap_or(0) == 0 {
        return Ok(None);
    }

    // Load settings row
    let row = conn
        .query_row(
            "SELECT default_provider_credential_id, default_model_id, app_state, advanced_model_settings, prompt_template_id, system_prompt, migration_version FROM settings WHERE id = 1",
            [],
            |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, i64>(6)? as u32,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let (
        default_provider_credential_id,
        default_model_id,
        app_state_json,
        advanced_model_settings_json,
        prompt_template_id,
        system_prompt,
        migration_version,
    ) = match row {
        Some(v) => v,
        None => return Ok(None),
    };

    // Load provider credentials
    let mut stmt = conn
        .prepare(
            "SELECT id, provider_id, label, api_key_ref, base_url, default_model, headers FROM provider_credentials",
        )
        .map_err(|e| e.to_string())?;
    let creds_iter = stmt
        .query_map([], |r| {
            let id: String = r.get(0)?;
            let provider_id: String = r.get(1)?;
            let label: String = r.get(2)?;
            let api_key_ref: Option<String> = r.get(3)?;
            let base_url: Option<String> = r.get(4)?;
            let default_model: Option<String> = r.get(5)?;
            let headers: Option<String> = r.get(6)?;

            let mut obj = JsonMap::new();
            obj.insert("id".into(), JsonValue::String(id));
            obj.insert("providerId".into(), JsonValue::String(provider_id));
            obj.insert("label".into(), JsonValue::String(label));
            if let Some(s) = api_key_ref {
                if let Ok(v) = serde_json::from_str::<JsonValue>(&s) {
                    if !v.is_null() {
                        obj.insert("apiKeyRef".into(), v);
                    }
                }
            }
            if let Some(s) = base_url {
                obj.insert("baseUrl".into(), JsonValue::String(s));
            }
            if let Some(s) = default_model {
                obj.insert("defaultModel".into(), JsonValue::String(s));
            }
            if let Some(s) = headers {
                if let Ok(v) = serde_json::from_str::<JsonValue>(&s) {
                    if !v.is_null() {
                        obj.insert("headers".into(), v);
                    }
                }
            }
            Ok(JsonValue::Object(obj))
        })
        .map_err(|e| e.to_string())?;
    let mut provider_credentials: Vec<JsonValue> = Vec::new();
    for item in creds_iter {
        provider_credentials.push(item.map_err(|e| e.to_string())?);
    }

    // Load models
    let mut stmt = conn
        .prepare(
            "SELECT id, name, provider_id, provider_label, display_name, created_at, advanced_model_settings, prompt_template_id, system_prompt FROM models ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let models_iter = stmt
        .query_map([], |r| {
            let id: String = r.get(0)?;
            let name: String = r.get(1)?;
            let provider_id: String = r.get(2)?;
            let provider_label: String = r.get(3)?;
            let display_name: String = r.get(4)?;
            let created_at: i64 = r.get(5)?;
            let advanced: Option<String> = r.get(6)?;
            let prompt_template_id: Option<String> = r.get(7)?;
            let system_prompt: Option<String> = r.get(8)?;

            let mut obj = JsonMap::new();
            obj.insert("id".into(), JsonValue::String(id));
            obj.insert("name".into(), JsonValue::String(name));
            obj.insert("providerId".into(), JsonValue::String(provider_id));
            obj.insert("providerLabel".into(), JsonValue::String(provider_label));
            obj.insert("displayName".into(), JsonValue::String(display_name));
            obj.insert("createdAt".into(), JsonValue::from(created_at));
            if let Some(s) = advanced {
                if let Ok(v) = serde_json::from_str::<JsonValue>(&s) {
                    obj.insert("advancedModelSettings".into(), v);
                }
            }
            if let Some(s) = prompt_template_id {
                obj.insert("promptTemplateId".into(), JsonValue::String(s));
            }
            if let Some(s) = system_prompt {
                obj.insert("systemPrompt".into(), JsonValue::String(s));
            }
            Ok(JsonValue::Object(obj))
        })
        .map_err(|e| e.to_string())?;
    let mut models: Vec<JsonValue> = Vec::new();
    for item in models_iter {
        models.push(item.map_err(|e| e.to_string())?);
    }

    // Parse JSON strings back into JSON values where relevant
    let app_state: JsonValue = serde_json::from_str(&app_state_json).unwrap_or_else(|_| serde_json::json!({
        "onboarding": {"completed": false, "skipped": false, "providerSetupCompleted": false, "modelSetupCompleted": false},
        "theme": "light",
        "tooltips": {},
        "pureModeEnabled": true
    }));
    // Build settings object while omitting null-unsafe optional fields
    let mut root = JsonMap::new();
    root.insert("$version".into(), JsonValue::from(2));
    root.insert(
        "defaultProviderCredentialId".into(),
        default_provider_credential_id
            .map(JsonValue::String)
            .unwrap_or(JsonValue::Null),
    );
    root.insert(
        "defaultModelId".into(),
        default_model_id
            .map(JsonValue::String)
            .unwrap_or(JsonValue::Null),
    );
    root.insert(
        "providerCredentials".into(),
        JsonValue::Array(provider_credentials),
    );
    root.insert("models".into(), JsonValue::Array(models));
    root.insert("appState".into(), app_state);
    if let Some(s) = advanced_model_settings_json {
        if let Ok(v) = serde_json::from_str::<JsonValue>(&s) {
            if !v.is_null() {
                root.insert("advancedModelSettings".into(), v);
            }
        }
    }
    if let Some(id) = prompt_template_id {
        root.insert("promptTemplateId".into(), JsonValue::String(id));
    }
    if let Some(sp) = system_prompt {
        root.insert("systemPrompt".into(), JsonValue::String(sp));
    }
    root.insert(
        "migrationVersion".into(),
        JsonValue::from(migration_version),
    );

    Ok(Some(
        serde_json::to_string(&JsonValue::Object(root)).map_err(|e| e.to_string())?,
    ))
}

fn db_write_settings_json(app: &tauri::AppHandle, data: String) -> Result<(), String> {
    let mut conn = open_db(app)?;
    let now = now_ms() as i64;

    let json: JsonValue = serde_json::from_str(&data).map_err(|e| e.to_string())?;

    let default_provider_credential_id = json
        .get("defaultProviderCredentialId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let default_model_id = json
        .get("defaultModelId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let app_state_str = json
        .get("appState")
        .map(|v| serde_json::to_string(v).unwrap_or("{}".into()))
        .unwrap_or("{}".into());
    let adv_settings_str = json.get("advancedModelSettings").and_then(|v| {
        if v.is_null() {
            None
        } else {
            Some(serde_json::to_string(v).unwrap_or("null".into()))
        }
    });
    let prompt_template_id = json
        .get("promptTemplateId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let system_prompt = json
        .get("systemPrompt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let migration_version = json
        .get("migrationVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as i64;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Upsert settings (id=1)
    tx.execute(
        r#"INSERT INTO settings (id, default_provider_credential_id, default_model_id, app_state, advanced_model_settings, prompt_template_id, system_prompt, migration_version, created_at, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              default_provider_credential_id=excluded.default_provider_credential_id,
              default_model_id=excluded.default_model_id,
              app_state=excluded.app_state,
              advanced_model_settings=excluded.advanced_model_settings,
              prompt_template_id=excluded.prompt_template_id,
              system_prompt=excluded.system_prompt,
              migration_version=excluded.migration_version,
              updated_at=excluded.updated_at
        "#,
        params![
            default_provider_credential_id,
            default_model_id,
            app_state_str,
            adv_settings_str,
            prompt_template_id,
            system_prompt,
            migration_version,
            now,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Replace provider_credentials
    tx.execute("DELETE FROM provider_credentials", [])
        .map_err(|e| e.to_string())?;
    if let Some(creds) = json.get("providerCredentials").and_then(|v| v.as_array()) {
        for c in creds {
            let id = c.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let provider_id = c.get("providerId").and_then(|v| v.as_str()).unwrap_or("");
            let label = c.get("label").and_then(|v| v.as_str()).unwrap_or("");
            let api_key_ref = c
                .get("apiKeyRef")
                .map(|v| serde_json::to_string(v).unwrap_or("null".into()));
            let base_url = c
                .get("baseUrl")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let default_model = c
                .get("defaultModel")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let headers = c
                .get("headers")
                .map(|v| serde_json::to_string(v).unwrap_or("null".into()));
            tx.execute(
                "INSERT INTO provider_credentials (id, provider_id, label, api_key_ref, base_url, default_model, headers) VALUES (?, ?, ?, ?, ?, ?, ?)",
                params![id, provider_id, label, api_key_ref, base_url, default_model, headers],
            ).map_err(|e| e.to_string())?;
        }
    }

    // Replace models
    tx.execute("DELETE FROM models", [])
        .map_err(|e| e.to_string())?;
    if let Some(models) = json.get("models").and_then(|v| v.as_array()) {
        for m in models {
            let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let provider_id = m.get("providerId").and_then(|v| v.as_str()).unwrap_or("");
            let provider_label = m
                .get("providerLabel")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let display_name = m
                .get("displayName")
                .and_then(|v| v.as_str())
                .unwrap_or(name);
            let created_at = m.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(now);
            let adv = m
                .get("advancedModelSettings")
                .map(|v| serde_json::to_string(v).unwrap_or("null".into()));
            let prompt_template_id = m
                .get("promptTemplateId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let system_prompt = m
                .get("systemPrompt")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            tx.execute(
                "INSERT INTO models (id, name, provider_id, provider_label, display_name, created_at, advanced_model_settings, prompt_template_id, system_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![id, name, provider_id, provider_label, display_name, created_at, adv, prompt_template_id, system_prompt],
            ).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())
}

fn ensure_settings_row(conn: &Connection) -> Result<(), String> {
    let now = now_ms() as i64;
    conn.execute(
        r#"INSERT INTO settings (id, app_state, created_at, updated_at)
            VALUES (1, '{}', ?, ?)
            ON CONFLICT(id) DO NOTHING"#,
        params![now, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join(SETTINGS_FILE))
}

fn characters_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join(CHARACTERS_FILE))
}

// Legacy personas/sessions index paths removed (now stored in SQLite)

// Legacy session file path removed (sessions are stored in SQLite)

fn derive_key() -> Result<[u8; 32], String> {
    let machine_id = {
        #[cfg(not(target_os = "android"))]
        {
            get_machine_uid().unwrap_or_else(|_| {
                format!(
                    "{}|{}|{}",
                    whoami::username(),
                    whoami::fallible::hostname().unwrap_or_else(|_| "unknown-host".into()),
                    std::env::consts::OS
                )
            })
        }
        #[cfg(target_os = "android")]
        {
            format!(
                "{}|{}|{}",
                whoami::username(),
                whoami::fallible::hostname().unwrap_or_else(|_| "unknown-host".into()),
                std::env::consts::OS
            )
        }
    };
    let mut hasher = blake3::Hasher::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(b"lettuceai.storage.v1");
    let hash = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(hash.as_bytes());
    Ok(key)
}

fn encrypt(content: &[u8]) -> Result<Vec<u8>, String> {
    let key = derive_key()?;
    let cipher = XChaCha20Poly1305::new(&key.into());
    let mut nonce_bytes = [0u8; 24];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from(nonce_bytes);
    let mut out = Vec::with_capacity(24 + content.len() + 16);
    let ciphertext = cipher
        .encrypt(&nonce, content)
        .map_err(|e| format!("encrypt: {e}"))?;
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 24 {
        return Err("corrupted data".into());
    }
    let (nonce_bytes, ciphertext) = data.split_at(24);
    let key = derive_key()?;
    let cipher = XChaCha20Poly1305::new(&key.into());
    let nonce = XNonce::from(*<&[u8; 24]>::try_from(nonce_bytes).map_err(|_| "invalid nonce")?);
    cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|e| format!("decrypt: {e}"))
}

fn read_encrypted_file(path: &PathBuf) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Ok(None);
    }
    let decrypted = decrypt(&bytes)?;
    let text = String::from_utf8(decrypted).map_err(|e| e.to_string())?;
    if text.is_empty() {
        Ok(None)
    } else {
        Ok(Some(text))
    }
}

fn write_encrypted_file(path: &PathBuf, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = encrypt(content.as_bytes())?;
    fs::write(path, bytes).map_err(|e| e.to_string())
}

fn delete_file_if_exists(path: &PathBuf) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn storage_read_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
    // Try DB first
    match db_read_settings_json(&app)? {
        some @ Some(_) => return Ok(some),
        None => {}
    }

    // Fallback: migrate from legacy encrypted file if present
    let path = settings_path(&app)?;
    if let Some(json) = read_encrypted_file(&path)? {
        // Store into DB for future reads
        let _ = db_write_settings_json(&app, json.clone());
        return db_read_settings_json(&app);
    }

    Ok(None)
}

#[tauri::command]
pub fn storage_write_settings(app: tauri::AppHandle, data: String) -> Result<(), String> {
    // Persist to SQLite (normalized)
    db_write_settings_json(&app, data)
}

#[tauri::command]
pub fn settings_set_defaults(
    app: tauri::AppHandle,
    default_provider_credential_id: Option<String>,
    default_model_id: Option<String>,
) -> Result<(), String> {
    let conn = open_db(&app)?;
    ensure_settings_row(&conn)?;
    let now = now_ms() as i64;
    conn.execute(
        "UPDATE settings SET default_provider_credential_id = ?, default_model_id = ?, updated_at = ? WHERE id = 1",
        params![default_provider_credential_id, default_model_id, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn provider_upsert(app: tauri::AppHandle, credential_json: String) -> Result<String, String> {
    let conn = open_db(&app)?;
    let cred: JsonValue = serde_json::from_str(&credential_json).map_err(|e| e.to_string())?;

    let id = cred
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let provider_id = cred
        .get("providerId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "providerId is required".to_string())?;
    let label = cred
        .get("label")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "label is required".to_string())?;

    let api_key_ref = cred
        .get("apiKeyRef")
        .map(|v| serde_json::to_string(v).unwrap_or("null".into()));
    let base_url = cred
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let default_model = cred
        .get("defaultModel")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let headers = cred
        .get("headers")
        .map(|v| serde_json::to_string(v).unwrap_or("null".into()));

    conn.execute(
        r#"INSERT INTO provider_credentials (id, provider_id, label, api_key_ref, base_url, default_model, headers)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                provider_id = excluded.provider_id,
                label = excluded.label,
                api_key_ref = excluded.api_key_ref,
                base_url = excluded.base_url,
                default_model = excluded.default_model,
                headers = excluded.headers"#,
        params![id, provider_id, label, api_key_ref, base_url, default_model, headers],
    )
    .map_err(|e| e.to_string())?;

    let mut out = JsonMap::new();
    out.insert("id".into(), JsonValue::String(id));
    out.insert(
        "providerId".into(),
        JsonValue::String(provider_id.to_string()),
    );
    out.insert("label".into(), JsonValue::String(label.to_string()));
    if let Some(v) = cred.get("apiKeyRef").cloned() {
        if !v.is_null() {
            out.insert("apiKeyRef".into(), v);
        }
    }
    if let Some(v) = cred
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .map(|s| JsonValue::String(s.to_string()))
    {
        out.insert("baseUrl".into(), v);
    }
    if let Some(v) = cred
        .get("defaultModel")
        .and_then(|v| v.as_str())
        .map(|s| JsonValue::String(s.to_string()))
    {
        out.insert("defaultModel".into(), v);
    }
    if let Some(v) = cred.get("headers").cloned() {
        if !v.is_null() {
            out.insert("headers".into(), v);
        }
    }
    Ok(serde_json::to_string(&JsonValue::Object(out)).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn provider_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM provider_credentials WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn model_upsert(app: tauri::AppHandle, model_json: String) -> Result<String, String> {
    let conn = open_db(&app)?;
    let model: JsonValue = serde_json::from_str(&model_json).map_err(|e| e.to_string())?;

    let id = model
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let name = model
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "name is required".to_string())?;
    let provider_id = model
        .get("providerId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "providerId is required".to_string())?;
    let provider_label = model
        .get("providerLabel")
        .and_then(|v| v.as_str())
        .unwrap_or(provider_id);
    let display_name = model
        .get("displayName")
        .and_then(|v| v.as_str())
        .unwrap_or(name);
    let adv = model
        .get("advancedModelSettings")
        .map(|v| serde_json::to_string(v).unwrap_or("null".into()));
    let prompt_template_id = model
        .get("promptTemplateId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let system_prompt = model
        .get("systemPrompt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Preserve created_at for updates
    let existing_created: Option<i64> = conn
        .query_row(
            "SELECT created_at FROM models WHERE id = ?",
            params![&id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let created_at = existing_created.unwrap_or(now_ms() as i64);

    conn.execute(
        r#"INSERT INTO models (id, name, provider_id, provider_label, display_name, created_at, advanced_model_settings, prompt_template_id, system_prompt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,
              provider_id=excluded.provider_id,
              provider_label=excluded.provider_label,
              display_name=excluded.display_name,
              advanced_model_settings=excluded.advanced_model_settings,
              prompt_template_id=excluded.prompt_template_id,
              system_prompt=excluded.system_prompt"#,
        params![id, name, provider_id, provider_label, display_name, created_at, adv, prompt_template_id, system_prompt],
    )
    .map_err(|e| e.to_string())?;

    let mut out = JsonMap::new();
    out.insert("id".into(), JsonValue::String(id));
    out.insert("name".into(), JsonValue::String(name.to_string()));
    out.insert(
        "providerId".into(),
        JsonValue::String(provider_id.to_string()),
    );
    out.insert(
        "providerLabel".into(),
        JsonValue::String(provider_label.to_string()),
    );
    out.insert(
        "displayName".into(),
        JsonValue::String(display_name.to_string()),
    );
    out.insert("createdAt".into(), JsonValue::from(created_at));
    if let Some(v) = model.get("advancedModelSettings").cloned() {
        if !v.is_null() {
            out.insert("advancedModelSettings".into(), v);
        }
    }
    if let Some(v) = model
        .get("promptTemplateId")
        .and_then(|v| v.as_str())
        .map(|s| JsonValue::String(s.to_string()))
    {
        out.insert("promptTemplateId".into(), v);
    }
    if let Some(v) = model
        .get("systemPrompt")
        .and_then(|v| v.as_str())
        .map(|s| JsonValue::String(s.to_string()))
    {
        out.insert("systemPrompt".into(), v);
    }
    Ok(serde_json::to_string(&JsonValue::Object(out)).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn model_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM models WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn settings_set_advanced_model_settings(
    app: tauri::AppHandle,
    advanced_json: String,
) -> Result<(), String> {
    let conn = open_db(&app)?;
    ensure_settings_row(&conn)?;
    let now = now_ms() as i64;

    // Treat "null" or empty as NULL in DB
    let db_val: Option<String> = {
        let s = advanced_json.trim();
        if s.is_empty() || s == "null" {
            None
        } else {
            Some(s.to_string())
        }
    };

    conn.execute(
        "UPDATE settings SET advanced_model_settings = ?, updated_at = ? WHERE id = 1",
        params![db_val, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ========== Characters ==========

fn read_character(conn: &Connection, id: &str) -> Result<JsonValue, String> {
    let (name, avatar_path, bg_path, description, default_scene_id, default_model_id, prompt_template_id, system_prompt, disable_avatar_gradient, created_at, updated_at): (String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64, i64) = conn
        .query_row(
            "SELECT name, avatar_path, background_image_path, description, default_scene_id, default_model_id, prompt_template_id, system_prompt, disable_avatar_gradient, created_at, updated_at FROM characters WHERE id = ?",
            params![id],
            |r| Ok((
                r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get::<_, i64>(8)?, r.get(9)?, r.get(10)?
            )),
        )
        .map_err(|e| e.to_string())?;

    let mut rules: Vec<JsonValue> = Vec::new();
    let mut stmt = conn
        .prepare("SELECT rule FROM character_rules WHERE character_id = ? ORDER BY idx ASC")
        .map_err(|e| e.to_string())?;
    let q = stmt
        .query_map(params![id], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| e.to_string())?;
    for it in q {
        rules.push(JsonValue::String(it.map_err(|e| e.to_string())?));
    }

    // scenes
    let mut scenes_stmt = conn.prepare("SELECT id, content, created_at, selected_variant_id FROM scenes WHERE character_id = ? ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    let scenes_rows = scenes_stmt
        .query_map(params![id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut scenes: Vec<JsonValue> = Vec::new();
    for row in scenes_rows {
        let (scene_id, content, created_at_s, selected_variant_id) =
            row.map_err(|e| e.to_string())?;
        // variants
        let mut var_stmt = conn.prepare("SELECT id, content, created_at FROM scene_variants WHERE scene_id = ? ORDER BY created_at ASC").map_err(|e| e.to_string())?;
        let var_rows = var_stmt
            .query_map(params![&scene_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut variants: Vec<JsonValue> = Vec::new();
        for v in var_rows {
            let (vid, vcontent, vcreated) = v.map_err(|e| e.to_string())?;
            variants
                .push(serde_json::json!({"id": vid, "content": vcontent, "createdAt": vcreated}));
        }
        let mut obj = JsonMap::new();
        obj.insert("id".into(), JsonValue::String(scene_id));
        obj.insert("content".into(), JsonValue::String(content));
        obj.insert("createdAt".into(), JsonValue::from(created_at_s));
        if !variants.is_empty() {
            obj.insert("variants".into(), JsonValue::Array(variants));
        }
        if let Some(sel) = selected_variant_id {
            obj.insert("selectedVariantId".into(), JsonValue::String(sel));
        }
        scenes.push(JsonValue::Object(obj));
    }

    let mut root = JsonMap::new();
    root.insert("id".into(), JsonValue::String(id.to_string()));
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
    if let Some(dm) = default_model_id {
        root.insert("defaultModelId".into(), JsonValue::String(dm));
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
    Ok(JsonValue::Object(root))
}

#[tauri::command]
pub fn characters_list(app: tauri::AppHandle) -> Result<String, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id FROM characters ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for id in rows {
        let id = id.map_err(|e| e.to_string())?;
        out.push(read_character(&conn, &id)?);
    }
    Ok(serde_json::to_string(&out).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn character_upsert(app: tauri::AppHandle, character_json: String) -> Result<String, String> {
    let mut conn = open_db(&app)?;
    let c: JsonValue = serde_json::from_str(&character_json).map_err(|e| e.to_string())?;
    let id = c
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let name = c
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "name is required".to_string())?;
    let avatar_path = c
        .get("avatarPath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let bg_path = c
        .get("backgroundImagePath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let description = c
        .get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let default_model_id = c
        .get("defaultModelId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let prompt_template_id = c
        .get("promptTemplateId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let system_prompt = c
        .get("systemPrompt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let disable_avatar_gradient = c
        .get("disableAvatarGradient")
        .and_then(|v| v.as_bool())
        .unwrap_or(false) as i64;
    let now = now_ms() as i64;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Insert/Update character row (default_scene_id handled after scenes insert)
    // Preserve created_at if exists
    let existing_created: Option<i64> = tx
        .query_row(
            "SELECT created_at FROM characters WHERE id = ?",
            params![&id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let created_at = existing_created.unwrap_or(now);

    tx.execute(
        r#"INSERT INTO characters (id, name, avatar_path, background_image_path, description, default_scene_id, default_model_id, prompt_template_id, system_prompt, disable_avatar_gradient, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,
              avatar_path=excluded.avatar_path,
              background_image_path=excluded.background_image_path,
              description=excluded.description,
              default_model_id=excluded.default_model_id,
              prompt_template_id=excluded.prompt_template_id,
              system_prompt=excluded.system_prompt,
              disable_avatar_gradient=excluded.disable_avatar_gradient,
              updated_at=excluded.updated_at"#,
        params![id, name, avatar_path, bg_path, description, default_model_id, prompt_template_id, system_prompt, disable_avatar_gradient, created_at, now],
    ).map_err(|e| e.to_string())?;

    // Replace rules
    tx.execute(
        "DELETE FROM character_rules WHERE character_id = ?",
        params![&id],
    )
    .map_err(|e| e.to_string())?;
    if let Some(rules) = c.get("rules").and_then(|v| v.as_array()) {
        for (idx, rule) in rules.iter().enumerate() {
            if let Some(text) = rule.as_str() {
                tx.execute(
                    "INSERT INTO character_rules (character_id, idx, rule) VALUES (?, ?, ?)",
                    params![&id, idx as i64, text],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    // Replace scenes and variants
    // Delete existing scenes for character (variants cascade)
    let scene_ids: Vec<String> = {
        let mut stmt = tx
            .prepare("SELECT id FROM scenes WHERE character_id = ?")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![&id], |r| Ok(r.get::<_, String>(0)?))
            .map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for it in rows {
            v.push(it.map_err(|e| e.to_string())?);
        }
        v
    };
    for sid in scene_ids {
        tx.execute("DELETE FROM scenes WHERE id = ?", params![sid])
            .map_err(|e| e.to_string())?;
    }

    let mut new_default_scene_id: Option<String> = c
        .get("defaultSceneId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if let Some(scenes) = c.get("scenes").and_then(|v| v.as_array()) {
        for (i, s) in scenes.iter().enumerate() {
            let sid = s
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let content = s.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let created_at_s = s.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(now);
            let selected_variant_id = s
                .get("selectedVariantId")
                .and_then(|v| v.as_str())
                .map(|x| x.to_string());
            tx.execute("INSERT INTO scenes (id, character_id, content, created_at, selected_variant_id) VALUES (?, ?, ?, ?, ?)", params![&sid, &id, content, created_at_s, selected_variant_id]).map_err(|e| e.to_string())?;

            if i == 0 && new_default_scene_id.is_none() {
                new_default_scene_id = Some(sid.clone());
            }

            if let Some(vars) = s.get("variants").and_then(|v| v.as_array()) {
                for v in vars {
                    let vid = v
                        .get("id")
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                    let vcontent = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
                    let vcreated = v.get("createdAt").and_then(|x| x.as_i64()).unwrap_or(now);
                    tx.execute("INSERT INTO scene_variants (id, scene_id, content, created_at) VALUES (?, ?, ?, ?)", params![vid, &sid, vcontent, vcreated]).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // Update default_scene_id
    tx.execute(
        "UPDATE characters SET default_scene_id = ? WHERE id = ?",
        params![new_default_scene_id, &id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    // Return the stored character
    let conn2 = open_db(&app)?;
    read_character(&conn2, &id).and_then(|v| serde_json::to_string(&v).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn character_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM characters WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ========== Personas ==========

#[tauri::command]
pub fn personas_list(app: tauri::AppHandle) -> Result<String, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT id, title, description, avatar_path, is_default, created_at, updated_at FROM personas ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let (id, title, description, avatar_path, is_default, created_at, updated_at) =
            row.map_err(|e| e.to_string())?;
        let mut obj = JsonMap::new();
        obj.insert("id".into(), JsonValue::String(id));
        obj.insert("title".into(), JsonValue::String(title.to_string()));
        obj.insert(
            "description".into(),
            JsonValue::String(description.to_string()),
        );
        if let Some(a) = avatar_path {
            obj.insert("avatarPath".into(), JsonValue::String(a));
        }
        obj.insert("isDefault".into(), JsonValue::Bool(is_default != 0));
        obj.insert("createdAt".into(), JsonValue::from(created_at));
        obj.insert("updatedAt".into(), JsonValue::from(updated_at));
        out.push(JsonValue::Object(obj));
    }
    Ok(serde_json::to_string(&out).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn persona_upsert(app: tauri::AppHandle, persona_json: String) -> Result<String, String> {
    let mut conn = open_db(&app)?;
    let p: JsonValue = serde_json::from_str(&persona_json).map_err(|e| e.to_string())?;
    let id = p
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let title = p
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "title is required".to_string())?;
    let description = p
        .get("description")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "description is required".to_string())?;
    let avatar_path = p
        .get("avatarPath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let is_default = p
        .get("isDefault")
        .and_then(|v| v.as_bool())
        .unwrap_or(false) as i64;
    let now = now_ms() as i64;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // Preserve created_at if updating
    let existing_created: Option<i64> = tx
        .query_row(
            "SELECT created_at FROM personas WHERE id = ?",
            params![&id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let created_at = existing_created.unwrap_or(now);

    tx.execute(
        r#"INSERT INTO personas (id, title, description, avatar_path, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title=excluded.title,
              description=excluded.description,
              avatar_path=excluded.avatar_path,
              is_default=excluded.is_default,
              updated_at=excluded.updated_at"#,
        params![&id, title, description, avatar_path, is_default, created_at, now],
    ).map_err(|e| e.to_string())?;

    if is_default != 0 {
        tx.execute(
            "UPDATE personas SET is_default = 0 WHERE id <> ?",
            params![&id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    let mut obj = JsonMap::new();
    obj.insert("id".into(), JsonValue::String(id));
    obj.insert("title".into(), JsonValue::String(title.to_string()));
    obj.insert(
        "description".into(),
        JsonValue::String(description.to_string()),
    );
    if let Some(a) = avatar_path {
        obj.insert("avatarPath".into(), JsonValue::String(a));
    }
    obj.insert("isDefault".into(), JsonValue::Bool(is_default != 0));
    obj.insert("createdAt".into(), JsonValue::from(created_at));
    obj.insert("updatedAt".into(), JsonValue::from(now));
    Ok(serde_json::to_string(&JsonValue::Object(obj)).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn persona_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM personas WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn persona_default_get(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;
    let row = conn.query_row("SELECT id, title, description, avatar_path, is_default, created_at, updated_at FROM personas WHERE is_default = 1 LIMIT 1", [], |r| Ok((
        r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, i64>(4)?, r.get::<_, i64>(5)?, r.get::<_, i64>(6)?
    ))).optional().map_err(|e| e.to_string())?;
    if let Some((id, title, description, avatar_path, is_default, created_at, updated_at)) = row {
        let mut obj = JsonMap::new();
        obj.insert("id".into(), JsonValue::String(id));
        obj.insert("title".into(), JsonValue::String(title));
        obj.insert("description".into(), JsonValue::String(description));
        if let Some(a) = avatar_path {
            obj.insert("avatarPath".into(), JsonValue::String(a));
        }
        obj.insert("isDefault".into(), JsonValue::Bool(is_default != 0));
        obj.insert("createdAt".into(), JsonValue::from(created_at));
        obj.insert("updatedAt".into(), JsonValue::from(updated_at));
        Ok(Some(
            serde_json::to_string(&JsonValue::Object(obj)).map_err(|e| e.to_string())?,
        ))
    } else {
        Ok(None)
    }
}

// ========== Sessions ==========

fn read_session(conn: &Connection, id: &str) -> Result<Option<JsonValue>, String> {
    let row = conn
        .query_row(
            "SELECT character_id, title, system_prompt, selected_scene_id, persona_id, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, archived, created_at, updated_at FROM sessions WHERE id = ?",
            params![id],
            |r| Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, Option<f64>>(5)?,
                r.get::<_, Option<f64>>(6)?,
                r.get::<_, Option<i64>>(7)?,
                r.get::<_, Option<f64>>(8)?,
                r.get::<_, Option<f64>>(9)?,
                r.get::<_, Option<i64>>(10)?,
                r.get::<_, i64>(11)?,
                r.get::<_, i64>(12)?,
                r.get::<_, i64>(13)?,
            )),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((
        character_id,
        title,
        system_prompt,
        selected_scene_id,
        persona_id,
        temperature,
        top_p,
        max_output_tokens,
        frequency_penalty,
        presence_penalty,
        top_k,
        archived,
        created_at,
        updated_at,
    )) = row
    else {
        return Ok(None);
    };

    // messages
    let mut mstmt = conn.prepare("SELECT id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned FROM messages WHERE session_id = ? ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    let mrows = mstmt
        .query_map(params![id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, Option<i64>>(4)?,
                r.get::<_, Option<i64>>(5)?,
                r.get::<_, Option<i64>>(6)?,
                r.get::<_, Option<String>>(7)?,
                r.get::<_, i64>(8)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut messages: Vec<JsonValue> = Vec::new();
    for mr in mrows {
        let (
            mid,
            role,
            content,
            mcreated,
            p_tokens,
            c_tokens,
            t_tokens,
            selected_variant_id,
            is_pinned,
        ) = mr.map_err(|e| e.to_string())?;
        // variants
        let mut vstmt = conn.prepare("SELECT id, content, created_at, prompt_tokens, completion_tokens, total_tokens FROM message_variants WHERE message_id = ? ORDER BY created_at ASC").map_err(|e| e.to_string())?;
        let vrows = vstmt
            .query_map(params![&mid], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, Option<i64>>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, Option<i64>>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut variants: Vec<JsonValue> = Vec::new();
        for vr in vrows {
            let (vid, vcontent, vcreated, vp, vc, vt) = vr.map_err(|e| e.to_string())?;
            variants.push(serde_json::json!({"id": vid, "content": vcontent, "createdAt": vcreated, "usage": {"promptTokens": vp, "completionTokens": vc, "totalTokens": vt}}));
        }
        let mut mobj = JsonMap::new();
        mobj.insert("id".into(), JsonValue::String(mid));
        mobj.insert("role".into(), JsonValue::String(role));
        mobj.insert("content".into(), JsonValue::String(content));
        mobj.insert("createdAt".into(), JsonValue::from(mcreated));
        if p_tokens.is_some() || c_tokens.is_some() || t_tokens.is_some() {
            mobj.insert("usage".into(), serde_json::json!({"promptTokens": p_tokens, "completionTokens": c_tokens, "totalTokens": t_tokens}));
        }
        if !variants.is_empty() {
            mobj.insert("variants".into(), JsonValue::Array(variants));
        }
        if let Some(sel) = selected_variant_id {
            mobj.insert("selectedVariantId".into(), JsonValue::String(sel));
        }
        mobj.insert("isPinned".into(), JsonValue::Bool(is_pinned != 0));
        messages.push(JsonValue::Object(mobj));
    }

    let advanced = if temperature.is_some()
        || top_p.is_some()
        || max_output_tokens.is_some()
        || frequency_penalty.is_some()
        || presence_penalty.is_some()
        || top_k.is_some()
    {
        Some(serde_json::json!({
            "temperature": temperature,
            "topP": top_p,
            "maxOutputTokens": max_output_tokens,
            "frequencyPenalty": frequency_penalty,
            "presencePenalty": presence_penalty,
            "topK": top_k,
        }))
    } else {
        None
    };

    let session = serde_json::json!({
        "id": id,
        "characterId": character_id,
        "title": title,
        "systemPrompt": system_prompt,
        "selectedSceneId": selected_scene_id,
        "personaId": persona_id,
        "advancedModelSettings": advanced,
        "messages": messages,
        "archived": archived != 0,
        "createdAt": created_at,
        "updatedAt": updated_at,
    });
    Ok(Some(session))
}

#[tauri::command]
pub fn sessions_list_ids(app: tauri::AppHandle) -> Result<String, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id FROM sessions ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok(r.get::<_, String>(0)?))
        .map_err(|e| e.to_string())?;
    let mut ids: Vec<String> = Vec::new();
    for r in rows {
        ids.push(r.map_err(|e| e.to_string())?);
    }
    Ok(serde_json::to_string(&ids).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn session_get(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;
    let v = read_session(&conn, &id)?;
    Ok(match v {
        Some(json) => Some(serde_json::to_string(&json).map_err(|e| e.to_string())?),
        None => None,
    })
}

#[tauri::command]
pub fn session_upsert(app: tauri::AppHandle, session_json: String) -> Result<(), String> {
    let mut conn = open_db(&app)?;
    let s: JsonValue = serde_json::from_str(&session_json).map_err(|e| e.to_string())?;
    let id = s
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "id is required".to_string())?
        .to_string();
    let character_id = s
        .get("characterId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "characterId is required".to_string())?;
    let title = s.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let system_prompt = s
        .get("systemPrompt")
        .and_then(|v| v.as_str())
        .map(|x| x.to_string());
    let selected_scene_id = s
        .get("selectedSceneId")
        .and_then(|v| v.as_str())
        .map(|x| x.to_string());
    let persona_id = s
        .get("personaId")
        .and_then(|v| v.as_str())
        .map(|x| x.to_string());
    let archived = s.get("archived").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
    let created_at = s
        .get("createdAt")
        .and_then(|v| v.as_i64())
        .unwrap_or(now_ms() as i64);
    let updated_at = now_ms() as i64;

    // advanced settings
    let adv = s.get("advancedModelSettings");
    let temperature = adv
        .and_then(|v| v.get("temperature"))
        .and_then(|v| v.as_f64());
    let top_p = adv.and_then(|v| v.get("topP")).and_then(|v| v.as_f64());
    let max_output_tokens = adv
        .and_then(|v| v.get("maxOutputTokens"))
        .and_then(|v| v.as_i64());
    let frequency_penalty = adv
        .and_then(|v| v.get("frequencyPenalty"))
        .and_then(|v| v.as_f64());
    let presence_penalty = adv
        .and_then(|v| v.get("presencePenalty"))
        .and_then(|v| v.as_f64());
    let top_k = adv.and_then(|v| v.get("topK")).and_then(|v| v.as_i64());

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        r#"INSERT INTO sessions (id, character_id, title, system_prompt, selected_scene_id, persona_id, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, archived, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              character_id=excluded.character_id,
              title=excluded.title,
              system_prompt=excluded.system_prompt,
              selected_scene_id=excluded.selected_scene_id,
              persona_id=excluded.persona_id,
              temperature=excluded.temperature,
              top_p=excluded.top_p,
              max_output_tokens=excluded.max_output_tokens,
              frequency_penalty=excluded.frequency_penalty,
              presence_penalty=excluded.presence_penalty,
              top_k=excluded.top_k,
              archived=excluded.archived,
              updated_at=excluded.updated_at"#,
        params![&id, character_id, title, system_prompt, selected_scene_id, persona_id, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, archived, created_at, updated_at],
    ).map_err(|e| e.to_string())?;

    // Replace messages
    tx.execute("DELETE FROM messages WHERE session_id = ?", params![&id])
        .map_err(|e| e.to_string())?;
    if let Some(msgs) = s.get("messages").and_then(|v| v.as_array()) {
        for m in msgs {
            let mid = m
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("user");
            let content = m.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let mcreated = m
                .get("createdAt")
                .and_then(|v| v.as_i64())
                .unwrap_or(updated_at);
            let is_pinned = m.get("isPinned").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
            let usage = m.get("usage");
            let pt = usage
                .and_then(|u| u.get("promptTokens"))
                .and_then(|v| v.as_i64());
            let ct = usage
                .and_then(|u| u.get("completionTokens"))
                .and_then(|v| v.as_i64());
            let tt = usage
                .and_then(|u| u.get("totalTokens"))
                .and_then(|v| v.as_i64());
            let selected_variant_id = m
                .get("selectedVariantId")
                .and_then(|v| v.as_str())
                .map(|x| x.to_string());
            tx.execute(
                "INSERT INTO messages (id, session_id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![&mid, &id, role, content, mcreated, pt, ct, tt, selected_variant_id, is_pinned],
            ).map_err(|e| e.to_string())?;

            // Variants
            if let Some(vars) = m.get("variants").and_then(|v| v.as_array()) {
                for v in vars {
                    let vid = v
                        .get("id")
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                    let vcontent = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
                    let vcreated = v
                        .get("createdAt")
                        .and_then(|x| x.as_i64())
                        .unwrap_or(updated_at);
                    let u = v.get("usage");
                    let vp = u
                        .and_then(|u| u.get("promptTokens"))
                        .and_then(|v| v.as_i64());
                    let vc = u
                        .and_then(|u| u.get("completionTokens"))
                        .and_then(|v| v.as_i64());
                    let vt = u
                        .and_then(|u| u.get("totalTokens"))
                        .and_then(|v| v.as_i64());
                    tx.execute("INSERT INTO message_variants (id, message_id, content, created_at, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)", params![vid, &mid, vcontent, vcreated, vp, vc, vt]).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn session_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM sessions WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn session_archive(app: tauri::AppHandle, id: String, archived: bool) -> Result<(), String> {
    let conn = open_db(&app)?;
    let now = now_ms() as i64;
    conn.execute(
        "UPDATE sessions SET archived = ?, updated_at = ? WHERE id = ?",
        params![if archived { 1 } else { 0 }, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn session_update_title(
    app: tauri::AppHandle,
    id: String,
    title: String,
) -> Result<(), String> {
    let conn = open_db(&app)?;
    let now = now_ms() as i64;
    conn.execute(
        "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
        params![title, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn message_toggle_pin(
    app: tauri::AppHandle,
    session_id: String,
    message_id: String,
) -> Result<Option<String>, String> {
    let conn = open_db(&app)?;
    let current: Option<i64> = conn
        .query_row(
            "SELECT is_pinned FROM messages WHERE id = ?",
            params![&message_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(is_pinned) = current {
        conn.execute(
            "UPDATE messages SET is_pinned = ? WHERE id = ?",
            params![if is_pinned == 0 { 1 } else { 0 }, &message_id],
        )
        .map_err(|e| e.to_string())?;
        // Return updated session
        if let Some(json) = read_session(&conn, &session_id)? {
            return Ok(Some(
                serde_json::to_string(&json).map_err(|e| e.to_string())?,
            ));
        }
        Ok(None)
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn storage_read_characters(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = characters_path(&app)?;
    read_encrypted_file(&path)
}

#[tauri::command]
pub fn storage_write_characters(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = characters_path(&app)?;
    write_encrypted_file(&path, &data)
}

// Legacy personas and sessions file APIs removed (now backed by SQLite)

#[tauri::command]
pub fn storage_clear_all(app: tauri::AppHandle) -> Result<(), String> {
    let dir = storage_root(&app)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsageSummary {
    pub file_count: usize,
    pub estimated_sessions: usize,
    pub last_updated_ms: Option<u64>,
}

#[tauri::command]
pub fn storage_usage_summary(app: tauri::AppHandle) -> Result<StorageUsageSummary, String> {
    // Count DB and legacy files
    let mut file_count = 0usize;
    let mut latest: Option<u64> = None;

    // Consider DB as a single file artifact
    let db = db_path(&app)?;
    if db.exists() {
        file_count += 1;
        if let Ok(metadata) = fs::metadata(&db) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(ms) = modified.duration_since(std::time::UNIX_EPOCH) {
                    let ts = ms.as_millis() as u64;
                    latest = Some(latest.map_or(ts, |cur| cur.max(ts)));
                }
            }
        }
    }

    // Legacy files that might still be present
    for path in [settings_path(&app)?, characters_path(&app)?] {
        if path.exists() {
            file_count += 1;
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(ms) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let ts = ms.as_millis() as u64;
                        latest = Some(latest.map_or(ts, |cur| cur.max(ts)));
                    }
                }
            }
        }
    }

    // Pull stats from DB
    let conn = open_db(&app)?;
    let session_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
        .unwrap_or(0);

    let settings_updated: Option<i64> = conn
        .query_row("SELECT updated_at FROM settings WHERE id = 1", [], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(ts) = settings_updated { latest = Some(latest.map_or(ts as u64, |cur| cur.max(ts as u64))); }

    for (table, sql) in [
        ("characters", "SELECT MAX(updated_at) FROM characters"),
        ("personas", "SELECT MAX(updated_at) FROM personas"),
        ("sessions", "SELECT MAX(updated_at) FROM sessions"),
    ] {
        let max_ts: Option<i64> = conn
            .query_row(sql, [], |r| r.get(0))
            .optional()
            .map_err(|e| format!("{}: {}", table, e))?;
        if let Some(ts) = max_ts { latest = Some(latest.map_or(ts as u64, |cur| cur.max(ts as u64))); }
    }

    let last_updated_ms = latest.or_else(|| now_millis().ok());

    Ok(StorageUsageSummary {
        file_count: file_count as usize,
        estimated_sessions: session_count as usize,
        last_updated_ms,
    })
}

pub(crate) fn internal_read_settings(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(app)?;
    read_encrypted_file(&path)
}

// Image storage - returns file path, NOT base64
#[tauri::command]
pub fn storage_write_image(
    app: tauri::AppHandle,
    image_id: String,
    base64_data: String,
) -> Result<String, String> {
    // Remove data URL prefix if present
    let data = if let Some(comma_idx) = base64_data.find(',') {
        &base64_data[comma_idx + 1..]
    } else {
        &base64_data
    };

    // Decode base64
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Create images directory
    let images_dir = storage_root(&app)?.join("images");
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    // Detect file extension from magic bytes
    let extension = if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "png"
    } else if bytes.starts_with(&[0x47, 0x49, 0x46]) {
        "gif"
    } else if bytes.starts_with(&[0x52, 0x49, 0x46, 0x46])
        && bytes.len() > 8
        && &bytes[8..12] == b"WEBP"
    {
        "webp"
    } else {
        "png" // default
    };

    // Write image file with proper extension
    let image_path = images_dir.join(format!("{}.{}", image_id, extension));
    fs::write(&image_path, bytes).map_err(|e| e.to_string())?;

    // Return the absolute file path
    Ok(image_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn storage_get_image_path(app: tauri::AppHandle, image_id: String) -> Result<String, String> {
    let images_dir = storage_root(&app)?.join("images");

    // Check for file with any image extension
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

    // Delete file with any extension
    for ext in &["jpg", "jpeg", "png", "gif", "webp", "img"] {
        let image_path = images_dir.join(format!("{}.{}", image_id, ext));
        if image_path.exists() {
            delete_file_if_exists(&image_path)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn storage_read_image(app: tauri::AppHandle, image_id: String) -> Result<String, String> {
    let images_dir = storage_root(&app)?.join("images");

    // Find the image file with any extension
    for ext in &["jpg", "jpeg", "png", "gif", "webp"] {
        let image_path = images_dir.join(format!("{}.{}", image_id, ext));
        if image_path.exists() {
            let bytes = fs::read(&image_path).map_err(|e| e.to_string())?;

            // Determine MIME type from extension
            let mime_type = match *ext {
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => "image/png",
            };

            // Encode to base64 and return as data URL
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

    // Decode base64
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Create avatars/<entity-id> directory
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

    // Delete the cached gradient file since avatar changed
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

    // Determine MIME type from file extension
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

    // Encode to base64 and return as data URL
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

    delete_file_if_exists(&avatar_path)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GradientColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub hex: String,
}

#[derive(Serialize, Deserialize, Clone)]
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

    log_debug(
        &app,
        "gradient",
        format!(
            "Total pixels: {}, Sampling with step: {} (target ~{} samples)",
            total_pixels, sample_step, target_samples
        ),
    );

    for y in (0..height).step_by(sample_step as usize) {
        for x in (0..width).step_by(sample_step as usize) {
            if let Some(pixel) = rgb_img.get_pixel_checked(x, y) {
                let (r, g, b) = (pixel[0], pixel[1], pixel[2]);
                let (_, s, v) = rgb_to_hsv(r, g, b);

                // Filter out very dark, very bright, or very desaturated colors
                if v > 0.15 && v < 0.95 && s > 0.1 {
                    samples.push((r, g, b));
                }
            }
        }
    }

    log_info(
        &app,
        "gradient",
        format!("Collected {} samples", samples.len()),
    );

    if samples.is_empty() {
        log_warn(
            &app,
            "gradient",
            "No samples collected, using default gradient",
        );
        return Ok(create_default_gradient());
    }

    log_debug(
        &app,
        "gradient",
        format!("First 5 samples: {:?}", &samples[..samples.len().min(5)]),
    );

    let dominant_colors = find_dominant_colors(&samples, 3)?;

    log_info(
        &app,
        "gradient",
        format!("Dominant colors RGB: {:?}", dominant_colors),
    );

    for (i, color) in dominant_colors.iter().enumerate() {
        let (h, s, v) = rgb_to_hsv(color.0, color.1, color.2);
        log_debug(
            &app,
            "gradient",
            format!(
                "Color {}: RGB({}, {}, {}) -> HSV({:.1}°, {:.2}, {:.2})",
                i, color.0, color.1, color.2, h, s, v
            ),
        );
    }

    let avg_hue = calculate_average_hue(&dominant_colors);

    log_info(&app, "gradient", format!("Average hue: {:.1}°", avg_hue));

    let gradient_colors = generate_gradient_colors(&dominant_colors, avg_hue)?;

    log_info(
        &app,
        "gradient",
        format!("Generated {} gradient colors", gradient_colors.len()),
    );

    let gradient_css = create_css_gradient(&gradient_colors);

    log_info(&app, "gradient", format!("CSS gradient: {}", gradient_css));

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
        log_info(&app, "gradient", "Saved gradient cache to file");
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

    let mut assignments = vec![0; samples.len()];

    let max_iterations = 5;
    let convergence_threshold = 0.1;

    for iteration in 0..max_iterations {
        let old_centroids = centroids.clone();

        for (i, sample) in samples.iter().enumerate() {
            let mut min_dist_sq = f64::MAX;
            let mut closest = 0;

            for (j, centroid) in centroids.iter().enumerate() {
                let dist_sq = (sample.0 as f64 - centroid.0).powi(2)
                    + (sample.1 as f64 - centroid.1).powi(2)
                    + (sample.2 as f64 - centroid.2).powi(2);

                if dist_sq < min_dist_sq {
                    min_dist_sq = dist_sq;
                    closest = j;
                }
            }
            assignments[i] = closest;
        }

        let mut new_centroids = vec![(0.0, 0.0, 0.0); k];
        let mut counts = vec![0; k];

        for (i, &assignment) in assignments.iter().enumerate() {
            let sample = samples[i];
            new_centroids[assignment].0 += sample.0 as f64;
            new_centroids[assignment].1 += sample.1 as f64;
            new_centroids[assignment].2 += sample.2 as f64;
            counts[assignment] += 1;
        }

        for j in 0..k {
            if counts[j] > 0 {
                centroids[j].0 = new_centroids[j].0 / counts[j] as f64;
                centroids[j].1 = new_centroids[j].1 / counts[j] as f64;
                centroids[j].2 = new_centroids[j].2 / counts[j] as f64;
            }
        }

        if iteration > 0 {
            let max_movement = centroids
                .iter()
                .zip(old_centroids.iter())
                .map(|(new, old)| {
                    (new.0 - old.0).abs() + (new.1 - old.1).abs() + (new.2 - old.2).abs()
                })
                .fold(0.0f64, f64::max);

            if max_movement < convergence_threshold {
                break;
            }
        }
    }

    let mut result = Vec::new();
    for centroid in centroids {
        result.push((
            centroid.0.clamp(0.0, 255.0) as u8,
            centroid.1.clamp(0.0, 255.0) as u8,
            centroid.2.clamp(0.0, 255.0) as u8,
        ));
    }

    result.sort_by(|a, b| {
        let (_, s_a, v_a) = rgb_to_hsv(a.0, a.1, a.2);
        let (_, s_b, v_b) = rgb_to_hsv(b.0, b.1, b.2);
        let score_a = s_a * 0.7 + v_a * 0.3;
        let score_b = s_b * 0.7 + v_b * 0.3;
        score_b
            .partial_cmp(&score_a)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(result)
}

fn calculate_average_hue(colors: &[(u8, u8, u8)]) -> f64 {
    let mut hsv_colors = Vec::new();

    for (r, g, b) in colors {
        let (h, s, v) = rgb_to_hsv(*r, *g, *b);
        hsv_colors.push((h, s, v));
    }

    let mut total_weight = 0.0;
    let mut weighted_sum = 0.0;
    let mut max_v: f64 = 0.0;

    for (h, s, v) in hsv_colors {
        let weight = s * v;
        if weight > 0.01 {
            weighted_sum += h * weight;
            total_weight += weight;
            if v > max_v {
                max_v = v;
            }
        }
    }

    if total_weight > 0.0 {
        weighted_sum / total_weight
    } else {
        0.0
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

        gradient_colors.push(GradientColor {
            r,
            g,
            b,
            hex: hex.clone(),
        });
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
        dominant_hue: 270.0,
        text_color: "#ffffff".to_string(),
        text_secondary: "rgba(255, 255, 255, 0.7)".to_string(),
    }
}

fn calculate_text_colors(gradient_colors: &[GradientColor]) -> (String, String) {
    if gradient_colors.is_empty() {
        return (
            "#ffffff".to_string(),
            "rgba(255, 255, 255, 0.7)".to_string(),
        );
    }

    let mut total_luminance = 0.0;
    for color in gradient_colors {
        let r = color.r as f64 / 255.0;
        let g = color.g as f64 / 255.0;
        let b = color.b as f64 / 255.0;

        let r_lin = if r <= 0.03928 {
            r / 12.92
        } else {
            ((r + 0.055) / 1.055).powf(2.4)
        };
        let g_lin = if g <= 0.03928 {
            g / 12.92
        } else {
            ((g + 0.055) / 1.055).powf(2.4)
        };
        let b_lin = if b <= 0.03928 {
            b / 12.92
        } else {
            ((b + 0.055) / 1.055).powf(2.4)
        };

        let luminance = 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin;
        total_luminance += luminance;
    }

    let avg_luminance = total_luminance / gradient_colors.len() as f64;

    if avg_luminance < 0.5 {
        (
            "#ffffff".to_string(),
            "rgba(255, 255, 255, 0.7)".to_string(),
        )
    } else {
        ("#000000".to_string(), "rgba(0, 0, 0, 0.6)".to_string())
    }
}
