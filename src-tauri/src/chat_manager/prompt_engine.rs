use serde_json::{json, Value};
use tauri::AppHandle;

use super::lorebook_matcher::{format_lorebook_for_prompt, get_active_lorebook_entries};
use super::prompts;
use super::types::{Character, Model, Persona, Session, Settings};
use crate::storage_manager::db::open_db;

pub fn default_system_prompt_template() -> String {
    "
    You are participating in an immersive roleplay. Your goal is to fully embody your character and create an engaging, authentic experience.
    
    # Scenario
    {{scene}}
    
    # Your Character: {{char.name}}
    {{char.desc}}
    
    Embody {{char.name}}'s personality, mannerisms, and speech patterns completely. Stay true to their character traits, background, and motivations in every response.
    
    # {{persona.name}}'s Character
    {{persona.desc}}

    # World Information
    The following is essential lore about this world, its characters, locations, items, and concepts. You MUST incorporate this information naturally into your roleplay when relevant. Treat this as established canon that shapes how characters behave, what they know, and how the world works.
    {{lorebook}}

    # Context Summary
    {{context_summary}}

    # Key Memories
    Important facts to remember in this conversation:
    {{key_memories}}
    
    # Instructions
    **Character & Roleplay:**
    - Write as {{char.name}} from their perspective, responding based on their personality, background, and current situation
    - You may also portray NPCs and background characters when relevant to the scene, but NEVER speak or act as {{persona.name}}
    - Show emotions through actions, body language, and dialogue - don't just state them
    - React authentically to {{persona.name}}'s actions and dialogue
    - Never break character unless {{persona.name}} explicitly asks you to step out of roleplay

    **World & Lore:**
    - ACTIVELY incorporate the World Information above when locations, characters, items, or concepts from the lore are relevant
    - Maintain consistency with established facts and the scenario

    **Pacing & Style:**
    - Keep responses concise and focused so {{persona.name}} can actively participate
    - Let scenes unfold naturally - avoid summarizing or rushing
    - Use vivid, sensory details for immersion
    - If you see [CONTINUE], continue exactly where you left off without restarting

    {{content_rules}}
    "
        .to_string()
}

pub fn default_dynamic_summary_prompt() -> String {
    "Your task is to maintain a single, cumulative summary of the conversation.

    You receive:
    - the previous global summary (if any)
    - the newest conversation window

    Your job:
    1. Merge the new events into the existing summary.
    2. Preserve all factual past events unless they are contradicted.
    3. Keep the chronological flow clear and coherent.
    4. Remove redundant details or repetitions.
    5. DO NOT invent motivations, emotions, or events that were not explicitly stated.

    Guidelines:
    - Capture actions, choices, facts, changes, and important context.
    - Keep the summary compact but complete.
    - If special placeholders exist ({{character}}, {{persona}}, etc.), keep them untouched.
    - Previous summary (if any): {{prev_summary}}
    - The output must be a single cohesive summary paragraph, representing the entire conversation so far.

    Output only the final merged summary with no commentary."
        .to_string()
}

