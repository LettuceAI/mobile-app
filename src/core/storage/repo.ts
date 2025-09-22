import { z } from "zod";
import { storageBridge } from "./files";
import {
  CharacterSchema,
  SessionSchema,
  SettingsSchema,
  PersonaSchema,
  type Character,
  type Session,
  type Settings,
  type Persona,
  type ProviderCredential,
  type Model,
  createDefaultSettings,
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
  const fallback = createDefaultSettings();
  const data = await storageBridge.readSettings<Settings>(fallback);

  const parsed = SettingsSchema.safeParse(data);
  if (parsed.success) {
    const settings = parsed.data;
    let needsUpdate = false;
    for (const model of settings.models) {
      if (!model.providerLabel) {
        const providerCred = settings.providerCredentials.find((p) => p.providerId === model.providerId);
        if (providerCred) {
          (model as any).providerLabel = providerCred.label;
          needsUpdate = true;
        }
      }
    }
    if (needsUpdate) {
      await writeSettings(settings);
    }
    return settings;
  }

  await writeSettings(fallback);
  return fallback;
}

export async function writeSettings(s: Settings): Promise<void> {
  SettingsSchema.parse(s);
  await storageBridge.writeSettings(s);
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
  const fallback: Character[] = [];
  const data = await storageBridge.readCharacters<Character[]>(fallback);
  return z.array(CharacterSchema).parse(data);
}

export async function saveCharacter(c: Partial<Character> & { id?: string; name: string }): Promise<Character> {
  const list = await listCharacters();
  const idx = c.id ? list.findIndex((x) => x.id === c.id) : -1;
  let entity: Character;
  let updated: Character[];

  if (idx >= 0) {
    const existing = list[idx];
    entity = {
      ...existing,
      ...c,
      defaultModelId:
        c.defaultModelId === undefined ? existing.defaultModelId ?? null : c.defaultModelId ?? null,
      updatedAt: now(),
    } as Character;
    list[idx] = entity;
    updated = list;
  } else {
    const timestamp = now();
    entity = {
      id: (c.id as string) ?? (globalThis.crypto?.randomUUID?.() ?? uuidv4()),
      name: c.name,
      avatarPath: c.avatarPath,
      description: c.description,
      style: c.style,
      boundaries: c.boundaries,
      defaultModelId: c.defaultModelId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as Character;
    updated = [...list, entity];
  }

  await storageBridge.writeCharacters(updated);
  return entity;
}

export async function deleteCharacter(id: string): Promise<void> {
  const list = await listCharacters();
  const out = list.filter((c) => c.id !== id);
  await storageBridge.writeCharacters(out);
}

export async function listSessionIds(): Promise<string[]> {
  const fallback: string[] = [];
  return storageBridge.readSessionsIndex<string[]>(fallback);
}

export async function writeSessionIndex(ids: string[]): Promise<void> {
  await storageBridge.writeSessionsIndex(ids);
}

export async function getSession(id: string): Promise<Session | null> {
  const data = await storageBridge.readSession<Session | null>(id, null);
  return data ? SessionSchema.parse(data) : null;
}

export async function saveSession(s: Session): Promise<void> {
  SessionSchema.parse(s);
  await storageBridge.writeSession(s.id, s);
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

// Persona management functions
export async function listPersonas(): Promise<Persona[]> {
  const fallback: Persona[] = [];
  const data = await storageBridge.readPersonas<Persona[]>(fallback);
  return z.array(PersonaSchema).parse(data);
}

export async function savePersona(p: Partial<Persona> & { id?: string; title: string; description: string }): Promise<Persona> {
  const list = await listPersonas();
  const idx = p.id ? list.findIndex((x) => x.id === p.id) : -1;
  const timestamp = now();
  
  const entity: Persona = idx >= 0
    ? { ...list[idx], ...p, updatedAt: timestamp } as Persona
    : {
        id: (p.id as string) ?? (globalThis.crypto?.randomUUID?.() ?? uuidv4()),
        title: p.title,
        description: p.description,
        isDefault: p.isDefault ?? false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

  // If this persona is being set as default, unset other defaults
  if (entity.isDefault) {
    list.forEach(persona => {
      if (persona.id !== entity.id) {
        persona.isDefault = false;
      }
    });
  }

  const out = idx >= 0 ? (list[idx] = entity, list) : list.concat([entity]);
  await storageBridge.writePersonas(out);
  return entity;
}

export async function deletePersona(id: string): Promise<void> {
  const list = await listPersonas();
  const out = list.filter((p) => p.id !== id);
  await storageBridge.writePersonas(out);
}

export async function getDefaultPersona(): Promise<Persona | null> {
  const personas = await listPersonas();
  return personas.find(p => p.isDefault) || null;
}
