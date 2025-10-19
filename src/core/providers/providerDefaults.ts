import { invoke } from "@tauri-apps/api/core";

export interface ProviderConfig {
  id: string;
  name: string;
  default_base_url: string;
  api_endpoint_path: string;
  system_role: string;
  default_headers: Record<string, string>;
}

let cachedConfigs: ProviderConfig[] | null = null;

/**
 * Fetch all provider configurations from Rust backend
 * These are cached in memory for performance
 */
export async function getProviderConfigs(): Promise<ProviderConfig[]> {
  if (cachedConfigs) {
    return cachedConfigs;
  }

  try {
    const configs = await invoke<ProviderConfig[]>("get_provider_configs");
    cachedConfigs = configs;
    return configs;
  } catch (error) {
    console.error("[ProviderDefaults] Failed to fetch provider configs:", error);
    throw error;
  }
}

/**
 * Get a specific provider's default configuration
 */
export async function getProviderConfig(providerId: string): Promise<ProviderConfig | undefined> {
  const configs = await getProviderConfigs();
  return configs.find((p) => p.id === providerId);
}

/**
 * Get the default base URL for a provider
 */
export async function getDefaultBaseUrl(providerId: string): Promise<string> {
  const config = await getProviderConfig(providerId);
  return config?.default_base_url ?? "https://api.openai.com";
}

/**
 * Clear the cache (useful for testing or force refresh)
 */
export function clearProviderConfigCache(): void {
  cachedConfigs = null;
}
