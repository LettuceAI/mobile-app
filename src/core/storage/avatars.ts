import { invoke } from "@tauri-apps/api/core";

/**
 * Centralized avatar management system
 * Handles avatar uploads, storage, and retrieval for characters and personas
 */

/**
 * Saves an avatar image for a character or persona
 * Copies the image to avatars/<entity-id>/ directory and converts to WebP
 * 
 * @param entityId - The character or persona ID
 * @param imageData - Base64 data URL or file path
 * @returns The avatar filename (without path) or empty string on failure
 */
export async function saveAvatar(entityId: string, imageData: string): Promise<string> {
  if (!imageData || !entityId) {
    console.log("[saveAvatar] No image data or entity ID provided");
    return "";
  }

  try {
    console.log("[saveAvatar] Saving avatar for entity:", entityId);
    
    const result = await invoke<string>("storage_save_avatar", {
      entityId: entityId,
      base64Data: imageData,
    });
    
    console.log("[saveAvatar] Successfully saved avatar:", result);
    return result;
  } catch (error) {
    console.error("[saveAvatar] Failed to save avatar:", error);
    return "";
  }
}

/**
 * Loads an avatar image as a data URL
 * Reads from avatars/<entity-id>/ directory
 * 
 * @param entityId - The character or persona ID
 * @param avatarFilename - The avatar filename (from character.avatarPath)
 * @returns Data URL of the avatar or undefined on failure
 */
export async function loadAvatar(
  entityId: string,
  avatarFilename: string | undefined
): Promise<string | undefined> {
  if (!entityId || !avatarFilename) {
    return undefined;
  }

  try {
    const dataUrl = await invoke<string>("storage_load_avatar", {
      entityId: entityId,
      filename: avatarFilename,
    });

    console.log("[loadAvatar] Loaded avatar for entity:", entityId);
    return dataUrl;
  } catch (error) {
    console.error("[loadAvatar] Failed to load avatar:", error);
    return undefined;
  }
}

/**
 * Deletes an avatar image
 * Removes from avatars/<entity-id>/ directory
 * 
 * @param entityId - The character or persona ID
 * @param avatarFilename - The avatar filename to delete
 */
export async function deleteAvatar(entityId: string, avatarFilename: string): Promise<void> {
  if (!entityId || !avatarFilename) {
    return;
  }

  try {
    await invoke("storage_delete_avatar", {
      entityId: entityId,
      filename: avatarFilename,
    });
    console.log("[deleteAvatar] Deleted avatar for entity:", entityId);
  } catch (error) {
    console.error("[deleteAvatar] Failed to delete avatar:", error);
  }
}

/**
 * Preloads multiple avatars for performance optimization
 * 
 * @param avatars - Array of { entityId, filename } pairs
 */
export async function preloadAvatars(
  avatars: Array<{ entityId: string; filename: string | undefined }>
): Promise<void> {
  const validAvatars = avatars.filter((a) => !!a.entityId && !!a.filename);

  if (validAvatars.length === 0) {
    return;
  }

  try {
    await Promise.all(
      validAvatars.map((a) => loadAvatar(a.entityId, a.filename!))
    );
  } catch (error) {
    console.error("[preloadAvatars] Failed to preload avatars:", error);
  }
}
