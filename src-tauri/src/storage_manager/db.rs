use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;

use super::legacy::storage_root;
use crate::migrations;
use crate::utils::{log_info, log_warn, now_millis};

pub fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(storage_root(app)?.join("app.db"))
}

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use tauri::{Emitter, Manager};

pub type DbPool = Pool<SqliteConnectionManager>;
pub type DbConnection = r2d2::PooledConnection<SqliteConnectionManager>;

/// Wrapper that allows the database pool to be swapped at runtime.
/// This is used for backup restore without requiring app restart.
pub struct SwappablePool {
    pool: RwLock<DbPool>,
}

impl SwappablePool {
    pub fn new(pool: DbPool) -> Self {
        Self {
            pool: RwLock::new(pool),
        }
    }

    /// Get a connection from the current pool
    pub fn get_connection(&self) -> Result<DbConnection, String> {
        let pool = self
            .pool
            .read()
            .map_err(|e| format!("Pool lock poisoned: {}", e))?;
        pool.get()
            .map_err(|e| format!("Failed to get connection from pool: {}", e))
    }

    /// Swap the pool with a new one (used after backup restore)
    pub fn swap(&self, new_pool: DbPool) -> Result<(), String> {
        let mut pool = self
            .pool
            .write()
            .map_err(|e| format!("Pool lock poisoned: {}", e))?;
        *pool = new_pool;
        Ok(())
    }
}

/// Create a new pool for a given database path
pub fn create_pool_for_path(path: &PathBuf) -> Result<DbPool, String> {
    let manager = SqliteConnectionManager::file(path).with_init(|c| {
        c.execute_batch(
            r#"
                PRAGMA journal_mode=WAL;
                PRAGMA synchronous=NORMAL;
                PRAGMA temp_store=MEMORY;
                PRAGMA cache_size=-8000;
                PRAGMA wal_autocheckpoint=1000;
                PRAGMA mmap_size=268435456;
                PRAGMA foreign_keys=ON;
                "#,
        )
    });

    Pool::builder()
        .max_size(10)
        .build(manager)
        .map_err(|e| format!("Failed to create pool: {}", e))
}

pub fn reload_database(app: &tauri::AppHandle) -> Result<(), String> {
    use crate::utils::log_info;

    let path = db_path(app)?;
    log_info(
        app,
        "database",
        format!("Reloading database from {:?}", path),
    );

    {
        let conn = open_db(app)?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| format!("WAL checkpoint failed before reload: {}", e))?;
        log_info(app, "database", "WAL checkpoint completed before reload");
    }

    let new_pool = create_pool_for_path(&path)?;

    let conn = new_pool
        .get()
        .map_err(|e| format!("Failed to get connection from new pool: {}", e))?;
    init_db(app, &conn)?;

    drop(conn);

    let swappable = app.state::<SwappablePool>();
    swappable.swap(new_pool)?;

    migrations::run_migrations(app)?;

    log_info(app, "database", "Database pool reloaded successfully");

    let _ = app.emit("database-reloaded", ());

    Ok(())
}

pub fn init_pool(app: &tauri::AppHandle) -> Result<DbPool, String> {
    let path = db_path(app)?;

    // Debug logging
    log_info(app, "database", format!("Database path: {:?}", path));
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            log_info(
                app,
                "database",
                format!("Creating parent directory: {:?}", parent),
            );
            fs::create_dir_all(parent).map_err(|e| {
                log_warn(
                    app,
                    "database",
                    format!("Failed to create parent directory: {:?}", e),
                );
                e.to_string()
            })?;
        }
    }

    let manager = SqliteConnectionManager::file(&path).with_init(|c| {
        c.execute_batch(
            r#"
                PRAGMA journal_mode=WAL;
                PRAGMA synchronous=NORMAL;
                PRAGMA temp_store=MEMORY;
                PRAGMA cache_size=-8000;
                PRAGMA wal_autocheckpoint=1000;
                PRAGMA mmap_size=268435456;
                PRAGMA foreign_keys=ON;
                "#,
        )
    });

    let pool = Pool::builder()
        .max_size(10)
        .build(manager)
        .map_err(|e| format!("Failed to create pool: {}", e))?;

    // Initialize the database schema on the first connection
    let conn = pool
        .get()
        .map_err(|e| format!("Failed to get connection from pool for init: {}", e))?;
    init_db(app, &conn)?;

    Ok(pool)
}

