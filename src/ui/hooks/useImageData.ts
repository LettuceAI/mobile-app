import { useEffect, useState, useMemo, useRef } from "react";
import { convertToImageUrl } from "../../core/storage";

interface UseImageDataOptions {
  /** If true, only load image when explicitly requested (default: true for lazy loading) */
  lazy?: boolean;
}

/**
 * Hook to automatically load image URL from an image ID
 * Returns the Tauri asset protocol URL for display, or undefined if loading/not set
 * 
 * Implements lazy loading by default - images only load when needed.
 * Set lazy=false to load immediately.
 * 
 * Caches results to prevent reloading the same image ID across re-renders and mounts.
 */
export function useImageData(
  imageIdOrData: string | undefined | null,
  options?: UseImageDataOptions
): string | undefined {
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const lastProcessedIdRef = useRef<string | null | undefined>(undefined);
  
  // Memoize options to prevent recreating on every render
  const memoizedOptions = useMemo<UseImageDataOptions>(() => ({
    lazy: options?.lazy ?? true,
  }), [options?.lazy]);

  const [shouldLoad, setShouldLoad] = useState(!memoizedOptions.lazy);

  useEffect(() => {
    if (!imageIdOrData) {
      setImageUrl(undefined);
      lastProcessedIdRef.current = imageIdOrData;
      return;
    }

    // Skip if this is the same image ID we already processed
    if (lastProcessedIdRef.current === imageIdOrData && imageUrl !== undefined) {
      return;
    }

    // If it's already a data URL or http URL, use it directly
    if (imageIdOrData.startsWith("data:") || imageIdOrData.startsWith("http")) {
      setImageUrl(imageIdOrData);
      lastProcessedIdRef.current = imageIdOrData;
      return;
    }

    // If lazy loading is enabled and we haven't explicitly triggered load, wait
    if (!shouldLoad) {
      return;
    }

    // Otherwise, convert image ID to Tauri asset URL
    let cancelled = false;

    void convertToImageUrl(imageIdOrData)
      .then((url: string | undefined) => {
        if (!cancelled) {
          setImageUrl(url);
          lastProcessedIdRef.current = imageIdOrData;
        }
      })
      .catch((err: any) => {
        console.error("Failed to load image:", err);
        if (!cancelled) {
          setImageUrl(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageIdOrData, shouldLoad]);

  // For immediate loading (non-lazy mode)
  useEffect(() => {
    if (!memoizedOptions.lazy) {
      setShouldLoad(true);
    }
  }, [memoizedOptions.lazy]);

  return imageUrl;
}

/**
 * Trigger image loading for a lazy-loaded image
 * This is used internally by Chat component to preload on mount
 */
export function usePreloadImage(imageIdOrData: string | undefined | null): string | undefined {
  return useImageData(imageIdOrData, { lazy: false });
}
