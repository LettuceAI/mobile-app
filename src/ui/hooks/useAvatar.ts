import { useEffect, useState } from "react";
import { loadAvatar } from "../../core/storage/avatars";

const avatarCache = new Map<string, string | Promise<string>>();

/**
 * Invalidate cached avatar for a specific entity
 * Call this when an avatar is updated or deleted
 */
export function invalidateAvatarCache(entityId: string, avatarFilename?: string) {
  if (avatarFilename) {
    const cacheKey = `${entityId}:${avatarFilename}`;
    avatarCache.delete(cacheKey);
  } else {
    const keysToDelete: string[] = [];
    avatarCache.forEach((_, key) => {
      if (key.startsWith(`${entityId}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => avatarCache.delete(key));
  }
}

/**
 * Hook to load and display character/persona avatars
 * Automatically fetches avatar from avatars/<entityId>/ directory
 * Uses global cache to prevent redundant loads
 * 
 * @param entityId - The character or persona ID
 * @param avatarFilename - The avatar filename stored in character.avatarPath
 * @returns Data URL of the avatar or undefined if loading/not found
 */
export function useAvatar(
  entityId: string | undefined,
  avatarFilename: string | undefined
): string | undefined {
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(() => {
    if (entityId && avatarFilename) {
      const cacheKey = `${entityId}:${avatarFilename}`;
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
        const cacheKey = `${entityId}:${avatarFilename}`;
        avatarCache.set(cacheKey, avatarFilename);
        setAvatarUrl(avatarFilename);
        return;
      }

      const cacheKey = `${entityId}:${avatarFilename}`;
      const cached = avatarCache.get(cacheKey);

      if (typeof cached === 'string') {
        if (!cancelled) {
          setAvatarUrl(cached);
        }
        return;
      }

      // If currently loading, wait for it
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

      // Start loading and cache the promise
      const loadPromise = loadAvatar(entityId, avatarFilename)
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
  }, [entityId, avatarFilename]);

  return avatarUrl;
}
