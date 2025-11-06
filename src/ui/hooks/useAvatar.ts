import { useEffect, useState } from "react";
import { loadAvatar, type EntityType } from "../../core/storage/avatars";

const avatarCache = new Map<string, string | Promise<string>>();

/**
 * Invalidate cached avatar for a specific entity
 * Call this when an avatar is updated or deleted
 */
export function invalidateAvatarCache(type: EntityType, entityId: string, avatarFilename?: string) {
  if (avatarFilename) {
    const cacheKey = `${type}:${entityId}:${avatarFilename}`;
    avatarCache.delete(cacheKey);
  } else {
    const prefix = `${type}:${entityId}:`;
    const keysToDelete: string[] = [];
    avatarCache.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => avatarCache.delete(key));
  }
}

/**
 * Hook to load and display character/persona avatars
 * Automatically fetches avatar from avatars/<type>-<entityId>/ directory
 * Uses global cache to prevent redundant loads
 * 
 * @param type - Entity type (character or persona)
 * @param entityId - The character or persona ID
 * @param avatarFilename - The avatar filename stored in entity.avatarPath
 * @returns Data URL of the avatar or undefined if loading/not found
 */
export function useAvatar(
  type: EntityType,
  entityId: string | undefined,
  avatarFilename: string | undefined
): string | undefined {
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(() => {
    if (entityId && avatarFilename) {
      const cacheKey = `${type}:${entityId}:${avatarFilename}`;
      const cached = avatarCache.get(cacheKey);
      if (typeof cached === 'string') {
        return cached;
      }
    }
    return undefined;
  });

  useEffect(() => {
    let cancelled = false;

    const fetchAvatar = async () => {
      if (!entityId || !avatarFilename) {
        setAvatarUrl(undefined);
        return;
      }

      if (avatarFilename.startsWith("data:")) {
        const cacheKey = `${type}:${entityId}:${avatarFilename}`;
        avatarCache.set(cacheKey, avatarFilename);
        setAvatarUrl(avatarFilename);
        return;
      }

      const cacheKey = `${type}:${entityId}:${avatarFilename}`;
      const cached = avatarCache.get(cacheKey);

      if (typeof cached === 'string') {
        if (!cancelled) {
          setAvatarUrl(cached);
        }
        return;
      }

      if (cached instanceof Promise) {
        try {
          const url = await cached;
          if (!cancelled) {
            setAvatarUrl(url);
          }
        } catch (error) {
          if (!cancelled) {
            setAvatarUrl(undefined);
          }
        }
        return;
      }

      const loadPromise = loadAvatar(type, entityId, avatarFilename)
        .then((url) => {
          if (url) {
            avatarCache.set(cacheKey, url);
          }
          return url;
        })
        .catch((error) => {
          console.error("[useAvatar] Failed to load avatar:", error);
          avatarCache.delete(cacheKey);
          throw error;
        });

      avatarCache.set(cacheKey, loadPromise as Promise<string>);

      try {
        const url = await loadPromise;
        if (!cancelled) {
          setAvatarUrl(url);
        }
      } catch (error) {
        if (!cancelled) {
          setAvatarUrl(undefined);
        }
      }
    };

    fetchAvatar();

    return () => {
      cancelled = true;
    };
  }, [type, entityId, avatarFilename]);

  return avatarUrl;
}
