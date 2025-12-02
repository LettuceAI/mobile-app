import { ModelType } from "./schemas";

interface OpenRouterModel {
    id: string;
    name: string;
    architecture: {
        input_modalities: string[];
        output_modalities: string[];
    };
    model_type: string;
}

import { invoke } from "@tauri-apps/api/core";

/**
 * Detect model type for OpenRouter models using their API via backend
 */
export async function detectOpenRouterModelType(modelName: string): Promise<ModelType> {
    try {
        const models = await invoke<OpenRouterModel[]>("get_openrouter_models");
        const model = models.find((m) => m.id === modelName);

        if (!model) {
            console.warn(`Model ${modelName} not found in OpenRouter API, defaulting to chat`);
            return "chat";
        }

        // Check output modalities - if it can output images, it's an image generation model
        const canOutputImages = model.architecture.output_modalities.includes("image");
        const canInputImages = model.architecture.input_modalities.includes("image");
        const canInputText = model.architecture.input_modalities.includes("text");

        // If it can output images, prioritize that capability
        if (canOutputImages) {
            return "imagegeneration";
        }

        // If it can accept images as input (but not output them), it's multimodal
        if (canInputImages && canInputText) {
            return "multimodel";
        }

        return "chat";
    } catch (error) {
        console.error("Error detecting OpenRouter model type:", error);
        return "chat";
    }
}

/**
 * Get suggested model type for direct provider models based on naming patterns.
 * This is just a suggestion - users can override this.
 */
export function getSuggestedModelType(_providerId: string, modelName: string): ModelType {
    const lowerModelName = modelName.toLowerCase();

    // Image generation models - explicit image generation keywords
    if (
        lowerModelName.includes("dall-e") ||
        lowerModelName.includes("gpt-image") ||
        lowerModelName.includes("imagen") ||
        lowerModelName.includes("image-generation") ||
        lowerModelName.includes("image-preview") ||  // gemini-2.5-flash-image-preview
        lowerModelName.includes("generate-image")
    ) {
        return "imagegeneration";
    }

    // Embedding models
    if (lowerModelName.includes("embedding")) {
        return "embedding";
    }

    // Default to chat - let user select multimodel manually if needed
    return "chat";
}

/**
 * Detect model type based on provider and model name.
 * Returns a suggested type - callers should respect user overrides.
 */
export async function detectModelType(
    providerId: string,
    modelName: string
): Promise<ModelType> {
    // For OpenRouter, use API detection (most accurate)
    if (providerId === "openrouter") {
        return await detectOpenRouterModelType(modelName);
    }

    // For direct providers, use pattern-based suggestion
    return getSuggestedModelType(providerId, modelName);
}

/**
 * @deprecated Use getSuggestedModelType instead
 */
export const getDefaultModelType = getSuggestedModelType;
