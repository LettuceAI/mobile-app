use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::db::DbConnection;
use crate::utils::now_millis;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lorebook {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Lorebook {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Lorebook {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LorebookEntry {
    pub id: String,
    pub lorebook_id: String,
    pub title: String,
    pub enabled: bool,
    pub always_active: bool,
    pub keywords: Vec<String>,
    pub case_sensitive: bool,
    pub content: String,
    pub priority: i32,
    pub display_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

impl LorebookEntry {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        let keywords_json: String = row.get(5)?;
        let keywords: Vec<String> = serde_json::from_str(&keywords_json).unwrap_or_default();

        Ok(LorebookEntry {
            id: row.get(0)?,
            lorebook_id: row.get(1)?,
            title: row.get(2)?,
            enabled: row.get::<_, i32>(3)? != 0,
            always_active: row.get::<_, i32>(4)? != 0,
            keywords,
            case_sensitive: row.get::<_, i32>(6)? != 0,
            content: row.get(7)?,
            priority: row.get(8)?,
            display_order: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }
}

// ============================================================================
// Lorebooks (app-level)
// ============================================================================

pub fn list_lorebooks(conn: &DbConnection) -> Result<Vec<Lorebook>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, created_at, updated_at
            FROM lorebooks
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| format!("Failed to prepare lorebooks list: {}", e))?;

    let items = stmt
        .query_map([], Lorebook::from_row)
        .map_err(|e| format!("Failed to query lorebooks: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect lorebooks: {}", e))?;

    Ok(items)
}

pub fn get_lorebook(conn: &DbConnection, lorebook_id: &str) -> Result<Option<Lorebook>, String> {
    conn.query_row(
        "SELECT id, name, created_at, updated_at FROM lorebooks WHERE id = ?1",
        params![lorebook_id],
        Lorebook::from_row,
    )
    .optional()
    .map_err(|e| format!("Failed to query lorebook: {}", e))
}

pub fn upsert_lorebook(conn: &DbConnection, lorebook: &Lorebook) -> Result<Lorebook, String> {
    let now = now_millis()? as i64;

    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM lorebooks WHERE id = ?1",
            params![lorebook.id],
            |_| Ok(true),
        )
        .optional()
        .map_err(|e| format!("Failed to check lorebook existence: {}", e))?
        .unwrap_or(false);

    if exists {
        conn.execute(
            "UPDATE lorebooks SET name = ?2, updated_at = ?3 WHERE id = ?1",
            params![lorebook.id, lorebook.name, now],
        )
        .map_err(|e| format!("Failed to update lorebook: {}", e))?;
    } else {
        conn.execute(
            "INSERT INTO lorebooks (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![lorebook.id, lorebook.name, lorebook.created_at, now],
        )
        .map_err(|e| format!("Failed to insert lorebook: {}", e))?;
    }

    get_lorebook(conn, &lorebook.id)?
        .ok_or_else(|| "Failed to retrieve lorebook after upsert".to_string())
}

pub fn delete_lorebook(conn: &DbConnection, lorebook_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM lorebooks WHERE id = ?1", params![lorebook_id])
        .map_err(|e| format!("Failed to delete lorebook: {}", e))?;
    Ok(())
}

pub fn list_character_lorebooks(
    conn: &DbConnection,
    character_id: &str,
) -> Result<Vec<Lorebook>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT l.id, l.name, l.created_at, l.updated_at
            FROM character_lorebooks cl
            JOIN lorebooks l ON l.id = cl.lorebook_id
            WHERE cl.character_id = ?1 AND cl.enabled = 1
            ORDER BY cl.display_order ASC, l.updated_at DESC
            "#,
        )
        .map_err(|e| format!("Failed to prepare character lorebooks list: {}", e))?;

    let items = stmt
        .query_map(params![character_id], Lorebook::from_row)
        .map_err(|e| format!("Failed to query character lorebooks: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect character lorebooks: {}", e))?;

    Ok(items)
}

pub fn set_character_lorebooks(
    conn: &mut DbConnection,
    character_id: &str,
    lorebook_ids: &[String],
) -> Result<(), String> {
    let now = now_millis()? as i64;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute(
        "DELETE FROM character_lorebooks WHERE character_id = ?1",
        params![character_id],
    )
    .map_err(|e| format!("Failed to clear character lorebooks: {}", e))?;

    for (idx, lorebook_id) in lorebook_ids.iter().enumerate() {
        tx.execute(
            r#"
            INSERT INTO character_lorebooks (character_id, lorebook_id, enabled, display_order, created_at, updated_at)
            VALUES (?1, ?2, 1, ?3, ?4, ?4)
            "#,
            params![character_id, lorebook_id, idx as i32, now],
        )
        .map_err(|e| format!("Failed to set character lorebook mapping: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit character lorebooks: {}", e))?;

    Ok(())
}

// ============================================================================
// Lorebook entries
// ============================================================================

pub fn get_lorebook_entries(
    conn: &DbConnection,
    lorebook_id: &str,
) -> Result<Vec<LorebookEntry>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, lorebook_id, title, enabled, always_active, keywords,
                   case_sensitive, content, priority, display_order,
                   created_at, updated_at
            FROM lorebook_entries
            WHERE lorebook_id = ?1
            ORDER BY display_order ASC, created_at ASC
            "#,
        )
        .map_err(|e| format!("Failed to prepare entries query: {}", e))?;

    let entries = stmt
        .query_map(params![lorebook_id], LorebookEntry::from_row)
        .map_err(|e| format!("Failed to execute entries query: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect entries: {}", e))?;

    Ok(entries)
}

