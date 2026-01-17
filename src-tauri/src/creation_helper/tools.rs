// Tool definitions for the Creation Helper
//
// These tools are provided to the LLM to build the character progressively.

use crate::chat_manager::tooling::ToolDefinition;
use serde_json::json;

/// Get all tool definitions for the creation helper
pub fn get_creation_helper_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "set_character_name".to_string(),
            description: Some("Set the character's name".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "The character's name"
                    }
                },
                "required": ["name"]
            }),
        },
        ToolDefinition {
            name: "set_character_definition".to_string(),
            description: Some("Set or update the character's definition/personality".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "definition": {
                        "type": "string",
                        "description": "The character's definition, personality, and background"
                    }
                },
                "required": ["definition"]
            }),
        },
        ToolDefinition {
            name: "add_scene".to_string(),
            description: Some("Add a starting scene for the character. Scenes set the initial context for roleplay.".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The scene content - the opening message or situation"
                    },
                    "direction": {
                        "type": "string",
                        "description": "Optional direction/context for how the scene should play out"
                    }
                },
                "required": ["content"]
            }),
        },
        ToolDefinition {
            name: "update_scene".to_string(),
            description: Some("Update an existing scene".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "scene_id": {
                        "type": "string",
                        "description": "The ID of the scene to update"
                    },
                    "content": {
                        "type": "string",
                        "description": "The new scene content"
                    },
                    "direction": {
                        "type": "string",
                        "description": "Optional new direction for the scene"
                    }
                },
                "required": ["scene_id", "content"]
            }),
        },
        ToolDefinition {
            name: "toggle_avatar_gradient".to_string(),
            description: Some("Enable or disable the gradient overlay on the character's avatar".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "enabled": {
                        "type": "boolean",
                        "description": "Whether the gradient should be enabled (true) or disabled (false)"
                    }
                },
                "required": ["enabled"]
            }),
        },
        ToolDefinition {
            name: "set_default_model".to_string(),
            description: Some("Set which AI model this character should use for conversations".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "model_id": {
                        "type": "string",
                        "description": "The ID of the model to use"
                    }
                },
                "required": ["model_id"]
            }),
        },
        ToolDefinition {
            name: "set_system_prompt".to_string(),
            description: Some("Set the system prompt template for this character".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "prompt_id": {
                        "type": "string",
                        "description": "The ID of the system prompt template to use"
                    }
                },
                "required": ["prompt_id"]
            }),
        },
        ToolDefinition {
            name: "get_system_prompt_list".to_string(),
            description: Some("Get the list of available system prompt templates".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {}
            }),
        },
        ToolDefinition {
            name: "get_model_list".to_string(),
            description: Some("Get the list of available AI models".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {}
            }),
        },
        ToolDefinition {
            name: "use_uploaded_image_as_avatar".to_string(),
            description: Some("Use an image that the user uploaded in the chat as the character's avatar".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "image_id": {
                        "type": "string",
                        "description": "The ID of the uploaded image to use as avatar"
                    }
                },
                "required": ["image_id"]
            }),
        },
        ToolDefinition {
            name: "use_uploaded_image_as_chat_background".to_string(),
            description: Some("Use an image that the user uploaded in the chat as the chat background".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "image_id": {
                        "type": "string",
                        "description": "The ID of the uploaded image to use as background"
                    }
                },
                "required": ["image_id"]
            }),
        },
        ToolDefinition {
            name: "show_preview".to_string(),
            description: Some("Show a preview of the character to the user. Use this when you have enough information to show them what the character looks like.".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "A message to show alongside the preview, e.g. 'Here's what your character looks like so far!'"
                    }
                }
            }),
        },
        ToolDefinition {
            name: "request_confirmation".to_string(),
            description: Some("Ask the user if they want to save the character or continue editing. Use this when the character seems complete.".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "A message asking for confirmation, e.g. 'Are you happy with this character?'"
                    }
                }
            }),
        },
    ]
}

/// Get the system prompt for the creation helper
pub fn get_creation_helper_system_prompt() -> String {
    r#"You are a character creation assistant for a roleplay app. Your goal is to help the user create a compelling character through conversation.

## Your Approach
1. Start by asking what kind of character they want to create
2. Ask follow-up questions to understand their vision (personality, background, appearance, etc.)
3. Use the available tools to build the character progressively as you learn more
4. Be creative and suggest ideas, but always respect the user's preferences
5. When you have enough information, show a preview and ask for confirmation

## Guidelines
- Keep responses conversational and helpful
- Don't ask too many questions at once - 1-2 questions per message is ideal
- Use tools proactively - set the name as soon as you know it, build the definition incrementally
- For scenes, help them craft engaging opening scenarios
- If they upload an image, ask if they want to use it as an avatar or background

## Tools Available
- set_character_name: Set the name
- set_character_definition: Build/update the definition
- add_scene: Add starting scenes (the opening message/situation)
- update_scene: Modify existing scenes
- toggle_avatar_gradient: Control the avatar visual style
- set_default_model: Set which AI model powers conversations
- set_system_prompt: Set behavioral guidelines
- get_system_prompt_list: See available prompts
- get_model_list: See available models
- use_uploaded_image_as_avatar: Use an uploaded image as avatar
- use_uploaded_image_as_chat_background: Use an uploaded image as background
- show_preview: Let them see the character so far
- request_confirmation: Ask if they're ready to save

Remember: You're helping create a character for roleplay. Make the process fun and collaborative!"#.to_string()
}
