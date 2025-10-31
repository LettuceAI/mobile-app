import { invoke } from "@tauri-apps/api/core";

export type ProviderCapabilities = {
  id: string;
  name: string;
  default_base_url: string;
  api_endpoint_path: string;
  system_role: string;
  supports_stream: boolean;
  required_auth_headers: string[];
  default_headers: Record<string, string>;
};

/**
 * Fetch provider capabilities from the Rust backend (single source of truth).
 * Values are derived directly from provider adapters, so they stay in sync
 * with actual request behavior (endpoints, system role, streaming support).
 */
export async function getProviderCapabilities(): Promise<ProviderCapabilities[]> {
  return invoke<ProviderCapabilities[]>("get_provider_configs");
}

/** Optional helper to convert snake_case keys into camelCase for UI usage. */
export type ProviderCapabilitiesCamel = {
  id: string;
  name: string;
  defaultBaseUrl: string;
  apiEndpointPath: string;
  systemRole: string;
  supportsStream: boolean;
  requiredAuthHeaders: string[];
  defaultHeaders: Record<string, string>;
};

export function toCamel(c: ProviderCapabilities): ProviderCapabilitiesCamel {
  return {
    id: c.id,
    name: c.name,
    defaultBaseUrl: c.default_base_url,
    apiEndpointPath: c.api_endpoint_path,
    systemRole: c.system_role,
    supportsStream: c.supports_stream,
    requiredAuthHeaders: c.required_auth_headers,
    defaultHeaders: c.default_headers,
  };
}