pub fn default_dynamic_memory_prompt() -> String {
    "You manage long-term memories for this roleplay chat. Use tools to maintain an accurate, useful memory list.

    IMPORTANT - TOKEN BUDGET:
    Current hot memory usage: {{current_memory_tokens}}/{{hot_token_budget}} tokens
    Deleted memories are NOT lost—they go to cold storage and can be recalled later via keyword search.
    Memories decay over time unless accessed or pinned.
    
    When OVER BUDGET: You MUST delete lower-priority memories to make room for new ones.
    When UNDER BUDGET: Only delete duplicates, contradicted facts, or truly obsolete information.

    What to Remember:
    Store facts that will matter for future conversations:
    - Character reveals: Traits, backstory, fears, goals (e.g., \"{{char}} revealed they fear abandonment\")
    - Relationship changes: Bonds formed, conflicts, trust levels (e.g., \"{{persona}} and {{char}} became allies\")
    - Plot milestones: Key decisions, events, world changes (e.g., \"The group chose to enter the forbidden forest\")
    - User preferences: Tone, boundaries, or explicit requests (e.g., \"{{persona}} prefers slower pacing\")
    
    Rules:
    - Keep each memory atomic: one fact per entry, under 100 characters when possible
    - Be factual: only store what was explicitly stated or clearly happened—never infer emotions or motivations
    - Avoid duplicates: check existing memories before adding; merge or skip if redundant
    - Respect the {{max_entries}} entry limit
    - When deleting, use the 6-digit memory ID shown in brackets (e.g., delete \"847291\")
    
    Priority (what to keep vs demote):
    1. PIN: Character-defining facts that should never be forgotten
    2. KEEP: Active plot threads and unresolved conflicts  
    3. KEEP: Recent decisions with ongoing consequences
    4. DEMOTE: Resolved plot points, routine actions, outdated context
    
    Tool Usage:
    - Use `create_memory` with `text` and optionally `important: true` to pin
    - Use `delete_memory` with the memory ID or exact text
    - Use `pin_memory` to mark existing memories as critical (never decay)
    - Use `unpin_memory` to allow a memory to decay normally
    - Call `done` when finished making changes
    - Output NO natural language, only tool calls"
        .to_string()
}

/// Get lorebook content for the current conversation context
/// Scans recent messages and returns formatted lorebook entries
fn get_lorebook_content(
    app: &AppHandle,
    character_id: &str,
    session: &Session,
) -> Result<String, String> {
    let conn = open_db(app)?;

    // Get last 10 messages for keyword matching context
    let recent_messages: Vec<String> = session
        .messages
        .iter()
        .rev()
        .take(10)
        .rev()
        .map(|msg| msg.content.clone())
        .collect();

    super::super::utils::log_info(
        app,
        "lorebook",
        format!(
            "Checking lorebook for character={} with {} recent messages",
            character_id,
            recent_messages.len()
        ),
    );

    let active_entries = get_active_lorebook_entries(&conn, character_id, &recent_messages)?;

    if active_entries.is_empty() {
        super::super::utils::log_info(
            app,
            "lorebook",
            "No active lorebook entries (no keywords matched or none always-active)".to_string(),
        );
        return Ok(String::new());
    }

    let entry_titles: Vec<String> = active_entries
        .iter()
        .map(|e| {
            if e.title.is_empty() {
                format!("[{}]", &e.id[..6.min(e.id.len())])
            } else {
                e.title.clone()
            }
        })
        .collect();

    super::super::utils::log_info(
        app,
        "lorebook",
        format!(
            "Injecting {} active entries: {}",
            active_entries.len(),
            entry_titles.join(", ")
        ),
    );

    Ok(format_lorebook_for_prompt(&active_entries))
}

/// character template > model template > app default template (from database)
pub fn build_system_prompt(
    app: &AppHandle,
    character: &Character,
    model: &Model,
    persona: Option<&Persona>,
    session: &Session,
    settings: &Settings,
) -> Option<String> {
    let mut debug_parts: Vec<Value> = Vec::new();

    let base_template = if let Some(model_template_id) = &model.prompt_template_id {
        if let Ok(Some(template)) = prompts::get_template(app, model_template_id) {
            debug_parts.push(json!({
                "source": "model_template",
                "template_id": model_template_id
            }));
            template.content
        } else {
            debug_parts.push(json!({
                "source": "model_template_not_found",
                "template_id": model_template_id,
                "fallback": "character_or_app_default"
            }));
            get_character_or_app_template(app, character, settings, &mut debug_parts)
        }
    } else if let Some(char_template_id) = &character.prompt_template_id {
        if let Ok(Some(template)) = prompts::get_template(app, char_template_id) {
            debug_parts.push(json!({
                "source": "character_template",
                "template_id": char_template_id
            }));
            template.content
        } else {
            debug_parts.push(json!({
                "source": "character_template_not_found",
                "template_id": char_template_id,
                "fallback": "app_default"
            }));
            get_app_default_template_content(app, settings, &mut debug_parts)
        }
    } else {
        get_app_default_template_content(app, settings, &mut debug_parts)
    };

    let rendered = render_with_context(app, &base_template, character, persona, session, settings);

    let final_prompt = {
        let mut result = rendered;

        if !base_template.contains("{{context_summary}}") {
            if let Some(summary) = &session.memory_summary {
                if !summary.trim().is_empty() {
                    result.push_str("\n\n# Context Summary\n");
                    result.push_str(summary);
                }
            }
        }

        if !base_template.contains("{{key_memories}}") {
            if !session.memories.is_empty() {
                result.push_str("\n\n# Key Memories\n");
                result.push_str("Important facts to remember in this conversation:\n");
                for memory in &session.memories {
                    result.push_str(&format!("- {}\n", memory));
                }
            }
        }
        if !base_template.contains("{{lorebook}}") {
            let lorebook_content = match get_lorebook_content(app, &character.id, session) {
                Ok(content) => content,
                Err(_) => String::new(),
            };
            if !lorebook_content.trim().is_empty() {
                result.push_str("\n\n# World Information\n");
                result.push_str(&lorebook_content);
            }
        }

        result
    };

    debug_parts.push(json!({
        "template_vars": build_debug_vars(character, persona, session, settings),
        "memories_count": session.memories.len(),
    }));

    super::super::utils::emit_debug(app, "system_prompt_built", json!({ "debug": debug_parts }));

    let trimmed = final_prompt.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Helper function to check character template, then fall back to app default
fn get_character_or_app_template(
    app: &AppHandle,
    character: &Character,
    settings: &Settings,
    debug_parts: &mut Vec<Value>,
) -> String {
    // Try character template first
    if let Some(char_template_id) = &character.prompt_template_id {
        if let Ok(Some(template)) = prompts::get_template(app, char_template_id) {
            debug_parts.push(json!({
                "source": "character_template",
                "template_id": char_template_id
            }));
            return template.content;
        }
    }
    // Fall back to app default
    get_app_default_template_content(app, settings, debug_parts)
}

/// Helper function to get app default template content from database
fn get_app_default_template_content(
    app: &AppHandle,
    settings: &Settings,
    debug_parts: &mut Vec<Value>,
) -> String {
    // Try settings.prompt_template_id first (user's custom app default)
    if let Some(app_template_id) = &settings.prompt_template_id {
        if let Ok(Some(template)) = prompts::get_template(app, app_template_id) {
            debug_parts.push(json!({
                "source": "app_wide_template",
                "template_id": app_template_id
            }));
            return template.content;
        }
    }

    match prompts::get_template(app, prompts::APP_DEFAULT_TEMPLATE_ID) {
        Ok(Some(template)) => {
            debug_parts.push(json!({
                "source": "app_default_template",
                "template_id": prompts::APP_DEFAULT_TEMPLATE_ID
            }));
            template.content
        }
        _ => {
            debug_parts.push(json!({
                "source": "emergency_hardcoded_fallback",
                "warning": "app_default template not found in database"
            }));
            default_system_prompt_template()
        }
    }
}

/// Render a base template string with the provided context (character, persona, scene, settings).
pub fn render_with_context(
    app: &AppHandle,
    base_template: &str,
    character: &Character,
    persona: Option<&Persona>,
    session: &Session,
    settings: &Settings,
) -> String {
    render_with_context_internal(
        Some(app),
        base_template,
        character,
        persona,
        session,
        settings,
    )
}

fn render_with_context_internal(
    app: Option<&AppHandle>,
    base_template: &str,
    character: &Character,
    persona: Option<&Persona>,
    session: &Session,
    settings: &Settings,
) -> String {
    let char_name = &character.name;
    let raw_char_desc = character
        .description
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("");

    // Get persona info
    let persona_name = persona.map(|p| p.title.as_str()).unwrap_or("");
    let persona_desc = persona
        .map(|p| p.description.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("");

    let scene_id_to_use = session
        .selected_scene_id
        .as_ref()
        .or_else(|| character.default_scene_id.as_ref())
        .or_else(|| {
            if character.scenes.len() == 1 {
                character.scenes.first().map(|s| &s.id)
            } else {
                None
            }
        });

    let scene_content = if let Some(selected_scene_id) = scene_id_to_use {
        if let Some(scene) = character.scenes.iter().find(|s| &s.id == selected_scene_id) {
            let content = if let Some(variant_id) = &scene.selected_variant_id {
                scene
                    .variants
                    .iter()
                    .find(|v| &v.id == variant_id)
                    .map(|v| v.content.as_str())
                    .unwrap_or(&scene.content)
            } else {
                &scene.content
            };

            let content_trimmed = content.trim();
            if !content_trimmed.is_empty() {
                // Replace {{char}} and {{persona}} placeholders dynamically in scene text
                let mut content_processed = content_trimmed.to_string();
                content_processed = content_processed.replace("{{char}}", char_name);
                content_processed = content_processed.replace("{{persona}}", persona_name);

                if let Some(app) = app {
                    super::super::utils::log_info(
                        app,
                        "prompt_engine",
                        format!(
                            "Scene found and processed. ID: {}, length: {}",
                            selected_scene_id,
                            content_processed.len()
                        ),
                    );
                }
                content_processed
            } else {
                if let Some(app) = app {
                    super::super::utils::log_warn(
                        app,
                        "prompt_engine",
                        format!(
                            "Scene found but content is empty. ID: {}",
                            selected_scene_id
                        ),
                    );
                }
                String::new()
            }
        } else {
            if let Some(app) = app {
                super::super::utils::log_warn(app, "prompt_engine",
                    format!("Scene ID selected but not found in character. ID: {}, available scenes: {}", selected_scene_id, character.scenes.len()));
            }
            String::new()
        }
    } else {
        if let Some(app) = app {
            super::super::utils::log_info(app, "prompt_engine", "No scene selected in session");
        }
        String::new()
    };

    // Process placeholders inside the character description itself
    // Supports {{char}} -> character name and {{persona}} -> persona name (or empty string)
    let mut char_desc = raw_char_desc.to_string();
    char_desc = char_desc.replace("{{char}}", char_name);
    char_desc = char_desc.replace("{{persona}}", persona_name);

    // Build rules - Note: NSFW toggle is ignored when using custom prompts
    let pure_mode_enabled = settings
        .app_state
        .get("pureModeEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let content_rules = if pure_mode_enabled {
        "**Content Guidelines:**\n    - Keep all interactions appropriate and respectful\n    - Avoid sexual, adult, or explicit content".to_string()
    } else {
        String::new()
    };

    // Replace all template variables
    let mut result = base_template.to_string();

    if let Some(app) = app {
        super::super::utils::log_info(
            app,
            "prompt_engine",
            format!(
                "Before {{{{scene}}}} replacement - scene_content length: {}",
                scene_content.len()
            ),
        );
        super::super::utils::log_info(
            app,
            "prompt_engine",
            format!(
                "Template contains {{{{scene}}}}: {}",
                base_template.contains("{{scene}}")
            ),
        );
    }

    result = result.replace("{{scene}}", &scene_content);
    result = result.replace("{{char.name}}", char_name);
    result = result.replace("{{char.desc}}", &char_desc);
    result = result.replace("{{persona.name}}", persona_name);
    result = result.replace("{{persona.desc}}", persona_desc);
    result = result.replace("{{content_rules}}", &content_rules);
    // Legacy support for {{rules}} placeholder
    result = result.replace("{{rules}}", "");

    let context_summary_text = session
        .memory_summary
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("");

    result = result.replace("{{context_summary}}", context_summary_text);

    let key_memories_text = if session.memories.is_empty() {
        String::new()
    } else {
        session
            .memories
            .iter()
            .map(|m| format!("- {}", m))
            .collect::<Vec<_>>()
            .join("\n")
    };

    result = result.replace("{{key_memories}}", &key_memories_text);

    // Lorebook entries - get recent messages for keyword matching
    let lorebook_text = if let Some(app) = app {
        match get_lorebook_content(app, &character.id, session) {
            Ok(content) => content,
            Err(e) => {
                super::super::utils::log_warn(
                    app,
                    "prompt_engine",
                    format!("Failed to get lorebook content: {}", e),
                );
                String::new()
            }
        }
    } else {
        String::new()
    };

    let lorebook_text = if lorebook_text.trim().is_empty() && session.id == "preview" {
        "**The Sunken City of Eldara** (Sample Entry)\nAn ancient city beneath the waves, Eldara was once the capital of a great empire. Its ruins are said to contain powerful artifacts and are guarded by merfolk descendants of its original inhabitants.\n\n**Dragonstone Keep** (Sample Entry)\nA fortress built into the side of Mount Ember, known for its impenetrable walls forged from volcanic glass. The keep is ruled by House Valthor, who claim ancestry from the first dragon riders.".to_string()
    } else {
        lorebook_text
    };

    if lorebook_text.trim().is_empty() {
        result = result.replace(
            "# World Information\n    The following is essential lore about this world, its characters, locations, items, and concepts. You MUST incorporate this information naturally into your roleplay when relevant. Treat this as established canon that shapes how characters behave, what they know, and how the world works.\n    {{lorebook}}",
            ""
        );
        result = result.replace("# World Information\n    {{lorebook}}", "");
        result = result.replace("# World Information\n{{lorebook}}", "");
        result = result.replace("{{lorebook}}", "");
    } else {
        result = result.replace("{{lorebook}}", &lorebook_text);
    }

    result = result.replace("{{char}}", char_name);
    result = result.replace("{{persona}}", persona_name);
    result = result.replace("{{ai_name}}", char_name);
    result = result.replace("{{ai_description}}", &char_desc);
    result = result.replace("{{ai_rules}}", "");
    result = result.replace("{{persona_name}}", persona_name);
    result = result.replace("{{persona_description}}", persona_desc);

    result
}

fn build_debug_vars(
    character: &Character,
    persona: Option<&Persona>,
    session: &Session,
    _settings: &Settings,
) -> Value {
    let char_name = &character.name;
    let persona_name = persona.map(|p| p.title.as_str()).unwrap_or("");
    let raw_char_desc = character
        .description
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("")
        .replace("{{char}}", char_name)
        .replace("{{persona}}", persona_name);
    json!({
        "char_name": char_name,
        "char_desc": raw_char_desc,
        "persona_name": persona_name,
        "persona_desc": persona.map(|p| p.description.trim()).unwrap_or("") ,
        "scene_present": session.selected_scene_id.is_some(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat_manager::types::{Scene, SceneVariant};

    fn make_character() -> Character {
        Character {
            id: "c1".into(),
            name: "Alice".into(),
            avatar_path: None,
            background_image_path: None,
            description: Some("I am {{char}}. Partner: {{persona}}.".into()),
            rules: vec![],
            scenes: vec![],
            default_scene_id: None,
            default_model_id: None,
            memory_type: "manual".into(),
            prompt_template_id: None,
            system_prompt: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn make_settings() -> Settings {
        Settings {
            default_provider_credential_id: None,
            default_model_id: None,
            provider_credentials: vec![],
            models: vec![],
            app_state: serde_json::json!({}),
            advanced_model_settings: super::super::types::AdvancedModelSettings::default(),
            prompt_template_id: None,
            system_prompt: None,
            migration_version: 0,
            advanced_settings: None,
        }
    }

    fn make_model() -> Model {
        Model {
            id: "m1".into(),
            name: "gpt-test".into(),
            provider_id: "openai".into(),
            provider_label: "openai".into(),
            display_name: "GPT Test".into(),
            created_at: 0,
            input_scopes: vec!["text".into()],
            output_scopes: vec!["text".into()],
            advanced_model_settings: None,
            prompt_template_id: None,
            system_prompt: None,
        }
    }

    fn make_session() -> Session {
        Session {
            id: "s1".into(),
            character_id: "c1".into(),
            title: "t".into(),
            system_prompt: None,
            selected_scene_id: None,
            persona_id: None,
            advanced_model_settings: None,
            memories: vec![],
            memory_summary: None,
            memory_summary_token_count: 0,
            memory_tool_events: vec![],
            messages: vec![],
            archived: false,
            created_at: 0,
            updated_at: 0,
            memory_embeddings: vec![],
        }
    }

    #[test]
    fn renders_simple_placeholders() {
        let character = make_character();
        let _model = make_model();
        let settings = make_settings();
        let session = make_session();
        let persona = Some(Persona {
            id: "p1".into(),
            title: "Bob".into(),
            description: "Persona Bob".into(),
            is_default: true,
            created_at: 0,
            updated_at: 0,
        });

        let base = "Hello {{char}} and {{persona}}. {{char.desc}}";
        let rendered = render_with_context_internal(
            None,
            base,
            &character,
            persona.as_ref(),
            &session,
            &settings,
        );
        assert!(rendered.contains("Hello Alice and Bob."));
        assert!(rendered.contains("I am Alice. Partner: Bob."));

        // Scene injection test
        // Add a scene and make sure {{scene}} replacement works
        let mut session2 = session.clone();
        let mut character2 = character.clone();
        character2.scenes = vec![Scene {
            id: "scene1".into(),
            content: "Meeting {{char}} and {{persona}}".into(),
            created_at: 0,
            variants: vec![SceneVariant {
                id: "v1".into(),
                content: "Var {{char}}".into(),
                created_at: 0,
            }],
            selected_variant_id: Some("v1".into()),
        }];
        session2.selected_scene_id = Some("scene1".into());
        let base2 = "{{scene}}";
        let rendered2 = render_with_context_internal(
            None,
            base2,
            &character2,
            persona.as_ref(),
            &session2,
            &settings,
        );
        assert!(rendered2.contains("Var Alice"));
        assert!(!rendered2.contains("Starting Scene")); // No hardcoded formatting
    }
}
