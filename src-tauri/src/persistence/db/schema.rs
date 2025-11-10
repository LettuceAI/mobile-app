use rusqlite::Connection;

pub fn create_schema(conn: &Connection) -> Result<(), String> {
    // NOTE: Initial schema. Tables may evolve; use IF NOT EXISTS for additive bootstrap.
    let sql = r#"
    -- Core settings (singleton row with id='singleton')
    CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        default_provider_credential_id TEXT,
        default_model_id TEXT,
        theme TEXT NOT NULL CHECK(theme IN ('light','dark')),
        pure_mode_enabled INTEGER NOT NULL,
        onboarding_completed INTEGER NOT NULL,
        onboarding_skipped INTEGER NOT NULL,
        provider_setup_completed INTEGER NOT NULL,
        model_setup_completed INTEGER NOT NULL,
        migration_version INTEGER NOT NULL,
        prompt_template_id TEXT,
        system_prompt TEXT,
        updated_at INTEGER NOT NULL
    );

    -- Provider credentials with simplified API key storage
    CREATE TABLE IF NOT EXISTS provider_credentials (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        label TEXT NOT NULL,
        api_key TEXT,
        base_url TEXT,
        default_model TEXT,
        headers_json TEXT,
        created_at INTEGER,
        updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider ON provider_credentials(provider_id);

    -- Models known to the app
    CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_label TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at INTEGER,
        advanced_settings_json TEXT,
        prompt_template_id TEXT,
        system_prompt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);

    -- Characters
    CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar_image_id TEXT,
        background_image_id TEXT,
        description TEXT,
        default_scene_id TEXT,
        default_model_id TEXT,
        prompt_template_id TEXT,
        system_prompt TEXT,
        disable_avatar_gradient INTEGER DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS character_rules (
        character_id TEXT NOT NULL,
        rule_order INTEGER NOT NULL,
        content TEXT NOT NULL,
        PRIMARY KEY(character_id, rule_order),
        FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    -- Scenes and variants
    CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER,
        selected_variant_id TEXT,
        FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scene_variants (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER,
        FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
    );

    -- Personas
    CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        avatar_image_id TEXT,
        is_default INTEGER,
        created_at INTEGER,
        updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_personas_is_default ON personas(is_default);

    -- Sessions & messages
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        title TEXT NOT NULL,
        system_prompt TEXT,
        selected_scene_id TEXT,
        persona_id TEXT,
        archived INTEGER DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER,
        advanced_settings_json TEXT,
        FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE,
        FOREIGN KEY(persona_id) REFERENCES personas(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_character ON sessions(character_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);

    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system','user','assistant','scene')),
        content TEXT NOT NULL,
        created_at INTEGER,
        is_pinned INTEGER DEFAULT 0,
        selected_variant_id TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

    CREATE TABLE IF NOT EXISTS message_variants (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    -- Usage tracking
    CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        session_id TEXT,
        character_id TEXT,
        character_name TEXT,
        model_id TEXT,
        model_name TEXT,
        provider_id TEXT,
        provider_label TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        cost_total REAL,
        success INTEGER,
        error_message TEXT,
        metadata_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_records(provider_id);
    CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model_id);
    CREATE INDEX IF NOT EXISTS idx_usage_character ON usage_records(character_id);
    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_records(session_id);

    -- Model caches
    CREATE TABLE IF NOT EXISTS model_list_cache (
        cred_id TEXT PRIMARY KEY,
        models_json TEXT NOT NULL,
        fetched_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_model_list_cache_fetched_at ON model_list_cache(fetched_at);

    CREATE TABLE IF NOT EXISTS model_pricing_cache (
        model_id TEXT PRIMARY KEY,
        pricing_json TEXT,
        cached_at INTEGER
    );

    -- Avatar gradients cache
    CREATE TABLE IF NOT EXISTS avatar_gradients (
        entity_type TEXT NOT NULL CHECK(entity_type IN ('character','persona')),
        entity_id TEXT NOT NULL,
        gradient_css TEXT NOT NULL,
        dominant_hue REAL,
        text_color TEXT,
        text_secondary TEXT,
        colors_json TEXT NOT NULL,
        updated_at INTEGER,
        PRIMARY KEY(entity_type, entity_id)
    );

    -- Images metadata (files remain on disk; future: BLOB storage table if needed)
    CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        created_at INTEGER
    );

    -- Tooltips
    CREATE TABLE IF NOT EXISTS tooltips (
        id TEXT PRIMARY KEY,
        seen INTEGER NOT NULL
    );

    -- Prompt templates
    CREATE TABLE IF NOT EXISTS prompt_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        scope TEXT NOT NULL CHECK(scope IN ('appWide','modelSpecific','characterSpecific')),
        content TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS prompt_template_targets (
        template_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        PRIMARY KEY(template_id, target_id),
        FOREIGN KEY(template_id) REFERENCES prompt_templates(id) ON DELETE CASCADE
    );
    "#;

    conn.execute_batch(sql).map_err(|e| e.to_string())
}
