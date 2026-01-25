use rusqlite::params;

use crate::storage_manager::db::DbConnection;
use crate::sync::models::{
    Character, CharacterLorebookLink, CharacterRule, Message, MessageVariant, Model,
    ModelPricingCache, Persona, PromptTemplate, ProviderCredential, Scene, SceneVariant, Secret,
    Session, Settings, SyncLorebook, SyncLorebookEntry, UsageMetadata, UsageRecord,
};
use crate::sync::protocol::{Manifest, SyncLayer};

pub fn get_local_manifest(conn: &DbConnection) -> Result<Manifest, String> {
    let mut manifest = Manifest::default();

    // 1. Lorebooks
    let mut stmt = conn
        .prepare("SELECT id, updated_at FROM lorebooks")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (id, updated): (String, i64) = row.map_err(|e| e.to_string())?;
        manifest.lorebooks.insert(id, updated);
    }

    // 2. Characters
    let mut stmt = conn
        .prepare("SELECT id, updated_at FROM characters")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (id, updated): (String, i64) = row.map_err(|e| e.to_string())?;
        manifest.characters.insert(id, updated);
    }

    // 3. Sessions
    let mut stmt = conn
        .prepare("SELECT id, updated_at FROM sessions")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (id, updated): (String, i64) = row.map_err(|e| e.to_string())?;
        manifest.sessions.insert(id, updated);
    }

    Ok(manifest)
}

pub fn fetch_layer_data(
    conn: &DbConnection,
    layer: SyncLayer,
    ids: &[String],
) -> Result<Vec<u8>, String> {
    match layer {
        SyncLayer::Globals => fetch_globals(conn),
        SyncLayer::Lorebooks => fetch_lorebooks(conn, ids),
        SyncLayer::Characters => fetch_characters(conn, ids),
        SyncLayer::Sessions => fetch_sessions(conn, ids),
    }
}