pub fn get_enabled_character_lorebook_entries(
    conn: &DbConnection,
    character_id: &str,
) -> Result<Vec<LorebookEntry>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT e.id, e.lorebook_id, e.title, e.enabled, e.always_active, e.keywords,
                   e.case_sensitive, e.content, e.priority, e.display_order,
                   e.created_at, e.updated_at
            FROM lorebook_entries e
            JOIN character_lorebooks cl ON cl.lorebook_id = e.lorebook_id
            WHERE cl.character_id = ?1 AND cl.enabled = 1 AND e.enabled = 1
            ORDER BY e.priority DESC, cl.display_order ASC, e.display_order ASC, e.created_at ASC
            "#,
        )
        .map_err(|e| format!("Failed to prepare enabled entries query: {}", e))?;

    let entries = stmt
        .query_map(params![character_id], LorebookEntry::from_row)
        .map_err(|e| format!("Failed to execute enabled entries query: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect enabled entries: {}", e))?;

    Ok(entries)
}

pub fn get_lorebook_entry(
    conn: &DbConnection,
    entry_id: &str,
) -> Result<Option<LorebookEntry>, String> {
    conn.query_row(
        r#"
        SELECT id, lorebook_id, title, enabled, always_active, keywords,
               case_sensitive, content, priority, display_order,
               created_at, updated_at
        FROM lorebook_entries
        WHERE id = ?1
        "#,
        params![entry_id],
        LorebookEntry::from_row,
    )
    .optional()
    .map_err(|e| format!("Failed to query entry: {}", e))
}

pub fn upsert_lorebook_entry(
    conn: &DbConnection,
    entry: &LorebookEntry,
) -> Result<LorebookEntry, String> {
    let keywords_json = serde_json::to_string(&entry.keywords)
        .map_err(|e| format!("Failed to serialize keywords: {}", e))?;

    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM lorebook_entries WHERE id = ?1",
            params![entry.id],
            |_| Ok(true),
        )
        .optional()
        .map_err(|e| format!("Failed to check entry existence: {}", e))?
        .unwrap_or(false);

    let now = now_millis()? as i64;

    if exists {
        conn.execute(
            r#"
            UPDATE lorebook_entries
            SET lorebook_id = ?2, title = ?3, enabled = ?4, always_active = ?5, keywords = ?6,
                case_sensitive = ?7, content = ?8, priority = ?9, display_order = ?10,
                updated_at = ?11
            WHERE id = ?1
            "#,
            params![
                entry.id,
                entry.lorebook_id,
                entry.title,
                entry.enabled as i32,
                entry.always_active as i32,
                keywords_json,
                entry.case_sensitive as i32,
                entry.content,
                entry.priority,
                entry.display_order,
                now,
            ],
        )
        .map_err(|e| format!("Failed to update entry: {}", e))?;
    } else {
        conn.execute(
            r#"
            INSERT INTO lorebook_entries (
              id, lorebook_id, title, enabled, always_active, keywords,
              case_sensitive, content, priority, display_order,
              created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
            params![
                entry.id,
                entry.lorebook_id,
                entry.title,
                entry.enabled as i32,
                entry.always_active as i32,
                keywords_json,
                entry.case_sensitive as i32,
                entry.content,
                entry.priority,
                entry.display_order,
                entry.created_at,
                now,
            ],
        )
        .map_err(|e| format!("Failed to insert entry: {}", e))?;
    }

    get_lorebook_entry(conn, &entry.id)?
        .ok_or_else(|| "Failed to retrieve entry after upsert".to_string())
}

pub fn delete_lorebook_entry(conn: &DbConnection, entry_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM lorebook_entries WHERE id = ?1",
        params![entry_id],
    )
    .map_err(|e| format!("Failed to delete entry: {}", e))?;
    Ok(())
}

