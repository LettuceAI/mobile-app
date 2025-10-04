import { invoke } from "@tauri-apps/api/core";

/**
 * Get default character rules from Rust backend
 * Single source of truth for default rules
 * @param pureModeEnabled - Whether Pure Mode (NSFW filter) is enabled
 */
export async function getDefaultCharacterRules(pureModeEnabled: boolean): Promise<string[]> {
  return invoke<string[]>("get_default_character_rules", { pureModeEnabled });
}
