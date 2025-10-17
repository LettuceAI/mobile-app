import { invoke } from "@tauri-apps/api/core";

// Cache for preloaded image URLs to avoid repeated conversions
const imageUrlCache = new Map<string, Promise<string | undefined>>();

/**
 * Stores a base64-encoded image and returns a reference ID
 * This reduces performance issues from large image data URLs in state
 * 
 * In Tauri v2, images are stored as files on disk via the Rust backend
 * and accessed via the asset:// protocol. Images are automatically converted
 * to WebP format for optimal storage efficiency.
 */
export async function convertToImageRef(dataUrl: string): Promise<string | undefined> {
  if (!dataUrl) {
    return undefined;
  }

  try {
    // Generate a unique ID for this image
    const imageId = globalThis.crypto?.randomUUID?.() ?? generateUUID();
    
    // Store the image data using Tauri command
    // The Rust backend will:
    // 1. Decode base64
    // 2. Convert to WebP for optimal compression
    // 3. Save to disk
    await invoke<string>("storage_write_image", {
      imageId,
      base64Data: dataUrl,
    });
    
    return imageId;
  } catch (error) {
    console.error("Failed to convert image to reference:", error);
    return undefined;
  }
}

/**
 * Converts an image ID to a displayable URL using Tauri v2 asset protocol
 * Lazy loads and caches URLs for performance
 * 
 * Tauri v2 uses the asset:// protocol to serve files from the app's data directory.
 * The image ID is converted to a file path, which the Rust backend can resolve.
 */
export async function convertToImageUrl(imageIdOrUrl: string): Promise<string | undefined> {
  if (!imageIdOrUrl) {
    return undefined;
  }

  try {
    // If it's already a URL, return it directly
    if (imageIdOrUrl.startsWith("data:") || imageIdOrUrl.startsWith("http")) {
      return imageIdOrUrl;
    }

    // Check cache first to avoid repeated lookups
    if (imageUrlCache.has(imageIdOrUrl)) {
      return imageUrlCache.get(imageIdOrUrl)!;
    }

    // Create a promise for this conversion and cache it
    const conversionPromise = (async () => {
      try {
        const filePath = await invoke<string>("storage_get_image_path", {
          imageId: imageIdOrUrl,
        });
        
        // Convert file path to Tauri asset URL
        return `asset://${filePath}`;
      } catch (error) {
        console.warn(`Could not load image ${imageIdOrUrl}:`, error);
        return undefined;
      }
    })();

    imageUrlCache.set(imageIdOrUrl, conversionPromise);
    return conversionPromise;
  } catch (error) {
    console.error("Failed to convert image ID to URL:", error);
    return undefined;
  }
}

/**
 * Preloads multiple image URLs for performance optimization
 * Call this when entering the Chat component to eagerly load images
 * 
 * @param imageIds - Array of image IDs to preload
 * @returns Promise that resolves when all images are preloaded
 */
export async function preloadImages(imageIds: (string | undefined | null)[]): Promise<void> {
  const validIds = imageIds.filter((id): id is string => !!id && !id.startsWith("data:") && !id.startsWith("http"));
  
  if (validIds.length === 0) {
    return;
  }

  try {
    // Preload all images in parallel
    await Promise.all(
      validIds.map(id => convertToImageUrl(id))
    );
  } catch (error) {
    console.error("Failed to preload images:", error);
  }
}

/**
 * Retrieves the file path for a stored image by its reference ID
 */
export async function getImageRef(imageId: string): Promise<string | null> {
  if (!imageId) {
    return null;
  }

  try {
    return await invoke<string>("storage_get_image_path", { imageId });
  } catch (error) {
    console.error("Failed to retrieve image reference:", error);
    return null;
  }
}

/**
 * Deletes a stored image by its reference ID
 */
export async function deleteImageRef(imageId: string): Promise<void> {
  if (!imageId) {
    return;
  }

  try {
    await invoke("storage_delete_image", { imageId });
  } catch (error) {
    console.error("Failed to delete image reference:", error);
  }
}

/**
 * Fallback UUID generator for environments without crypto.randomUUID
 */
function generateUUID(): string {
  const bytes = new Uint8Array(16);
  (globalThis.crypto || ({} as any)).getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}
