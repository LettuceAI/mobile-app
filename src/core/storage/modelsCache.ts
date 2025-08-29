import { z } from "zod";
import { fileIO, ensureDataDir } from "./files";

const Entry = z.object({ models: z.array(z.string()), fetchedAt: z.number().int() });
export type ModelsEntry = z.infer<typeof Entry>;

const Schema = z.object({ entries: z.record(Entry) });
export type ModelsCache = z.infer<typeof Schema>;

const cacheFile = () => "lettuce/models-cache.json";

export async function readModelsCache(): Promise<ModelsCache> {
  await ensureDataDir();
  const data = await fileIO.readJson<ModelsCache>(cacheFile(), { entries: {} });
  return Schema.parse(data);
}

export async function writeModelsCache(cache: ModelsCache): Promise<void> {
  Schema.parse(cache);
  await fileIO.writeJson(cacheFile(), cache);
}

export async function updateModelsCache(credId: string, models: string[]): Promise<void> {
  const cache = await readModelsCache();
  cache.entries[credId] = { models, fetchedAt: Date.now() };
  await writeModelsCache(cache);
}

export async function getCachedModels(credId: string, maxAgeMs: number): Promise<string[] | null> {
  const cache = await readModelsCache();
  const e = cache.entries[credId];
  if (!e) return null;
  if (Date.now() - e.fetchedAt > maxAgeMs) return null;
  return e.models;
}

