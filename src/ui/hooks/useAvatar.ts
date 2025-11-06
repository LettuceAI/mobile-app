import { useEffect, useState } from "react";
import { loadAvatar } from "../../core/storage/avatars";

/**
 * Hook to load and display character/persona avatars
 * Automatically fetches avatar from avatars/<entityId>/ directory
 * 
 * @param entityId - The character or persona ID
 * @param avatarFilename - The avatar filename stored in character.avatarPath
 * @returns Data URL of the avatar or undefined if loading/not found
 */
export function useAvatar(
  entityId: string | undefined,
  avatarFilename: string | undefined
): string | undefined {
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const fetchAvatar = async () => {
      if (!entityId || !avatarFilename) {
        setAvatarUrl(undefined);
        return;
      }

      // If it's already a data URL, use it directly
      if (avatarFilename.startsWith("data:")) {
        setAvatarUrl(avatarFilename);
        return;
      }

      try {
        const url = await loadAvatar(entityId, avatarFilename);
        if (!cancelled) {
          setAvatarUrl(url);
        }
      } catch (error) {
        console.error("[useAvatar] Failed to load avatar:", error);
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
