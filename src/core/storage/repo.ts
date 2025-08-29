import { z } from "zod";
import { fileIO, dataFiles, ensureDataDir } from "./files";
import {
  CharacterSchema,
  SessionSchema,
  SettingsSchema,
  type Character,
  type Session,
  type Settings,
  type ProviderCredential,
  type Model,
} from "./schemas";

function now() {
  return Date.now();
}

function uuidv4(): string {
  const bytes = new Uint8Array(16);
  (globalThis.crypto || ({} as any)).getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

export async function readSettings(): Promise<Settings> {
  await ensureDataDir();
  const fallback: Settings = { 
    $version: 1, 
    defaultProviderCredentialId: null, 
    defaultModelId: null,
    providerCredentials: [],
    models: []
  };
  const data = await fileIO.readJson(dataFiles.settings, fallback);
  return SettingsSchema.parse(data);
}

export async function writeSettings(s: Settings): Promise<void> {
  SettingsSchema.parse(s);
  await fileIO.writeJson(dataFiles.settings, s);
}

export async function addOrUpdateProviderCredential(cred: Omit<ProviderCredential, "id"> & { id?: string }): Promise<ProviderCredential> {
  const settings = await readSettings();
  let existing = settings.providerCredentials.find((c) => c.id === cred.id);
  if (existing) {
    existing = Object.assign(existing, { ...cred });
  } else {
    const full: ProviderCredential = { id: cred.id ?? uuidv4(), ...cred } as any;
    settings.providerCredentials.push(full);
    existing = full;
    if (!settings.defaultProviderCredentialId) settings.defaultProviderCredentialId = full.id;
  }
  await writeSettings(settings);
  return existing as ProviderCredential;
}

export async function removeProviderCredential(id: string): Promise<void> {
  const settings = await readSettings();
  settings.providerCredentials = settings.providerCredentials.filter((c) => c.id !== id);
  if (settings.defaultProviderCredentialId === id) settings.defaultProviderCredentialId = settings.providerCredentials[0]?.id ?? null;
  await writeSettings(settings);
}

export async function addOrUpdateModel(model: Omit<Model, "id" | "createdAt"> & { id?: string }): Promise<Model> {
  const settings = await readSettings();
  let existing = settings.models.find((m) => m.id === model.id);
  if (existing) {
    existing = Object.assign(existing, { ...model });
  } else {
    const full: Model = { 
      id: model.id ?? uuidv4(), 
      ...model,
      createdAt: now()
    };
    settings.models.push(full);
    existing = full;
    if (!settings.defaultModelId) settings.defaultModelId = full.id;
  }
  await writeSettings(settings);
  return existing as Model;
}

export async function removeModel(id: string): Promise<void> {
  const settings = await readSettings();
  settings.models = settings.models.filter((m) => m.id !== id);
  if (settings.defaultModelId === id) settings.defaultModelId = settings.models[0]?.id ?? null;
  await writeSettings(settings);
}

export async function setDefaultModel(id: string): Promise<void> {
  const settings = await readSettings();
  if (settings.models.find((m) => m.id === id)) {
    settings.defaultModelId = id;
    await writeSettings(settings);
  }
}

export async function listCharacters(): Promise<Character[]> {
  await ensureDataDir();
  const fallback: Character[] = [];
  const data = await fileIO.readJson<Character[]>(dataFiles.characters, fallback);
  return z.array(CharacterSchema).parse(data);
}

export async function saveCharacter(c: Partial<Character> & { id?: string; name: string }): Promise<Character> {
  const list = await listCharacters();
  const idx = c.id ? list.findIndex((x) => x.id === c.id) : -1;
  const entity: Character = idx >= 0
    ? { ...list[idx], ...c, updatedAt: now() } as Character
    : {
        id: (c.id as string) ?? (globalThis.crypto?.randomUUID?.() ?? uuidv4()),
        name: c.name,
        avatarPath: c.avatarPath,
        persona: c.persona,
        style: c.style,
        boundaries: c.boundaries,
        createdAt: now(),
        updatedAt: now(),
      };
  const out = idx >= 0 ? (list[idx] = entity) : list.concat([entity]);
  await fileIO.writeJson(dataFiles.characters, out as Character[]);
  return entity;
}

export async function deleteCharacter(id: string): Promise<void> {
  const list = await listCharacters();
  const out = list.filter((c) => c.id !== id);
  await fileIO.writeJson(dataFiles.characters, out);
}

export async function listSessionIds(): Promise<string[]> {
  const fallback: string[] = [];
  return fileIO.readJson<string[]>(dataFiles.sessionsIndex, fallback);
}

export async function writeSessionIndex(ids: string[]): Promise<void> {
  await fileIO.writeJson(dataFiles.sessionsIndex, ids);
}

export async function getSession(id: string): Promise<Session | null> {
  const fallback = null as any;
  const data = await fileIO.readJson<Session | null>(dataFiles.session(id), fallback);
  return data ? SessionSchema.parse(data) : null;
}

export async function saveSession(s: Session): Promise<void> {
  SessionSchema.parse(s);
  await fileIO.writeJson(dataFiles.session(s.id), s);
  const ids = await listSessionIds();
  if (!ids.includes(s.id)) {
    ids.push(s.id);
    await writeSessionIndex(ids);
  }
}

export async function createSession(characterId: string, title: string, systemPrompt?: string): Promise<Session> {
  const id = globalThis.crypto?.randomUUID?.() ?? uuidv4();
  const s: Session = {
    id,
    characterId,
    title,
    systemPrompt,
    messages: [],
    archived: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await saveSession(s);
  return s;
}
