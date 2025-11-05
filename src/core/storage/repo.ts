import { z } from "zod";
import { storageBridge } from "./files";
import { getDefaultCharacterRules } from "./defaults";
import {
  CharacterSchema,
  SessionSchema,
  SettingsSchema,
  PersonaSchema,
  type Character,
  type Session,
  type Settings,
  type Persona,
  type StoredMessage,
  type ProviderCredential,
  type Model,
  type AdvancedModelSettings,
  createDefaultSettings,
  createDefaultAdvancedModelSettings,
} from "./schemas";

export const SETTINGS_UPDATED_EVENT = "lettuceai:settings-updated";

function broadcastSettingsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
  }
}

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
    if (!settings.advancedModelSettings) {
      settings.advancedModelSettings = createDefaultAdvancedModelSettings();
      needsUpdate = true;
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
  broadcastSettingsUpdated();
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
  
  const migrated = data.map((char: any) => {
    if (char.scenes && char.scenes.length > 0 && typeof char.scenes[0] === 'string') {
      const timestamp = now();
      return {
        ...char,
        scenes: char.scenes.map((sceneContent: string, idx: number) => ({
          id: globalThis.crypto?.randomUUID?.() ?? `${timestamp}-${idx}`,
          content: sceneContent,
          createdAt: timestamp,
        })),
        defaultSceneId: null,
      };
    }
    return char;
  });
  
  const parsed = z.array(CharacterSchema).parse(migrated);
  
  const needsMigration = data.some((char: any) => 
    char.scenes && char.scenes.length > 0 && typeof char.scenes[0] === 'string'
  );
  if (needsMigration) {
    await storageBridge.writeCharacters(parsed);
  }
  
  return parsed;
}

export async function saveCharacter(c: Partial<Character>): Promise<Character> {
  const list = await listCharacters();
  let updated: Character[];
  let entity: Character;

  if (c.id) {
    const idx = list.findIndex((x) => x.id === c.id);
    if (idx === -1) throw new Error("Character not found");
    entity = { ...list[idx], ...c, updatedAt: now() } as Character;
    
    // Auto-set defaultSceneId if not set and there's exactly one scene
    if (!entity.defaultSceneId && entity.scenes.length === 1) {
      entity.defaultSceneId = entity.scenes[0].id;
    }
    
    updated = [...list.slice(0, idx), entity, ...list.slice(idx + 1)];
  } else {
    const timestamp = now();
    const settings = await readSettings();
    const pureModeEnabled = settings.appState.pureModeEnabled ?? true;
    const defaultRules = c.rules && c.rules.length > 0 ? c.rules : await getDefaultCharacterRules(pureModeEnabled);
    
    const scenes = c.scenes ?? [];
    // Auto-set defaultSceneId: use provided, or first scene if only one exists
    const autoDefaultSceneId = c.defaultSceneId ?? (scenes.length === 1 ? scenes[0].id : null);
    
    entity = {
      id: (c.id as string) ?? (globalThis.crypto?.randomUUID?.() ?? uuidv4()),
      name: c.name,
      avatarPath: c.avatarPath,
      backgroundImagePath: c.backgroundImagePath,
      description: c.description,
      scenes: scenes,
      defaultSceneId: autoDefaultSceneId,
      rules: defaultRules,
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

export async function saveAdvancedModelSettings(settings: AdvancedModelSettings): Promise<void> {
  const current = await readSettings();
  current.advancedModelSettings = settings;
  await writeSettings(current);
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

export async function archiveSession(id: string, archived = true): Promise<Session | null> {
  const existing = await getSession(id);
  if (!existing) return null;
  const updated: Session = {
    ...existing,
    archived,
    updatedAt: now(),
  };
  await saveSession(updated);
  return updated;
}

export async function updateSessionTitle(id: string, title: string): Promise<Session | null> {
  const existing = await getSession(id);
  if (!existing) return null;
  const updated: Session = {
    ...existing,
    title: title.trim(),
    updatedAt: now(),
  };
  await saveSession(updated);
  return updated;
}

export async function deleteSession(id: string): Promise<void> {
  await storageBridge.deleteSession(id);
  const ids = await listSessionIds();
  const filtered = ids.filter((entry) => entry !== id);
  if (filtered.length !== ids.length) {
    await writeSessionIndex(filtered);
  }
}

export async function createSession(characterId: string, title: string, systemPrompt?: string, selectedSceneId?: string): Promise<Session> {
  const id = globalThis.crypto?.randomUUID?.() ?? uuidv4();
  const timestamp = now();
  
  const messages: StoredMessage[] = [];
  
  const characters = await listCharacters();
  const character = characters.find(c => c.id === characterId);
  
  if (character) {
    const sceneId = selectedSceneId || character.defaultSceneId || character.scenes[0]?.id;
    
    if (sceneId) {
      const scene = character.scenes.find(s => s.id === sceneId);
      if (scene) {
        const sceneContent = scene.selectedVariantId 
          ? scene.variants?.find(v => v.id === scene.selectedVariantId)?.content ?? scene.content
          : scene.content;
        
        if (sceneContent.trim()) {
          messages.push({
            id: globalThis.crypto?.randomUUID?.() ?? uuidv4(),
            role: "scene", // Use "scene" role instead of "assistant"
            content: sceneContent.trim(),
            createdAt: timestamp,
          });
        }
      }
    }
  }
  
  const s: Session = {
    id,
    characterId,
    title,
    systemPrompt,
    selectedSceneId: selectedSceneId || character?.defaultSceneId || character?.scenes[0]?.id,
    messages,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await saveSession(s);
  return s;
}

export async function toggleMessagePin(sessionId: string, messageId: string): Promise<Session | null> {
  const session = await getSession(sessionId);
  if (!session) return null;
  
  const messageIndex = session.messages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) return null;
  
  const updatedMessages = [...session.messages];
  updatedMessages[messageIndex] = {
    ...updatedMessages[messageIndex],
    isPinned: !updatedMessages[messageIndex].isPinned,
  };
  
  const updated: Session = {
    ...session,
    messages: updatedMessages,
    updatedAt: now(),
  };
  
  await saveSession(updated);
  return updated;
}

// Persona management functions
export async function listPersonas(): Promise<Persona[]> {
  const fallback: Persona[] = [];
  const data = await storageBridge.readPersonas<Persona[]>(fallback);
  return z.array(PersonaSchema).parse(data);
}

export async function getPersona(id: string): Promise<Persona | null> {
  const personas = await listPersonas();
  return personas.find(p => p.id === id) || null;
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
