import { useEffect, useState, useMemo, useRef } from "react";
import { convertToImageUrl } from "../../core/storage";

interface UseImageDataOptions {
  lazy?: boolean;
}

/**
 * Hook to automatically load image URL from an image ID
 * Returns the Tauri asset protocol URL for display, or undefined if loading/not set
 * 
 * Loads images immediately and asynchronously to avoid blocking the UI thread.
 * Results are cached to prevent reloading the same image across re-renders.
 */
export function useImageData(
  imageIdOrData: string | undefined | null,
  options?: UseImageDataOptions
): string | undefined {
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const lastProcessedIdRef = useRef<string | null | undefined>(undefined);
  
  const memoizedOptions = useMemo<UseImageDataOptions>(() => ({
    lazy: options?.lazy ?? false, 
  }), [options?.lazy]);

  const [shouldLoad, setShouldLoad] = useState(!memoizedOptions.lazy);

  useEffect(() => {
    if (!imageIdOrData) {
      setImageUrl(undefined);
      lastProcessedIdRef.current = imageIdOrData;
      return;
    }

    if (lastProcessedIdRef.current === imageIdOrData && imageUrl !== undefined) {
      return;
    }

    if (imageIdOrData.startsWith("data:") || imageIdOrData.startsWith("http")) {
      setImageUrl(imageIdOrData);
      lastProcessedIdRef.current = imageIdOrData;
      return;
    }

    if (!shouldLoad) {
      return;
    }

    console.log("[useImageData] Loading image for ID:", imageIdOrData);
    let cancelled = false;

    void convertToImageUrl(imageIdOrData)
      .then((url: string | undefined) => {
        if (!cancelled) {
          console.log("[useImageData] Successfully loaded image:", url ? "present" : "failed");
          setImageUrl(url);
          lastProcessedIdRef.current = imageIdOrData;
        }
      })
      .catch((err: any) => {
        console.error('[useImageData] Failed to load image:', err);
        if (!cancelled) {
          setImageUrl(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageIdOrData, shouldLoad, imageUrl]);

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
