import { invoke } from "@tauri-apps/api/core";

export async function updateModelsCache(credId: string, models: string[]): Promise<void> {
  await invoke("models_cache_update", { credId, models });
}

export async function getCachedModels(credId: string, maxAgeMs: number): Promise<string[] | null> {
  return invoke<string[] | null>("models_cache_get", { credId, maxAgeMs });
}
