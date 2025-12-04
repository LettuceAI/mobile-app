import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

async function readJsonCommand<T>(command: string, args?: Record<string, unknown>, fallback?: T): Promise<T | null> {
  try {
    const result = await invoke<string | null>(command, args ?? {});
    if (!result || result.length === 0) {
      return fallback ?? null;
    }
    return JSON.parse(result) as T;
  } catch (error) {
    console.warn(`Failed to invoke ${command}:`, error);
    return fallback ?? null;
  }
}

async function writeJsonCommand(command: string, data: unknown, args?: Record<string, unknown>): Promise<void> {
  const payload = JSON.stringify(data, null, 2);
  await invoke(command, { data: payload, ...(args ?? {}) });
}

export const storageBridge = {
  readSettings: <T>(fallback: T) => readJsonCommand<T>("storage_read_settings", undefined, fallback).then((res) => res ?? fallback),
  writeSettings: (value: unknown) => writeJsonCommand("storage_write_settings", value),
  // New granular commands (phase 1): providers/models/defaults/advanced settings
  settingsSetDefaults: (defaultProviderCredentialId: string | null, defaultModelId: string | null) =>
    invoke("settings_set_defaults", { defaultProviderCredentialId, defaultModelId }) as Promise<void>,
  settingsSetDefaultProvider: (id: string | null) => invoke("settings_set_default_provider", { id }) as Promise<void>,
  settingsSetDefaultModel: (id: string | null) => invoke("settings_set_default_model", { id }) as Promise<void>,
  settingsSetAppState: (state: unknown) => invoke("settings_set_app_state", { stateJson: JSON.stringify(state) }) as Promise<void>,
  settingsSetPromptTemplate: (id: string | null) => invoke("settings_set_prompt_template", { id }) as Promise<void>,
  settingsSetSystemPrompt: (prompt: string | null) => invoke("settings_set_system_prompt", { prompt }) as Promise<void>,
  settingsSetMigrationVersion: (version: number) => invoke("settings_set_migration_version", { version }) as Promise<void>,
  settingsSetAdvancedModelSettings: (advanced: unknown | null) =>
    invoke("settings_set_advanced_model_settings", { advancedJson: advanced == null ? "null" : JSON.stringify(advanced) }) as Promise<void>,
  settingsSetAdvanced: (advanced: unknown | null) =>
    invoke("settings_set_advanced", { advancedJson: advanced == null ? "null" : JSON.stringify(advanced) }) as Promise<void>,

  // Embedding model download
  checkEmbeddingModel: () => invoke<boolean>("check_embedding_model"),
  startEmbeddingDownload: () => invoke("start_embedding_download") as Promise<void>,
  getEmbeddingDownloadProgress: () => invoke<{ downloaded: number; total: number; status: string; currentFileIndex: number; totalFiles: number; currentFileName: string }>("get_embedding_download_progress"),
  listenToEmbeddingDownloadProgress: (callback: (progress: { downloaded: number; total: number; status: string; currentFileIndex: number; totalFiles: number; currentFileName: string }) => void) =>
    listen<{ downloaded: number; total: number; status: string; currentFileIndex: number; totalFiles: number; currentFileName: string }>("embedding_download_progress", (event) => callback(event.payload)),
  cancelEmbeddingDownload: () => invoke("cancel_embedding_download") as Promise<void>,
  computeEmbedding: (text: string) => invoke<number[]>("compute_embedding", { text }),
  initializeEmbeddingModel: () => invoke("initialize_embedding_model") as Promise<void>,
  runEmbeddingTest: () => invoke<{
    success: boolean;
    message: string;
    scores: Array<{
      pairName: string;
      textA: string;
      textB: string;
      similarityScore: number;
      expected: string;
    }>;
  }>("run_embedding_test"),
  deleteEmbeddingModel: () => invoke("delete_embedding_model") as Promise<void>,

  providerUpsert: (cred: unknown) =>
    invoke<string>("provider_upsert", { credentialJson: JSON.stringify(cred) }).then((s) => JSON.parse(s)),
  providerDelete: (id: string) => invoke("provider_delete", { id }) as Promise<void>,

  modelUpsert: (model: unknown) =>
    invoke<string>("model_upsert", { modelJson: JSON.stringify(model) }).then((s) => JSON.parse(s)),
  modelDelete: (id: string) => invoke("model_delete", { id }) as Promise<void>,

  // Characters
  charactersList: () => invoke<string>("characters_list").then((s) => JSON.parse(s) as any[]),
  characterUpsert: (character: unknown) => invoke<string>("character_upsert", { characterJson: JSON.stringify(character) }).then((s) => JSON.parse(s)),
  characterDelete: (id: string) => invoke("character_delete", { id }) as Promise<void>,

  // Personas
  personasList: () => invoke<string>("personas_list").then((s) => JSON.parse(s) as any[]),
  personaUpsert: (persona: unknown) => invoke<string>("persona_upsert", { personaJson: JSON.stringify(persona) }).then((s) => JSON.parse(s)),
  personaDelete: (id: string) => invoke("persona_delete", { id }) as Promise<void>,
  personaDefaultGet: () => invoke<string | null>("persona_default_get").then((s) => (typeof s === "string" ? (JSON.parse(s) as any) : null)),

  // Sessions
  sessionsListIds: () => invoke<string>("sessions_list_ids").then((s) => JSON.parse(s) as string[]),
  sessionGet: (id: string) => invoke<string | null>("session_get", { id }).then((s) => (typeof s === "string" ? JSON.parse(s) : null)),
  sessionUpsert: (session: unknown) => invoke("session_upsert", { sessionJson: JSON.stringify(session) }) as Promise<void>,
  sessionDelete: (id: string) => invoke("session_delete", { id }) as Promise<void>,
  sessionArchive: (id: string, archived: boolean) => invoke("session_archive", { id, archived }) as Promise<void>,
  sessionUpdateTitle: (id: string, title: string) => invoke("session_update_title", { id, title }) as Promise<void>,
  messageTogglePin: (sessionId: string, messageId: string) => invoke<string | null>("message_toggle_pin", { sessionId, messageId }).then((s) => (typeof s === "string" ? JSON.parse(s) : null)),
  sessionAddMemory: (sessionId: string, memory: string) => invoke<string | null>("session_add_memory", { sessionId, memory }).then((s) => (typeof s === "string" ? JSON.parse(s) : null)),
  sessionRemoveMemory: (sessionId: string, memoryIndex: number) => invoke<string | null>("session_remove_memory", { sessionId, memoryIndex }).then((s) => (typeof s === "string" ? JSON.parse(s) : null)),
  sessionUpdateMemory: (sessionId: string, memoryIndex: number, newMemory: string) => invoke<string | null>("session_update_memory", { sessionId, memoryIndex, newMemory }).then((s) => (typeof s === "string" ? JSON.parse(s) : null)),

  // Legacy file-based bridges removed: characters/personas/sessions

  clearAll: () => invoke("storage_clear_all"),
  resetDatabase: () => invoke("storage_reset_database") as Promise<void>,
  usageSummary: () => invoke("storage_usage_summary") as Promise<{
    fileCount: number;
    estimatedSessions: number;
    lastUpdatedMs: number | null;
  }>,
  
  dbCheckpoint: () => invoke("db_checkpoint") as Promise<void>,
  dbOptimize: () => invoke("db_optimize") as Promise<void>,
};
