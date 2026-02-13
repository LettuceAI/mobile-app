import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Hook to load attachment data from storage when only storagePath is available.
 * Returns the data URL for the image, loading it from disk if needed.
 *
 * @param data - The inline base64 data URL (if already loaded)
 * @param storagePath - The relative storage path to load from disk
 * @returns The data URL for display, or undefined if loading/not available
 */
export function useSessionAttachment(
  data: string | undefined | null,
  storagePath: string | undefined | null,
): string | undefined {
  const [loadedData, setLoadedData] = useState<string | undefined>(undefined);
  const lastPathRef = useRef<string | null | undefined>(undefined);
  const loadingRef = useRef<boolean>(false);

  useEffect(() => {
    if (data) {
      setLoadedData(data);
      return;
    }

    if (!storagePath) {
      setLoadedData(undefined);
      return;
    }

    if (lastPathRef.current === storagePath && loadedData !== undefined) {
      return;
    }

    // Avoid concurrent loads
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    lastPathRef.current = storagePath;

    invoke<string>("storage_get_session_attachment_path", { storagePath })
      .then((fullPath) => {
        setLoadedData(convertFileSrc(fullPath));
        loadingRef.current = false;
      })
      .catch((err) => {
        console.error("[useSessionAttachment] Failed to load attachment:", storagePath, err);
        setLoadedData(undefined);
        loadingRef.current = false;
      });
  }, [data, storagePath, loadedData]);

  return loadedData;
}

/**
 * Interface for attachment with optional data/storagePath
 */
interface LazyAttachment {
  id: string;
  data?: string | null;
  storagePath?: string | null;
  mimeType?: string;
  filename?: string | null;
  width?: number | null;
  height?: number | null;
}

const MAX_ATTACHMENT_CACHE_ENTRIES = 300;

function pruneCacheMap<T>(map: Map<string, T>, validIds: Set<string>) {
  for (const key of map.keys()) {
    if (!validIds.has(key)) {
      map.delete(key);
    }
  }
}

function trimCacheToLimit<T>(map: Map<string, T>, limit: number) {
  if (map.size <= limit) return;
  const removeCount = map.size - limit;
  let removed = 0;
  for (const key of map.keys()) {
    map.delete(key);
    removed += 1;
    if (removed >= removeCount) break;
  }
}

/**
 * Hook to load multiple attachments with lazy loading support.
 * Returns attachments with their data loaded from storage if needed.
 */
export function useSessionAttachments(
  attachments: LazyAttachment[] | undefined | null,
): LazyAttachment[] {
  const [loadedAttachments, setLoadedAttachments] = useState<LazyAttachment[]>([]);
  const loadingMapRef = useRef<Map<string, boolean>>(new Map());
  const dataMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!attachments || attachments.length === 0) {
      setLoadedAttachments([]);
      loadingMapRef.current.clear();
      dataMapRef.current.clear();
      return;
    }

    const validIds = new Set(attachments.map((att) => att.id));
    pruneCacheMap(loadingMapRef.current, validIds);
    pruneCacheMap(dataMapRef.current, validIds);

    // Check which attachments need loading
    const toLoad: LazyAttachment[] = [];
    const result: LazyAttachment[] = [];

    for (const att of attachments) {
      if (att.data) {
        result.push(att);
        dataMapRef.current.set(att.id, att.data);
        continue;
      }

      const cachedData = dataMapRef.current.get(att.id);
      if (cachedData) {
        result.push({ ...att, data: cachedData });
        continue;
      }

      if (att.storagePath && !loadingMapRef.current.get(att.id)) {
        toLoad.push(att);
        result.push(att);
      } else {
        result.push(att);
      }
    }

    setLoadedAttachments(result);

    if (toLoad.length > 0) {
      for (const att of toLoad) {
        if (!att.storagePath) continue;

        loadingMapRef.current.set(att.id, true);

        invoke<string>("storage_get_session_attachment_path", { storagePath: att.storagePath })
          .then((fullPath) => {
            const url = convertFileSrc(fullPath);
            dataMapRef.current.set(att.id, url);
            loadingMapRef.current.set(att.id, false);

            setLoadedAttachments((prev) =>
              prev.map((a) => (a.id === att.id ? { ...a, data: url } : a)),
            );
            trimCacheToLimit(dataMapRef.current, MAX_ATTACHMENT_CACHE_ENTRIES);
          })
          .catch((err) => {
            console.error("[useSessionAttachments] Failed to load:", att.storagePath, err);
            loadingMapRef.current.set(att.id, false);
          });
      }
    }
  }, [attachments]);

  return loadedAttachments;
}