fn fetch_globals(conn: &DbConnection) -> Result<Vec<u8>, String> {
    // Settings
    let mut stmt = conn.prepare("SELECT id, default_provider_credential_id, default_model_id, app_state, prompt_template_id, system_prompt, advanced_settings, migration_version, created_at, updated_at FROM settings").map_err(|e| e.to_string())?;
    let settings_iter = stmt
        .query_map([], |r| {
            Ok(Settings {
                id: r.get(0)?,
                default_provider_credential_id: r.get(1)?,
                default_model_id: r.get(2)?,
                app_state: r.get(3)?,
                prompt_template_id: r.get(4)?,
                system_prompt: r.get(5)?,
                advanced_settings: r.get(6)?,
                migration_version: r.get(7)?,
                created_at: r.get(8)?,
                updated_at: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let settings: Vec<Settings> = settings_iter.map(|r| r.unwrap()).collect(); // Expect safe unwrap if query OK

    // Personas
    let mut stmt = conn
        .prepare("SELECT id, title, description, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, is_default, created_at, updated_at FROM personas")
        .map_err(|e| e.to_string())?;
    let personas: Vec<Persona> = stmt
        .query_map([], |r| {
            Ok(Persona {
                id: r.get(0)?,
                title: r.get(1)?,
                description: r.get(2)?,
                avatar_path: r.get(3)?,
                avatar_crop_x: r.get(4)?,
                avatar_crop_y: r.get(5)?,
                avatar_crop_scale: r.get(6)?,
                is_default: r.get(7)?,
                created_at: r.get(8)?,
                updated_at: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Models
    let mut stmt = conn.prepare("SELECT id, name, provider_id, provider_label, display_name, created_at, model_type, input_scopes, output_scopes, advanced_model_settings, prompt_template_id, system_prompt FROM models").map_err(|e| e.to_string())?;
    let models: Vec<Model> = stmt
        .query_map([], |r| {
            Ok(Model {
                id: r.get(0)?,
                name: r.get(1)?,
                provider_id: r.get(2)?,
                provider_label: r.get(3)?,
                display_name: r.get(4)?,
                created_at: r.get(5)?,
                model_type: r.get(6)?,
                input_scopes: r.get(7)?,
                output_scopes: r.get(8)?,
                advanced_model_settings: r.get(9)?,
                prompt_template_id: r.get(10)?,
                system_prompt: r.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Secrets
    let mut stmt = conn
        .prepare("SELECT service, account, value, created_at, updated_at FROM secrets")
        .map_err(|e| e.to_string())?;
    let secrets: Vec<Secret> = stmt
        .query_map([], |r| {
            Ok(Secret {
                service: r.get(0)?,
                account: r.get(1)?,
                value: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Provider Creds
    let mut stmt = conn.prepare("SELECT id, provider_id, label, api_key_ref, api_key, base_url, default_model, headers, config FROM provider_credentials").map_err(|e| e.to_string())?;
    let creds: Vec<ProviderCredential> = stmt
        .query_map([], |r| {
            Ok(ProviderCredential {
                id: r.get(0)?,
                provider_id: r.get(1)?,
                label: r.get(2)?,
                api_key_ref: r.get(3)?,
                api_key: r.get(4)?,
                base_url: r.get(5)?,
                default_model: r.get(6)?,
                headers: r.get(7)?,
                config: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Prompt Templates
    let mut stmt = conn.prepare("SELECT id, name, scope, target_ids, content, created_at, updated_at FROM prompt_templates").map_err(|e| e.to_string())?;
    let templates: Vec<PromptTemplate> = stmt
        .query_map([], |r| {
            Ok(PromptTemplate {
                id: r.get(0)?,
                name: r.get(1)?,
                scope: r.get(2)?,
                target_ids: r.get(3)?,
                content: r.get(4)?,
                created_at: r.get(5)?,
                updated_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Model Pricing
    let mut stmt = conn
        .prepare("SELECT model_id, pricing_json, cached_at FROM model_pricing_cache")
        .map_err(|e| e.to_string())?;
    let pricing: Vec<ModelPricingCache> = stmt
        .query_map([], |r| {
            Ok(ModelPricingCache {
                model_id: r.get(0)?,
                pricing_json: r.get(1)?,
                cached_at: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    let payload_tuple = (
        settings, personas, models, secrets, creds, templates, pricing,
    );
    bincode::serialize(&payload_tuple).map_err(|e| e.to_string())
}

fn fetch_lorebooks(conn: &DbConnection, ids: &[String]) -> Result<Vec<u8>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql_lb = format!(
        "SELECT id, name, created_at, updated_at FROM lorebooks WHERE id IN ({})",
        placeholders
    );

    let mut stmt = conn.prepare(&sql_lb).map_err(|e| e.to_string())?;
    let lorebooks: Vec<SyncLorebook> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(SyncLorebook {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
                updated_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Entries for these lorebooks
    let sql_ent = format!("SELECT id, lorebook_id, title, enabled, always_active, keywords, case_sensitive, content, priority, display_order, created_at, updated_at FROM lorebook_entries WHERE lorebook_id IN ({})", placeholders);
    let mut stmt = conn.prepare(&sql_ent).map_err(|e| e.to_string())?;
    let entries: Vec<SyncLorebookEntry> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(SyncLorebookEntry {
                id: r.get(0)?,
                lorebook_id: r.get(1)?,
                title: r.get(2)?,
                enabled: r.get(3)?,
                always_active: r.get(4)?,
                keywords: r.get(5)?,
                case_sensitive: r.get(6)?,
                content: r.get(7)?,
                priority: r.get(8)?,
                display_order: r.get(9)?,
                created_at: r.get(10)?,
                updated_at: r.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    bincode::serialize(&(lorebooks, entries)).map_err(|e| e.to_string())
}

fn fetch_characters(conn: &DbConnection, ids: &[String]) -> Result<Vec<u8>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    // Characters
    let sql = format!("SELECT id, name, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, background_image_path, description, definition, default_scene_id, default_model_id, memory_type, prompt_template_id, system_prompt, voice_config, voice_autoplay, disable_avatar_gradient, custom_gradient_enabled, custom_gradient_colors, custom_text_color, custom_text_secondary, created_at, updated_at FROM characters WHERE id IN ({})", placeholders);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let chars: Vec<Character> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(Character {
                id: r.get(0)?,
                name: r.get(1)?,
                avatar_path: r.get(2)?,
                avatar_crop_x: r.get(3)?,
                avatar_crop_y: r.get(4)?,
                avatar_crop_scale: r.get(5)?,
                background_image_path: r.get(6)?,
                description: r.get(7)?,
                definition: r.get(8)?,
                default_scene_id: r.get(9)?,
                default_model_id: r.get(10)?,
                memory_type: r.get(11)?,
                prompt_template_id: r.get(12)?,
                system_prompt: r.get(13)?,
                voice_config: r.get(14)?,
                voice_autoplay: r.get(15)?,
                disable_avatar_gradient: r.get(16)?,
                custom_gradient_enabled: r.get(17)?,
                custom_gradient_colors: r.get(18)?,
                custom_text_color: r.get(19)?,
                custom_text_secondary: r.get(20)?,
                created_at: r.get(21)?,
                updated_at: r.get(22)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Rules
    let sql_rules = format!(
        "SELECT character_id, idx, rule FROM character_rules WHERE character_id IN ({})",
        placeholders
    );
    let mut stmt = conn.prepare(&sql_rules).map_err(|e| e.to_string())?;
    let rules: Vec<CharacterRule> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(CharacterRule {
                id: None,
                character_id: r.get(0)?,
                idx: r.get(1)?,
                rule: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Scenes
    let sql_scenes = format!("SELECT id, character_id, content, created_at, selected_variant_id FROM scenes WHERE character_id IN ({})", placeholders);
    let mut stmt = conn.prepare(&sql_scenes).map_err(|e| e.to_string())?;
    let scenes: Vec<Scene> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(Scene {
                id: r.get(0)?,
                character_id: r.get(1)?,
                content: r.get(2)?,
                created_at: r.get(3)?,
                selected_variant_id: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Scene Variants
    let sql_vars = format!("SELECT id, scene_id, content, created_at FROM scene_variants WHERE scene_id IN (SELECT id FROM scenes WHERE character_id IN ({}))", placeholders);
    let mut stmt = conn.prepare(&sql_vars).map_err(|e| e.to_string())?;
    let variants: Vec<SceneVariant> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(SceneVariant {
                id: r.get(0)?,
                scene_id: r.get(1)?,
                content: r.get(2)?,
                created_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Character Lorebook Links
    let sql_links = format!("SELECT character_id, lorebook_id, enabled, display_order, created_at, updated_at FROM character_lorebooks WHERE character_id IN ({})", placeholders);
    let mut stmt = conn.prepare(&sql_links).map_err(|e| e.to_string())?;
    let links: Vec<CharacterLorebookLink> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(CharacterLorebookLink {
                character_id: r.get(0)?,
                lorebook_id: r.get(1)?,
                enabled: r.get(2)?,
                display_order: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    bincode::serialize(&(chars, rules, scenes, variants, links)).map_err(|e| e.to_string())
}

fn fetch_sessions(conn: &DbConnection, ids: &[String]) -> Result<Vec<u8>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    // Sessions
    let sql = format!("SELECT id, character_id, title, system_prompt, selected_scene_id, persona_id, persona_disabled, voice_autoplay, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, memories, memory_embeddings, memory_summary, memory_summary_token_count, memory_tool_events, archived, created_at, updated_at, memory_status, memory_error FROM sessions WHERE id IN ({})", placeholders);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let sessions: Vec<Session> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(Session {
                id: r.get(0)?,
                character_id: r.get(1)?,
                title: r.get(2)?,
                system_prompt: r.get(3)?,
                selected_scene_id: r.get(4)?,
                persona_id: r.get(5)?,
                persona_disabled: r.get(6)?,
                voice_autoplay: r.get(7)?,
                temperature: r.get(8)?,
                top_p: r.get(9)?,
                max_output_tokens: r.get(10)?,
                frequency_penalty: r.get(11)?,
                presence_penalty: r.get(12)?,
                top_k: r.get(13)?,
                memories: r.get(14)?,
                memory_embeddings: r.get(15)?,
                memory_summary: r.get(16)?,
                memory_summary_token_count: r.get(17)?,
                memory_tool_events: r.get(18)?,
                archived: r.get(19)?,
                created_at: r.get(20)?,
                updated_at: r.get(21)?,
                memory_status: r.get(22)?,
                memory_error: r.get(23)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Messages
    let sql_msg = format!("SELECT id, session_id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned, memory_refs, attachments, reasoning FROM messages WHERE session_id IN ({})", placeholders);
    let mut stmt = conn.prepare(&sql_msg).map_err(|e| e.to_string())?;
    let messages: Vec<Message> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(Message {
                id: r.get(0)?,
                session_id: r.get(1)?,
                role: r.get(2)?,
                content: r.get(3)?,
                created_at: r.get(4)?,
                prompt_tokens: r.get(5)?,
                completion_tokens: r.get(6)?,
                total_tokens: r.get(7)?,
                selected_variant_id: r.get(8)?,
                is_pinned: r.get(9)?,
                memory_refs: r.get(10)?,
                attachments: r.get(11)?,
                reasoning: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Message Variants
    let sql_var = format!("SELECT id, message_id, content, created_at, prompt_tokens, completion_tokens, total_tokens, reasoning FROM message_variants WHERE message_id IN (SELECT id FROM messages WHERE session_id IN ({}))", placeholders);
    let mut stmt = conn.prepare(&sql_var).map_err(|e| e.to_string())?;
    let variants: Vec<MessageVariant> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(MessageVariant {
                id: r.get(0)?,
                message_id: r.get(1)?,
                content: r.get(2)?,
                created_at: r.get(3)?,
                prompt_tokens: r.get(4)?,
                completion_tokens: r.get(5)?,
                total_tokens: r.get(6)?,
                reasoning: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Usage Records
    let sql_usage = format!("SELECT id, timestamp, session_id, character_id, character_name, model_id, model_name, provider_id, provider_label, operation_type, prompt_tokens, completion_tokens, total_tokens, memory_tokens, summary_tokens, reasoning_tokens, image_tokens, prompt_cost, completion_cost, total_cost, success, error_message FROM usage_records WHERE session_id IN ({})", placeholders);
    let mut stmt = conn.prepare(&sql_usage).map_err(|e| e.to_string())?;
    let usages: Vec<UsageRecord> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(UsageRecord {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                session_id: r.get(2)?,
                character_id: r.get(3)?,
                character_name: r.get(4)?,
                model_id: r.get(5)?,
                model_name: r.get(6)?,
                provider_id: r.get(7)?,
                provider_label: r.get(8)?,
                operation_type: r.get(9)?,
                prompt_tokens: r.get(10)?,
                completion_tokens: r.get(11)?,
                total_tokens: r.get(12)?,
                memory_tokens: r.get(13)?,
                summary_tokens: r.get(14)?,
                reasoning_tokens: r.get(15)?,
                image_tokens: r.get(16)?,
                prompt_cost: r.get(17)?,
                completion_cost: r.get(18)?,
                total_cost: r.get(19)?,
                success: r.get(20)?,
                error_message: r.get(21)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    // Usage Metadata
    let sql_meta = format!("SELECT usage_id, key, value FROM usage_metadata WHERE usage_id IN (SELECT id FROM usage_records WHERE session_id IN ({}))", placeholders);
    let mut stmt = conn.prepare(&sql_meta).map_err(|e| e.to_string())?;
    let metadata: Vec<UsageMetadata> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
            Ok(UsageMetadata {
                usage_id: r.get(0)?,
                key: r.get(1)?,
                value: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.unwrap())
        .collect();

    bincode::serialize(&(sessions, messages, variants, usages, metadata)).map_err(|e| e.to_string())
}

pub fn apply_layer_data(
    conn: &mut DbConnection,
    layer: SyncLayer,
    data: &[u8],
) -> Result<(), String> {
    match layer {
        SyncLayer::Globals => apply_globals(conn, data),
        SyncLayer::Lorebooks => apply_lorebooks(conn, data),
        SyncLayer::Characters => apply_characters(conn, data),
        SyncLayer::Sessions => apply_sessions(conn, data),
    }
}

type GlobalsData = (
    Vec<Settings>,
    Vec<Persona>,
    Vec<Model>,
    Vec<Secret>,
    Vec<ProviderCredential>,
    Vec<PromptTemplate>,
    Vec<ModelPricingCache>,
);

fn apply_globals(conn: &mut DbConnection, data: &[u8]) -> Result<(), String> {
    let (settings, personas, models, secrets, creds, templates, pricing): GlobalsData =
        bincode::deserialize(data).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Settings (ID=1)
    if let Some(s) = settings.first() {
        tx.execute(r#"INSERT OR REPLACE INTO settings (id, default_provider_credential_id, default_model_id, app_state, prompt_template_id, system_prompt, advanced_settings, migration_version, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#,
                    params![s.id, s.default_provider_credential_id, s.default_model_id, s.app_state, s.prompt_template_id, s.system_prompt, s.advanced_settings, s.migration_version, s.created_at, s.updated_at])
            .map_err(|e| e.to_string())?;
    }

    // Personas
    for p in personas {
        tx.execute(r#"INSERT OR REPLACE INTO personas (id, title, description, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, is_default, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#,
                   params![p.id, p.title, p.description, p.avatar_path, p.avatar_crop_x, p.avatar_crop_y, p.avatar_crop_scale, p.is_default, p.created_at, p.updated_at]).map_err(|e| e.to_string())?;
    }

    // Models
    for m in models {
        tx.execute(r#"INSERT OR REPLACE INTO models (id, name, provider_id, provider_label, display_name, created_at, model_type, input_scopes, output_scopes, advanced_model_settings, prompt_template_id, system_prompt)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"#,
                     params![m.id, m.name, m.provider_id, m.provider_label, m.display_name, m.created_at, m.model_type, m.input_scopes, m.output_scopes, m.advanced_model_settings, m.prompt_template_id, m.system_prompt]).map_err(|e| e.to_string())?;
    }

    // Secrets
    for s in secrets {
        tx.execute(r#"INSERT OR REPLACE INTO secrets (service, account, value, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)"#,
                   params![s.service, s.account, s.value, s.created_at, s.updated_at]).map_err(|e| e.to_string())?;
    }

    // Provider Credentials
    for c in creds {
        tx.execute(r#"INSERT OR REPLACE INTO provider_credentials (id, provider_id, label, api_key_ref, api_key, base_url, default_model, headers, config)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
                    params![c.id, c.provider_id, c.label, c.api_key_ref, c.api_key, c.base_url, c.default_model, c.headers, c.config]).map_err(|e| e.to_string())?;
    }

    // Prompt Templates
    for t in templates {
        tx.execute(r#"INSERT OR REPLACE INTO prompt_templates (id, name, scope, target_ids, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
                   params![t.id, t.name, t.scope, t.target_ids, t.content, t.created_at, t.updated_at]).map_err(|e| e.to_string())?;
    }

    // Pricing
    for p in pricing {
        tx.execute(r#"INSERT OR REPLACE INTO model_pricing_cache (model_id, pricing_json, cached_at) VALUES (?1, ?2, ?3)"#,
                   params![p.model_id, p.pricing_json, p.cached_at]).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn apply_lorebooks(conn: &mut DbConnection, data: &[u8]) -> Result<(), String> {
    let (lorebooks, entries): (Vec<SyncLorebook>, Vec<SyncLorebookEntry>) =
        bincode::deserialize(data).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for l in lorebooks {
        tx.execute(r#"INSERT OR REPLACE INTO lorebooks (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)"#,
                   params![l.id, l.name, l.created_at, l.updated_at]).map_err(|e| e.to_string())?;
    }

    for e in entries {
        tx.execute(r#"INSERT OR REPLACE INTO lorebook_entries (id, lorebook_id, title, enabled, always_active, keywords, case_sensitive, content, priority, display_order, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"#,
                    params![e.id, e.lorebook_id, e.title, e.enabled, e.always_active, e.keywords, e.case_sensitive, e.content, e.priority, e.display_order, e.created_at, e.updated_at]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

type CharactersData = (
    Vec<Character>,
    Vec<CharacterRule>,
    Vec<Scene>,
    Vec<SceneVariant>,
    Vec<CharacterLorebookLink>,
);

fn apply_characters(conn: &mut DbConnection, data: &[u8]) -> Result<(), String> {
    let (chars, rules, scenes, variants, links): CharactersData =
        bincode::deserialize(data).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for c in chars {
        tx.execute(r#"INSERT OR REPLACE INTO characters (id, name, avatar_path, avatar_crop_x, avatar_crop_y, avatar_crop_scale, background_image_path, description, definition, default_scene_id, default_model_id, memory_type, prompt_template_id, system_prompt, voice_config, voice_autoplay, disable_avatar_gradient, custom_gradient_enabled, custom_gradient_colors, custom_text_color, custom_text_secondary, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)"#,
                    params![c.id, c.name, c.avatar_path, c.avatar_crop_x, c.avatar_crop_y, c.avatar_crop_scale, c.background_image_path, c.description, c.definition, c.default_scene_id, c.default_model_id, c.memory_type, c.prompt_template_id, c.system_prompt, c.voice_config, c.voice_autoplay, c.disable_avatar_gradient, c.custom_gradient_enabled, c.custom_gradient_colors, c.custom_text_color, c.custom_text_secondary, c.created_at, c.updated_at]).map_err(|e| e.to_string())?;
    }

    for r in &rules {
        tx.execute(
            "DELETE FROM character_rules WHERE character_id = ?1",
            params![r.character_id],
        )
        .ok();
    }
    for r in rules {
        tx.execute(
            "INSERT INTO character_rules (character_id, idx, rule) VALUES (?1, ?2, ?3)",
            params![r.character_id, r.idx, r.rule],
        )
        .map_err(|e| e.to_string())?;
    }

    for s in scenes {
        tx.execute(r#"INSERT OR REPLACE INTO scenes (id, character_id, content, created_at, selected_variant_id) VALUES (?1, ?2, ?3, ?4, ?5)"#,
                    params![s.id, s.character_id, s.content, s.created_at, s.selected_variant_id]).map_err(|e| e.to_string())?;
    }

    for v in variants {
        tx.execute(r#"INSERT OR REPLACE INTO scene_variants (id, scene_id, content, created_at) VALUES (?1, ?2, ?3, ?4)"#,
                   params![v.id, v.scene_id, v.content, v.created_at]).map_err(|e| e.to_string())?;
    }

    for l in links {
        tx.execute(r#"INSERT OR REPLACE INTO character_lorebooks (character_id, lorebook_id, enabled, display_order, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
                    params![l.character_id, l.lorebook_id, l.enabled, l.display_order, l.created_at, l.updated_at]).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

type SessionsData = (
    Vec<Session>,
    Vec<Message>,
    Vec<MessageVariant>,
    Vec<UsageRecord>,
    Vec<UsageMetadata>,
);

fn apply_sessions(conn: &mut DbConnection, data: &[u8]) -> Result<(), String> {
    let (sessions, messages, variants, usages, metadata): SessionsData =
        bincode::deserialize(data).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for s in sessions {
        tx.execute(r#"INSERT OR REPLACE INTO sessions (id, character_id, title, system_prompt, selected_scene_id, persona_id, persona_disabled, voice_autoplay, temperature, top_p, max_output_tokens, frequency_penalty, presence_penalty, top_k, memories, memory_embeddings, memory_summary, memory_summary_token_count, memory_tool_events, archived, created_at, updated_at, memory_status, memory_error)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)"#,
                    params![s.id, s.character_id, s.title, s.system_prompt, s.selected_scene_id, s.persona_id, s.persona_disabled, s.voice_autoplay, s.temperature, s.top_p, s.max_output_tokens, s.frequency_penalty, s.presence_penalty, s.top_k, s.memories, s.memory_embeddings, s.memory_summary, s.memory_summary_token_count, s.memory_tool_events, s.archived, s.created_at, s.updated_at, s.memory_status, s.memory_error]).map_err(|e| e.to_string())?;
    }

    for m in messages {
        tx.execute(r#"INSERT OR REPLACE INTO messages (id, session_id, role, content, created_at, prompt_tokens, completion_tokens, total_tokens, selected_variant_id, is_pinned, memory_refs, attachments, reasoning)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"#,
                    params![m.id, m.session_id, m.role, m.content, m.created_at, m.prompt_tokens, m.completion_tokens, m.total_tokens, m.selected_variant_id, m.is_pinned, m.memory_refs, m.attachments, m.reasoning]).map_err(|e| e.to_string())?;
    }

    for v in variants {
        tx.execute(r#"INSERT OR REPLACE INTO message_variants (id, message_id, content, created_at, prompt_tokens, completion_tokens, total_tokens, reasoning)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
                    params![v.id, v.message_id, v.content, v.created_at, v.prompt_tokens, v.completion_tokens, v.total_tokens, v.reasoning]).map_err(|e| e.to_string())?;
    }

    for u in usages {
        tx.execute(r#"INSERT OR REPLACE INTO usage_records (id, timestamp, session_id, character_id, character_name, model_id, model_name, provider_id, provider_label, operation_type, prompt_tokens, completion_tokens, total_tokens, memory_tokens, summary_tokens, reasoning_tokens, image_tokens, prompt_cost, completion_cost, total_cost, success, error_message)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)"#,
                    params![u.id, u.timestamp, u.session_id, u.character_id, u.character_name, u.model_id, u.model_name, u.provider_id, u.provider_label, u.operation_type, u.prompt_tokens, u.completion_tokens, u.total_tokens, u.memory_tokens, u.summary_tokens, u.reasoning_tokens, u.image_tokens, u.prompt_cost, u.completion_cost, u.total_cost, u.success, u.error_message]).map_err(|e| e.to_string())?;
    }

    for md in metadata {
        tx.execute(
            r#"INSERT OR REPLACE INTO usage_metadata (usage_id, key, value) VALUES (?1, ?2, ?3)"#,
            params![md.usage_id, md.key, md.value],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub struct FileMeta {
    pub path: String,
}

pub fn scan_for_missing_files(conn: &DbConnection, app_handle: &tauri::AppHandle) -> Vec<String> {
    let mut missing = Vec::new();
    let storage_root = crate::storage_manager::legacy::storage_root(app_handle).unwrap_or_default();

    let mut check = |path: Option<String>| {
        if let Some(p) = path {
            if !p.starts_with("http") {
                let full_path = storage_root.join(&p);
                if !full_path.exists() {
                    missing.push(p);
                }
            }
        }
    };

    let mut stmt = conn
        .prepare("SELECT avatar_path, background_image_path FROM characters")
        .unwrap();
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    for r in rows {
        let (a, b): (Option<String>, Option<String>) = r.unwrap();
        check(a);
        check(b);
    }

    let mut stmt = conn.prepare("SELECT avatar_path FROM personas").unwrap();
    let rows = stmt.query_map([], |r| r.get(0)).unwrap();
    for r in rows {
        let a: Option<String> = r.unwrap();
        check(a);
    }

    #[derive(serde::Deserialize)]
    struct AttachmentStub {
        path: String,
    }

    let mut stmt = conn
        .prepare("SELECT attachments FROM messages WHERE attachments != '[]'")
        .unwrap();
    let rows = stmt.query_map([], |r| r.get::<_, String>(0)).unwrap();
    for r in rows {
        let json = r.unwrap();
        if let Ok(atts) = serde_json::from_str::<Vec<AttachmentStub>>(&json) {
            for att in atts {
                check(Some(att.path));
            }
        }
    }

    missing.sort();
    missing.dedup();
    missing
}