pub fn update_entry_display_order(
    conn: &DbConnection,
    updates: Vec<(String, i32)>,
) -> Result<(), String> {
    let now = now_millis()? as i64;
    for (entry_id, display_order) in updates {
        conn.execute(
            "UPDATE lorebook_entries SET display_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![display_order, now, entry_id],
        )
        .map_err(|e| format!("Failed to update display order for {}: {}", entry_id, e))?;
    }
    Ok(())
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub fn lorebooks_list(app: tauri::AppHandle) -> Result<String, String> {
    let conn = crate::storage_manager::db::open_db(&app)?;
    let lorebooks = list_lorebooks(&conn)?;
    serde_json::to_string(&lorebooks).map_err(|e| format!("Failed to serialize lorebooks: {}", e))
}

#[tauri::command]
pub fn lorebook_upsert(app: tauri::AppHandle, lorebook_json: String) -> Result<String, String> {
    let lorebook: Lorebook = serde_json::from_str(&lorebook_json)
        .map_err(|e| format!("Invalid lorebook JSON: {}", e))?;
    let conn = crate::storage_manager::db::open_db(&app)?;
    let updated = upsert_lorebook(&conn, &lorebook)?;
    serde_json::to_string(&updated).map_err(|e| format!("Failed to serialize lorebook: {}", e))
}

#[tauri::command]
pub fn lorebook_delete(app: tauri::AppHandle, lorebook_id: String) -> Result<(), String> {
    let conn = crate::storage_manager::db::open_db(&app)?;
    delete_lorebook(&conn, &lorebook_id)
}

#[tauri::command]
pub fn character_lorebooks_list(
    app: tauri::AppHandle,
    character_id: String,
) -> Result<String, String> {
    let conn = crate::storage_manager::db::open_db(&app)?;
    let lorebooks = list_character_lorebooks(&conn, &character_id)?;
    serde_json::to_string(&lorebooks)
        .map_err(|e| format!("Failed to serialize character lorebooks: {}", e))
}

#[tauri::command]
pub fn character_lorebooks_set(
    app: tauri::AppHandle,
    character_id: String,
    lorebook_ids_json: String,
) -> Result<(), String> {
    let lorebook_ids: Vec<String> = serde_json::from_str(&lorebook_ids_json)
        .map_err(|e| format!("Invalid lorebook ids JSON: {}", e))?;
    let mut conn = crate::storage_manager::db::open_db(&app)?;
    set_character_lorebooks(&mut conn, &character_id, &lorebook_ids)
}

#[tauri::command]
pub fn lorebook_entries_list(app: tauri::AppHandle, lorebook_id: String) -> Result<String, String> {
    let conn = crate::storage_manager::db::open_db(&app)?;
    let entries = get_lorebook_entries(&conn, &lorebook_id)?;
    serde_json::to_string(&entries).map_err(|e| format!("Failed to serialize entries: {}", e))
}

#[tauri::command]
pub fn lorebook_entry_get(app: tauri::AppHandle, entry_id: String) -> Result<String, String> {
    let conn = crate::storage_manager::db::open_db(&app)?;
    let entry = get_lorebook_entry(&conn, &entry_id)?;
    serde_json::to_string(&entry).map_err(|e| format!("Failed to serialize entry: {}", e))
}

#[tauri::command]
pub fn lorebook_entry_upsert(app: tauri::AppHandle, entry_json: String) -> Result<String, String> {
    let entry: LorebookEntry =
        serde_json::from_str(&entry_json).map_err(|e| format!("Invalid entry JSON: {}", e))?;

    let conn = crate::storage_manager::db::open_db(&app)?;
    let updated_entry = upsert_lorebook_entry(&conn, &entry)?;

    serde_json::to_string(&updated_entry)
        .map_err(|e| format!("Failed to serialize updated entry: {}", e))
}

#[tauri::command]
pub fn lorebook_entry_delete(app: tauri::AppHandle, entry_id: String) -> Result<(), String> {
    let conn = crate::storage_manager::db::open_db(&app)?;
    delete_lorebook_entry(&conn, &entry_id)
}

#[tauri::command]
pub fn lorebook_entry_create_blank(
    app: tauri::AppHandle,
    lorebook_id: String,
) -> Result<String, String> {
    let conn = crate::storage_manager::db::open_db(&app)?;

    let max_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(display_order), -1) FROM lorebook_entries WHERE lorebook_id = ?1",
            params![lorebook_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    let now = now_millis()? as i64;
    let new_entry = LorebookEntry {
        id: Uuid::new_v4().to_string(),
        lorebook_id: lorebook_id.clone(),
        title: "".to_string(),
        enabled: true,
        always_active: false,
        keywords: vec![],
        case_sensitive: false,
        content: String::new(),
        priority: 0,
        display_order: max_order + 1,
        created_at: now,
        updated_at: now,
    };

    let created = upsert_lorebook_entry(&conn, &new_entry)?;
    serde_json::to_string(&created).map_err(|e| format!("Failed to serialize entry: {}", e))
}

#[tauri::command]
pub fn lorebook_entries_reorder(app: tauri::AppHandle, updates_json: String) -> Result<(), String> {
    let updates: Vec<(String, i32)> =
        serde_json::from_str(&updates_json).map_err(|e| format!("Invalid updates JSON: {}", e))?;

    let conn = crate::storage_manager::db::open_db(&app)?;
    update_entry_display_order(&conn, updates)
}
