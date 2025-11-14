use serde_json::{json, Value};
use tauri::AppHandle;

use super::prompts;
use super::types::{Character, Model, Persona, Session, Settings};

/// Default system prompt template when no custom prompt is set
/// Template variables: {{char.name}}, {{char.desc}}, {{scene}}, {{persona.name}}, {{persona.desc}}, {{rules}}
pub fn default_system_prompt_template() -> String {
    let mut template = String::new();
    template.push_str("You are participating in an immersive roleplay. Your goal is to fully embody your character and create an engaging, authentic experience.\n\n");

    template.push_str("# Scenario\n{{scene}}\n\n");

    template.push_str("# Your Character: {{char.name}}\n");
    template.push_str("{{char.desc}}\n\n");
    template.push_str("Embody {{char.name}}'s personality, mannerisms, and speech patterns completely. Stay true to their character traits, background, and motivations in every response.\n\n");

    template.push_str("# {{persona.name}}'s Character\n");
    template.push_str("{{persona.desc}}\n\n");

    template.push_str("# Roleplay Guidelines\n{{rules}}\n\n");

    template.push_str("# Core Instructions\n");
    template.push_str("- Write as {{char.name}} from their perspective\n");
    template.push_str("- You may also act as and portray any other characters mentioned in the scenario or {{char.name}}'s description (friends, companions, NPCs) when they're relevant to the scene\n");
    template.push_str("- React authentically to {{persona.name}}'s actions and dialogue\n");
    template.push_str("- Keep responses concise and focused - short to medium length - so {{persona.name}} can actively participate in the roleplay\n");
    template.push_str(
        "- Show don't tell: Express emotions through actions, body language, and dialogue\n",
    );
    template.push_str(
        "- Maintain narrative consistency with the established scenario and all character traits\n",
    );
    template.push_str("- Never break character unless {{persona.name}} explicitly asks you to step out of roleplay\n");
    template.push_str("- Never speak or act for {{persona.name}} - only describe the environment and other characters' reactions\n");
    template
        .push_str("- Avoid summarizing or rushing through scenes. Let moments unfold naturally\n");
    template.push_str("- If you see a [CONTINUE] instruction, pick up exactly where your last response ended and write new content forward - never restart or repeat yourself\n");
    template.push_str("- Drive the story forward with your responses while respecting {{persona.name}}'s agency and choices\n");
    template.push_str("- Use vivid, sensory details to create an immersive experience\n");
    template.push_str("- When multiple characters are present, write their interactions naturally and distinguish their unique voices\n");

    template
}

/// Build a fully rendered system prompt using the precedence:
/// session > character template > model template > app-wide template > default
pub fn build_system_prompt(
    app: &AppHandle,
    character: &Character,
    model: &Model,
    persona: Option<&Persona>,
    session: &Session,
    settings: &Settings,
) -> Option<String> {
    let mut debug_parts: Vec<Value> = Vec::new();

    // Priority: session > character template > model template > app-wide template > default
    let base_template = if let Some(session_prompt) = &session.system_prompt {
        debug_parts.push(json!({ "source": "session_override" }));
        session_prompt.clone()
    } else if let Some(char_template_id) = &character.prompt_template_id {
        // Resolve character prompt template
        if let Ok(Some(template)) = prompts::get_template(app, char_template_id) {
            debug_parts
                .push(json!({ "source": "character_template", "template_id": char_template_id }));
            template.content
        } else {
            debug_parts.push(json!({ "source": "character_template_not_found", "template_id": char_template_id, "fallback": "default" }));
            default_system_prompt_template()
        }
    } else if let Some(model_template_id) = &model.prompt_template_id {
        // Resolve model prompt template
        if let Ok(Some(template)) = prompts::get_template(app, model_template_id) {
            debug_parts
                .push(json!({ "source": "model_template", "template_id": model_template_id }));
            template.content
        } else {
            debug_parts.push(json!({ "source": "model_template_not_found", "template_id": model_template_id, "fallback": "default" }));
            default_system_prompt_template()
        }
    } else if let Some(app_template_id) = &settings.prompt_template_id {
        // Resolve app-wide prompt template
        if let Ok(Some(template)) = prompts::get_template(app, app_template_id) {
            debug_parts
                .push(json!({ "source": "app_wide_template", "template_id": app_template_id }));
            template.content
        } else {
            debug_parts.push(json!({ "source": "app_wide_template_not_found", "template_id": app_template_id, "fallback": "default" }));
            default_system_prompt_template()
        }
    } else {
        debug_parts.push(json!({ "source": "default_template" }));
        default_system_prompt_template()
    };

    // Render with context
    let rendered = render_with_context(app, &base_template, character, persona, session, settings);

    // Inject memories if present
    let final_prompt = if !session.memories.is_empty() {
        let mut result = rendered;
        result.push_str("\n\n# Key Memories\n");
        result.push_str("Important facts to remember in this conversation:\n");
        for memory in &session.memories {
            result.push_str(&format!("- {}\n", memory));
        }
        result
    } else {
        rendered
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

/// Internal rendering function that optionally logs to backend
fn render_with_context_internal(
    app: Option<&AppHandle>,
    base_template: &str,
    character: &Character,
    persona: Option<&Persona>,
    _session: &Session,
    settings: &Settings,
) -> String {
    // Get character info early (needed for dynamic replacements in scenes)
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

    // Build scene content from character's default scene
    // Priority: character.default_scene_id > first scene (if only one exists)
    let scene_id_to_use = character.default_scene_id.as_ref().or_else(|| {
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

    let rules_to_use = if character.rules.is_empty() {
        super::storage::default_character_rules(pure_mode_enabled)
    } else {
        character.rules.clone()
    };
    let rules_formatted = format!("- {}", rules_to_use.join("\n- "));

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
    result = result.replace("{{rules}}", &rules_formatted);

    // Global fallback replacements in entire template for simple placeholders
    // Allows users to use {{char}} and {{persona}} anywhere in templates
    result = result.replace("{{char}}", char_name);
    result = result.replace("{{persona}}", persona_name);

    // Legacy template variable support (for backwards compatibility)
    result = result.replace("{{ai_name}}", char_name);
    result = result.replace("{{ai_description}}", &char_desc);
    result = result.replace("{{ai_rules}}", &rules_formatted);
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
            messages: vec![],
            archived: false,
            created_at: 0,
            updated_at: 0,
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