pub fn open_db(app: &tauri::AppHandle) -> Result<DbConnection, String> {
    let swappable = app.state::<SwappablePool>();
    swappable.get_connection()
}

pub fn init_db(_app: &tauri::AppHandle, conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY CHECK(id=1),
          default_provider_credential_id TEXT,
          default_model_id TEXT,
          app_state TEXT NOT NULL DEFAULT '{}',
          advanced_model_settings TEXT,
          prompt_template_id TEXT,
          system_prompt TEXT,
          advanced_settings TEXT,
          migration_version INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_credentials (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          label TEXT NOT NULL,
          api_key_ref TEXT,
          api_key TEXT,
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
          model_type TEXT NOT NULL DEFAULT 'chat',
          input_scopes TEXT,
          output_scopes TEXT,
          advanced_model_settings TEXT,
          prompt_template_id TEXT,
          system_prompt TEXT
        );

        -- Secrets (API keys and similar), stored in DB instead of JSON
        CREATE TABLE IF NOT EXISTS secrets (
          service TEXT NOT NULL,
          account TEXT NOT NULL,
          value TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(service, account)
        );

        -- System prompt templates (migrated from JSON file)
        CREATE TABLE IF NOT EXISTS prompt_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          scope TEXT NOT NULL,
          target_ids TEXT NOT NULL, -- JSON array of strings
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
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
          memory_type TEXT NOT NULL DEFAULT 'manual',
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
          memories TEXT NOT NULL DEFAULT '[]',
          memory_embeddings TEXT NOT NULL DEFAULT '[]',
          memory_summary TEXT,
          memory_summary_token_count INTEGER NOT NULL DEFAULT 0,
          memory_tool_events TEXT NOT NULL DEFAULT '[]',
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
          memory_refs TEXT NOT NULL DEFAULT '[]',
          attachments TEXT NOT NULL DEFAULT '[]',
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

        -- Usage tracking
        CREATE TABLE IF NOT EXISTS usage_records (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          session_id TEXT NOT NULL,
          character_id TEXT NOT NULL,
          character_name TEXT NOT NULL,
          model_id TEXT NOT NULL,
          model_name TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          provider_label TEXT NOT NULL,
          operation_type TEXT DEFAULT 'chat',
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          total_tokens INTEGER,
          memory_tokens INTEGER,
          summary_tokens INTEGER,
          prompt_cost REAL,
          completion_cost REAL,
          total_cost REAL,
          success INTEGER NOT NULL,
          error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS usage_metadata (
          usage_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (usage_id, key),
          FOREIGN KEY(usage_id) REFERENCES usage_records(id) ON DELETE CASCADE
        );

        -- Model pricing cache (migrated from models_cache.json)
        CREATE TABLE IF NOT EXISTS model_pricing_cache (
          model_id TEXT PRIMARY KEY,
          pricing_json TEXT,
          cached_at INTEGER NOT NULL
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_sessions_character ON sessions(character_id);
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_scenes_character ON scenes(character_id);
        CREATE INDEX IF NOT EXISTS idx_scene_variants_scene ON scene_variants(scene_id);
        CREATE INDEX IF NOT EXISTS idx_personas_default ON personas(is_default);
        CREATE INDEX IF NOT EXISTS idx_usage_time ON usage_records(timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_records(provider_id);
        CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model_id);
        CREATE INDEX IF NOT EXISTS idx_usage_character ON usage_records(character_id);
        CREATE INDEX IF NOT EXISTS idx_secrets_service ON secrets(service);
        CREATE INDEX IF NOT EXISTS idx_prompt_templates_scope ON prompt_templates(scope);
        CREATE INDEX IF NOT EXISTS idx_model_pricing_cached_at ON model_pricing_cache(cached_at);
      "#,
    )
    .map_err(|e| e.to_string())?;

    // Migrations: add memory_refs to messages if missing
    let mut stmt = conn
        .prepare("PRAGMA table_info(messages)")
        .map_err(|e| e.to_string())?;
    let mut has_memory_refs = false;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let col_name: String = row.get(1).map_err(|e| e.to_string())?;
        if col_name == "memory_refs" {
            has_memory_refs = true;
            break;
        }
    }
    if !has_memory_refs {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN memory_refs TEXT NOT NULL DEFAULT '[]'",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    // Migrations: add custom gradient columns to characters if missing
    let mut stmt2 = conn
        .prepare("PRAGMA table_info(characters)")
        .map_err(|e| e.to_string())?;
    let mut has_custom_gradient_enabled = false;
    let mut has_custom_gradient_colors = false;
    let mut has_custom_text_color = false;
    let mut has_custom_text_secondary = false;
    let mut rows2 = stmt2.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows2.next().map_err(|e| e.to_string())? {
        let col_name: String = row.get(1).map_err(|e| e.to_string())?;
        match col_name.as_str() {
            "custom_gradient_enabled" => has_custom_gradient_enabled = true,
            "custom_gradient_colors" => has_custom_gradient_colors = true,
            "custom_text_color" => has_custom_text_color = true,
            "custom_text_secondary" => has_custom_text_secondary = true,
            _ => {}
        }
    }
    if !has_custom_gradient_enabled {
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN custom_gradient_enabled INTEGER DEFAULT 0",
            [],
        );
    }
    if !has_custom_gradient_colors {
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN custom_gradient_colors TEXT",
            [],
        );
    }
    if !has_custom_text_color {
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN custom_text_color TEXT",
            [],
        );
    }
    if !has_custom_text_secondary {
        let _ = conn.execute(
            "ALTER TABLE characters ADD COLUMN custom_text_secondary TEXT",
            [],
        );
    }

    let default_content = crate::chat_manager::prompt_engine::default_system_prompt_template();
    let now = now_ms();
    conn
        .execute(
            "INSERT OR IGNORE INTO prompt_templates (id, name, scope, target_ids, content, created_at, updated_at)
             VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?5)",
            params![
                "prompt_app_default",
                "App Default",
                "AppWide",
                default_content,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn now_ms() -> u64 {
    now_millis().unwrap_or(0)
}

fn apply_pragmas(conn: &Connection) {
    let _ = conn.execute_batch(
        r#"
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA temp_store=MEMORY;
        PRAGMA cache_size=-8000; -- ~8MB
        PRAGMA wal_autocheckpoint=1000;
        PRAGMA mmap_size=268435456; -- 256MB if supported
        PRAGMA optimize;
        "#,
    );
}

#[tauri::command]
pub fn db_optimize(app: tauri::AppHandle) -> Result<(), String> {
    let conn = open_db(&app)?;
    apply_pragmas(&conn);
    // Vacuum only on mobile targets
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = conn.execute_batch("VACUUM;");
    }
    Ok(())
}

/// Force a WAL checkpoint to ensure all pending writes are persisted.
/// This should be called when the app is about to be backgrounded or closed.
#[tauri::command]
pub fn db_checkpoint(app: tauri::AppHandle) -> Result<(), String> {
    let conn = open_db(&app)?;
    // PRAGMA wal_checkpoint(TRUNCATE) forces a full checkpoint and truncates the WAL file
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("WAL checkpoint failed: {}", e))?;
    Ok(())
}
