import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Centralised route definitions and navigation helpers.
 * Keep all path building here so we avoid scattering strings and can enforce
 * consistent replace/back semantics (important for Android back behaviour).
 */
export const Routes = {
  chat: "/chat",
  chatRoot: "/",
  chatHistory: (characterId: string) => `/chat/${characterId}/history`,
  chatSettings: (characterId: string) => `/chat/${characterId}/settings`,
  chatSettingsSession: (characterId: string, sessionId?: string | null) => {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    const query = params.toString();
    return query ? `/chat/${characterId}/settings?${query}` : `/chat/${characterId}/settings`;
  },
  chatMemories: (characterId: string, sessionId?: string | null, extra?: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => {
        if (v !== null && v !== undefined) params.set(k, v);
      });
    }
    const query = params.toString();
    return query ? `/chat/${characterId}/memories?${query}` : `/chat/${characterId}/memories`;
  },
  chatSearch: (characterId: string, sessionId?: string | null) => {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    const query = params.toString();
    return query ? `/chat/${characterId}/search?${query}` : `/chat/${characterId}/search`;
  },
  chatSession: (characterId: string, sessionId?: string | null, extra?: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => {
        if (v !== null && v !== undefined) params.set(k, v);
      });
    }
    const query = params.toString();
    return query ? `/chat/${characterId}?${query}` : `/chat/${characterId}`;
  },
  settings: "/settings",
  settingsModels: "/settings/models",
  settingsModelsNew: "/settings/models/new",
  settingsModel: (modelId: string) => `/settings/models/${modelId}`,
  settingsImageGeneration: "/settings/image-generation",
  characterLorebook: (characterId: string) => `/settings/characters/${characterId}/lorebook`,
} as const;

export type BackMapping = {
  match: (path: string) => boolean;
  target: string;
};

// Shared back stack mappings for settings/chat screens.
export const BACK_MAPPINGS: BackMapping[] = [
  { match: (p) => p.includes("/settings/models") && p.includes("view=advanced"), target: Routes.settingsModels },
  { match: (p) => p.startsWith("/settings/models/"), target: Routes.settingsModels },
  { match: (p) => p.startsWith("/settings/image-generation"), target: Routes.settings },
  { match: (p) => p.startsWith("/settings/providers/"), target: "/settings/providers" },
  { match: (p) => p.startsWith("/settings/prompts/new"), target: "/settings/prompts" },
  { match: (p) => p.startsWith("/settings/prompts/"), target: "/settings/prompts" },
  { match: (p) => p.startsWith("/settings/advanced/memory"), target: "/settings/advanced" },
  { match: (p) => p.startsWith("/settings/embedding-download"), target: "/settings/advanced" },
  { match: (p) => p.startsWith("/settings/embedding-test"), target: "/settings/advanced" },
  { match: (p) => p.startsWith("/settings/security"), target: Routes.settings },
  { match: (p) => p.startsWith("/settings/backup"), target: Routes.settings },
  { match: (p) => p.startsWith("/settings/usage"), target: Routes.settings },
  { match: (p) => p.startsWith("/settings/changelog"), target: Routes.settings },
  { match: (p) => p.startsWith("/settings/developer"), target: Routes.settings },
  { match: (p) => p.startsWith("/settings/reset"), target: Routes.settings },
  { match: (p) => p.startsWith("/settings/personas/"), target: "/settings/personas" },
  { match: (p) => p.startsWith("/settings/personas"), target: Routes.settings },
  { match: (p) => p.includes("/lorebook"), target: "/settings/characters" },
  { match: (p) => p.startsWith("/settings/characters"), target: Routes.settings },
  { match: (p) => p.startsWith("/settings"), target: Routes.chat },
];

// Chat-specific helpers for back navigation from nested paths.
export function resolveChatBackTarget(path: string): string | null {
  if (path.startsWith("/chat/") && path.includes("/settings")) {
    const parts = path.split("/").filter(Boolean);
    const charId = parts[1];
    if (charId) return `/chat/${charId}`;
  }
  if (path.startsWith("/chat/") && path.includes("/history")) {
    const parts = path.split("/").filter(Boolean);
    const charId = parts[1];
    if (charId) return `/chat/${charId}/settings`;
  }
  return null;
}

export function resolveBackTarget(path: string): string | null {
  const chatTarget = resolveChatBackTarget(path);
  if (chatTarget) return chatTarget;

  for (const entry of BACK_MAPPINGS) {
    if (entry.match(path)) {
      return entry.target;
    }
  }
  return null;
}

type NavOptions = { replace?: boolean };

export function useNavigationManager() {
  const navigate = useNavigate();
  const location = useLocation();

  const go = useCallback(
    (path: string, options?: NavOptions) => {
      navigate(path, { replace: options?.replace });
    },
    [navigate]
  );

  const back = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  /**
   * Go back if history allows, otherwise replace to a safe fallback route.
   * This prevents stacking extra entries when returning to list pages.
   */
  const backOrReplace = useCallback(
    (fallbackPath: string) => {
      const idx = (window.history.state && (window.history.state as any).idx) ?? 0;
      if (idx > 0) {
        back();
      } else {
        go(fallbackPath, { replace: true });
      }
    },
    [back, go]
  );

  const toModelsList = useCallback(
    (options?: NavOptions) => go(Routes.settingsModels, options),
    [go]
  );

  const toNewModel = useCallback(
    (options?: NavOptions) => go(Routes.settingsModelsNew, options),
    [go]
  );

  const toEditModel = useCallback(
    (modelId: string, options?: NavOptions) => go(Routes.settingsModel(modelId), options),
    [go]
  );

  const toChatSettings = useCallback(
    (characterId: string, options?: NavOptions) => go(Routes.chatSettings(characterId), options),
    [go]
  );

  const toChatHistory = useCallback(
    (characterId: string, options?: NavOptions) => go(Routes.chatHistory(characterId), options),
    [go]
  );

  const toChatSession = useCallback(
    (characterId: string, sessionId?: string | null, extra?: Record<string, string | null>, options?: NavOptions) =>
      go(Routes.chatSession(characterId, sessionId, extra), options),
    [go]
  );

  return {
    location,
    go,
    back,
    backOrReplace,
    toModelsList,
    toNewModel,
    toEditModel,
    toChatSettings,
    toChatHistory,
    toChatSession,
  };
}
