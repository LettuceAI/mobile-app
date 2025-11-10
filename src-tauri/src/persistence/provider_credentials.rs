use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::persistence::db::{open_connection};
use crate::persistence::db::repo::{exec, now_millis, query_one, query_all};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCredential {
    pub id: String,
    pub provider_id: String,
    pub label: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub default_model: Option<String>,
    pub headers_json: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn upsert_internal(conn: &Connection, cred: &ProviderCredential) -> Result<(), String> {
    exec(
        conn,
        r#"
        INSERT INTO provider_credentials (id, provider_id, label, api_key, base_url, default_model, headers_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(id) DO UPDATE SET
          provider_id=excluded.provider_id,
          label=excluded.label,
          api_key=excluded.api_key,
          base_url=excluded.base_url,
          default_model=excluded.default_model,
          headers_json=excluded.headers_json,
          updated_at=excluded.updated_at
        "#,
        &[
            &cred.id,
            &cred.provider_id,
            &cred.label,
            &cred.api_key,
            &cred.base_url,
            &cred.default_model,
            &cred.headers_json,
            &cred.created_at,
            &cred.updated_at,
        ],
    )?;
    Ok(())
}

pub fn upsert_provider_credential(app: &AppHandle, mut cred: ProviderCredential) -> Result<(), String> {
    let conn = open_connection(app)?;
    let now = now_millis();
    if cred.created_at == 0 { cred.created_at = now; }
    cred.updated_at = now;
    upsert_internal(&conn, &cred)
}

pub fn get_credential_by_provider(app: &AppHandle, provider_id: String) -> Result<Option<ProviderCredential>, String> {
    let conn = open_connection(app)?;
    query_one(
        &conn,
        r#"SELECT id, provider_id, label, api_key, base_url, default_model, headers_json, created_at, updated_at
           FROM provider_credentials WHERE provider_id = ?1 LIMIT 1"#,
        &[&provider_id],
        |row| {
            Ok(ProviderCredential {
                id: row.get(0)?,
                provider_id: row.get(1)?,
                label: row.get(2)?,
                api_key: row.get(3).ok(),
                base_url: row.get(4).ok(),
                default_model: row.get(5).ok(),
                headers_json: row.get(6).ok(),
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
}

pub fn set_api_key_for_provider(app: &AppHandle, provider_id: String, api_key: Option<String>) -> Result<(), String> {
    let conn = open_connection(app)?;
    let now = now_millis();
    let updated = exec(
        &conn,
        r#"UPDATE provider_credentials SET api_key = ?1, updated_at = ?2 WHERE provider_id = ?3"#,
        &[&api_key, &now, &provider_id],
    )?;
    if updated == 0 {
        // If no row, insert a minimal one (id = provider_id for convenience)
        let cred = ProviderCredential {
            id: provider_id.clone(),
            provider_id: provider_id.clone(),
            label: provider_id.clone(),
            api_key,
            base_url: None,
            default_model: None,
            headers_json: None,
            created_at: now,
            updated_at: now,
        };
        upsert_internal(&conn, &cred)?;
    }
    Ok(())
}

pub fn list_provider_credentials(app: &AppHandle) -> Result<Vec<ProviderCredential>, String> {
    let conn = open_connection(app)?;
    query_all(
        &conn,
        r#"SELECT id, provider_id, label, api_key, base_url, default_model, headers_json, created_at, updated_at
           FROM provider_credentials ORDER BY label COLLATE NOCASE"#,
        &[],
        |row| {
            Ok(ProviderCredential {
                id: row.get(0)?,
                provider_id: row.get(1)?,
                label: row.get(2)?,
                api_key: row.get(3).ok(),
                base_url: row.get(4).ok(),
                default_model: row.get(5).ok(),
                headers_json: row.get(6).ok(),
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
}

// Tauri commands
#[tauri::command]
pub fn db_provider_credential_get_by_provider(app: tauri::AppHandle, provider_id: String) -> Result<Option<ProviderCredential>, String> {
    get_credential_by_provider(&app, provider_id)
}

#[tauri::command]
pub fn db_provider_credential_set_api_key(app: tauri::AppHandle, provider_id: String, api_key: Option<String>) -> Result<(), String> {
    set_api_key_for_provider(&app, provider_id, api_key)
}

#[tauri::command]
pub fn db_provider_credential_upsert(app: tauri::AppHandle, cred: ProviderCredential) -> Result<(), String> {
    upsert_provider_credential(&app, cred)
}

#[tauri::command]
pub fn db_provider_credential_list(app: tauri::AppHandle) -> Result<Vec<ProviderCredential>, String> {
    list_provider_credentials(&app)
}
