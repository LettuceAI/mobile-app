use rusqlite::{Connection, OpenFlags};
use std::path::PathBuf;
use tauri::AppHandle;

use crate::utils::ensure_lettuce_dir;

mod schema;
pub mod repo;

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_lettuce_dir(app)?.join("lettuce.db"))
}

/// Open a SQLite connection to the app database, creating it if needed.
pub fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
        | OpenFlags::SQLITE_OPEN_CREATE
        | OpenFlags::SQLITE_OPEN_FULL_MUTEX;
    Connection::open_with_flags(path, flags).map_err(|e| e.to_string())
}

/// Initialize the database with required schema. Safe to call multiple times.
pub fn init_db(app: &AppHandle) -> Result<(), String> {
    let conn = open_connection(app)?;
    // Recommended pragmas for reliability on desktop/mobile
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        "#,
    )
    .map_err(|e| e.to_string())?;

    schema::create_schema(&conn)
}
