import { invoke } from "@tauri-apps/api/core";

export async function ensureDataDir() {
  try {
    await invoke("ensure_data_dir");
  } catch (e) {
    console.warn("Failed to ensure data directory:", e);
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const text = await invoke<string>("read_app_file", { path });
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(path: string, value: T): Promise<void> {
  const text = JSON.stringify(value, null, 2);
  await invoke("write_app_file", { path, content: text });
}

export const dataFiles = {
  settings: "lettuce/settings.json",
  characters: "lettuce/characters.json",
  sessionsIndex: "lettuce/sessions/index.json",
  session: (id: string) => `lettuce/sessions/${id}.json`,
};

export const fileIO = { readJson, writeJson };

