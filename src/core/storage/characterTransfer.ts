import { invoke } from "@tauri-apps/api/core";
import type { Character } from "./schemas";

export interface SceneExport {
  id: string;
  content: string;
  direction?: string;
  createdAt?: number;
  selectedVariantId?: string;
  variants: SceneVariantExport[];
}

export interface SceneVariantExport {
  id: string;
  content: string;
  direction?: string;
  createdAt?: number;
}

export interface CharacterImportPreview {
  name: string;
  description: string;
  definition: string;
  scenes: SceneExport[];
  defaultSceneId: string | null;
  promptTemplateId: string | null;
  memoryType: "manual" | "dynamic";
  disableAvatarGradient: boolean;
  avatarData?: string | null;
  backgroundImageData?: string | null;
}

/**
 * Export a character to a UEC package
 * Returns JSON string with all character data and embedded images
 */
export async function exportCharacter(characterId: string): Promise<string> {
  try {
    console.log("[exportCharacter] Exporting character:", characterId);
    const exportJson = await invoke<string>("character_export", { characterId });
    console.log("[exportCharacter] Export successful");
    return exportJson;
  } catch (error) {
    console.error("[exportCharacter] Failed to export character:", error);
    throw new Error(typeof error === "string" ? error : "Failed to export character");
  }
}

/**
 * Import a character from a UEC package
 * Creates a new character with new IDs
 * Returns the newly created character
 */
export async function importCharacter(importJson: string): Promise<Character> {
  try {
    console.log("[importCharacter] Importing character");
    const characterJson = await invoke<string>("character_import", { importJson });
    const character = JSON.parse(characterJson) as Character;
    console.log("[importCharacter] Import successful:", character.id);
    return character;
  } catch (error) {
    console.error("[importCharacter] Failed to import character:", error);
    throw new Error(typeof error === "string" ? error : "Failed to import character");
  }
}

/**
 * Parse an import file into a preview payload for the character form
 */
export async function previewCharacterImport(importJson: string): Promise<CharacterImportPreview> {
  try {
    const previewJson = await invoke<string>("character_import_preview", { importJson });
    return JSON.parse(previewJson) as CharacterImportPreview;
  } catch (error) {
    console.error("[previewCharacterImport] Failed to parse character:", error);
    throw new Error(typeof error === "string" ? error : "Failed to parse character");
  }
}

/**
 * Download a JSON string as a file
 * On mobile (Android/iOS), saves to the Downloads folder
 * On web/desktop, triggers a browser download
 */
export async function downloadJson(json: string, filename: string): Promise<void> {
  try {
    console.log("[downloadJson] Attempting to save via Tauri command");
    const savedPath = await invoke<string>("save_json_to_downloads", {
      filename,
      jsonContent: json,
    });
    console.log(`[downloadJson] File saved to: ${savedPath}`);
    alert(`File saved to: ${savedPath}`);
    return;
  } catch (error) {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Read a file as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/**
 * Generate a safe filename for export
 */
export function generateExportFilename(characterName: string): string {
  const safeName = characterName.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const timestamp = new Date().toISOString().split("T")[0];
  return `character_${safeName}_${timestamp}.uec`;
}
