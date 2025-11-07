import { useState, useEffect } from "react";
import { getCachedGradient, type AvatarGradient, type EntityType } from "../../core/storage/avatars";

/**
 * Hook to generate and use gradient colors from avatar images
 * Perfect for character cards, persona cards, and other avatar-based UI elements
 * 
 * @param type - Entity type (character or persona)
 * @param entityId - The entity ID
 * @param avatarPath - Optional avatar path from the entity
 * @param disabled - If true, gradient generation is disabled
 * @returns Object with gradient data and loading state
 */
export function useAvatarGradient(
    type: EntityType,
    entityId: string,
    avatarPath?: string,
    disabled?: boolean
) {
    const [gradient, setGradient] = useState<AvatarGradient | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!entityId || !avatarPath || disabled) {
            setGradient(null);
            return;
        }

        const generateGradient = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const gradientData = await getCachedGradient(type, entityId, avatarPath);
                setGradient(gradientData || null);
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Failed to generate gradient";
                setError(errorMessage);
                setGradient(null);
            } finally {
                setIsLoading(false);
            }
        };

        generateGradient();
    }, [type, entityId, avatarPath, disabled]);

    // Calculate average brightness from gradient colors
    const calculateAverageBrightness = (): number => {
        if (!gradient || !gradient.colors || gradient.colors.length === 0) {
            return 0.5; // Default mid brightness
        }
        
        let totalBrightness = 0;
        for (const color of gradient.colors) {
            const r = color.r / 255.0;
            const g = color.g / 255.0;
            const b = color.b / 255.0;
            
            const rLin = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
            const gLin = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
            const bLin = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
            
            const luminance = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
            totalBrightness += luminance;
        }
        
        return totalBrightness / gradient.colors.length;
    };

    const averageBrightness = calculateAverageBrightness();

    return {
        gradient,
        isLoading,
        error,
        hasGradient: !!gradient,
        gradientCss: gradient?.gradient_css || "",
        colors: gradient?.colors || [],
        dominantHue: gradient?.dominant_hue || 0,
        textColor: gradient?.text_color || "#ffffff",
        textSecondary: gradient?.text_secondary || "rgba(255, 255, 255, 0.7)",
        averageBrightness,
    };
}

/**
 * Hook for generating multiple gradients at once
 * Useful for lists and grids of characters/personas
 * 
 * @param entities - Array of entities with type, id, avatar path, and optional disabled flag
 * @returns Map of entityId to gradient data
 */
export function useMultipleAvatarGradients(
    entities: Array<{ type: EntityType; id: string; avatarPath?: string; disableGradient?: boolean }>
) {
    const [gradients, setGradients] = useState<Map<string, AvatarGradient>>(new Map());
    const [isLoading, setIsLoading] = useState(false);

    const entitiesKey = JSON.stringify(
        entities.map(e => ({ type: e.type, id: e.id, path: e.avatarPath, disabled: e.disableGradient }))
    );

    useEffect(() => {
        if (entities.length === 0) {
            setGradients(new Map());
            return;
        }

        const generateGradients = async () => {
            setIsLoading(true);
            const newGradients = new Map<string, AvatarGradient>();

            try {
                const gradientPromises = entities
                    .filter(entity => entity.id && entity.avatarPath && !entity.disableGradient)
                    .map(async (entity) => {
                        try {
                            const gradient = await getCachedGradient(entity.type, entity.id, entity.avatarPath!);
                            return { id: entity.id, gradient };
                        } catch {
                            return { id: entity.id, gradient: null };
                        }
                    });

                const results = await Promise.all(gradientPromises);

                for (const { id, gradient } of results) {
                    if (gradient) {
                        newGradients.set(id, gradient);
                    }
                }
            } catch (err) {
                console.error("[useMultipleAvatarGradients] Failed to generate gradients:", err);
            } finally {
                setGradients(newGradients);
                setIsLoading(false);
            }
        };

        generateGradients();
    }, [entitiesKey]);

    const getGradient = (entityId: string): AvatarGradient | undefined => {
        return gradients.get(entityId);
    };

    const getGradientCss = (entityId: string): string => {
        return gradients.get(entityId)?.gradient_css || "";
    };

    const getTextColor = (entityId: string): string => {
        return gradients.get(entityId)?.text_color || "#ffffff";
    };

    const getTextSecondary = (entityId: string): string => {
        return gradients.get(entityId)?.text_secondary || "rgba(255, 255, 255, 0.7)";
    };

    return {
        gradients,
        isLoading,
        getGradient,
        getGradientCss,
        getTextColor,
        getTextSecondary,
        hasGradient: (entityId: string) => gradients.has(entityId),
    };
}
