import { invoke } from "@tauri-apps/api/core";

/**
 * Image generation request parameters
 */
export interface ImageGenerationRequest {
  prompt: string;
  model: string;
  providerId: string;
  credentialId: string;
  size?: string;
  quality?: string;
  style?: string;
  n?: number;
}

/**
 * Generated image result
 */
export interface GeneratedImage {
  filePath: string;
  url?: string;
  width?: number;
  height?: number;
  text?: string;
}

/**
 * Image generation response
 */
export interface ImageGenerationResponse {
  images: GeneratedImage[];
  model: string;
  providerId: string;
}

/**
 * Generate images using the specified model and provider
 */
export async function generateImage(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  if (!request.prompt.trim()) {
    throw new Error("Prompt cannot be empty");
  }

  return invoke<ImageGenerationResponse>("generate_image", {
    request: {
      prompt: request.prompt,
      model: request.model,
      providerId: request.providerId,
      credentialId: request.credentialId,
      size: request.size ?? null,
      quality: request.quality ?? null,
      style: request.style ?? null,
      n: request.n ?? 1,
    },
  });
}

/**
 * Image generation model presets for common providers
 */
export const IMAGE_MODEL_PRESETS = {
  openai: {
    models: [
      { id: "dall-e-3", name: "DALL-E 3", sizes: ["1024x1024", "1024x1792", "1792x1024"] },
      { id: "dall-e-2", name: "DALL-E 2", sizes: ["256x256", "512x512", "1024x1024"] },
      { id: "gpt-image-1", name: "GPT Image 1", sizes: ["1024x1024", "1024x1536", "1536x1024", "auto"] },
    ],
    qualities: ["standard", "hd"],
    styles: ["vivid", "natural"],
  },
  gemini: {
    models: [
      { id: "gemini-2.0-flash-preview-image-generation", name: "Gemini 2.0 Flash (Image)", sizes: [] },
      { id: "imagen-3.0-generate-002", name: "Imagen 3", sizes: ["1024x1024"] },
    ],
    qualities: [],
    styles: [],
  },
  openrouter: {
    // OpenRouter image models are dynamic, fetched via API
    models: [],
    qualities: [],
    styles: [],
  },
} as const;

/**
 * Get available sizes for a model
 */
export function getModelSizes(providerId: string, modelId: string): readonly string[] {
  const provider = IMAGE_MODEL_PRESETS[providerId as keyof typeof IMAGE_MODEL_PRESETS];
  if (!provider) return ["1024x1024"];
  
  const model = provider.models.find(m => m.id === modelId);
  return model?.sizes ?? ["1024x1024"];
}

/**
 * Check if a model supports image generation based on its type
 */
export function isImageGenerationModel(modelType: string): boolean {
  return modelType === "imagegeneration";
}
