import { invoke } from "@tauri-apps/api/core";

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

  readCharacters: <T>(fallback: T) => readJsonCommand<T>("storage_read_characters", undefined, fallback).then((res) => res ?? fallback),
  writeCharacters: (value: unknown) => writeJsonCommand("storage_write_characters", value),

  readPersonas: <T>(fallback: T) => readJsonCommand<T>("storage_read_personas", undefined, fallback).then((res) => res ?? fallback),
  writePersonas: (value: unknown) => writeJsonCommand("storage_write_personas", value),

  readSessionsIndex: <T>(fallback: T) => readJsonCommand<T>("storage_read_sessions_index", undefined, fallback).then((res) => res ?? fallback),
  writeSessionsIndex: (value: unknown) => writeJsonCommand("storage_write_sessions_index", value),

  readSession: <T>(id: string, fallback: T | undefined = undefined) =>
    readJsonCommand<T>("storage_read_session", { sessionId: id }, fallback).then((res) => res ?? fallback),
  writeSession: (id: string, value: unknown) => writeJsonCommand("storage_write_session", value, { sessionId: id }),
  deleteSession: (id: string) => invoke("storage_delete_session", { sessionId: id }),

  clearAll: () => invoke("storage_clear_all"),
  usageSummary: () => invoke("storage_usage_summary") as Promise<{
    fileCount: number;
    estimatedSessions: number;
    lastUpdatedMs: number | null;
  }>
};
