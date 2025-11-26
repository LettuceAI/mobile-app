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
  type AppState,
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
      console.log("[repo] readSettings: Updating settings with defaults (granular)", {
        missingProviderLabel: settings.models.some(m => !m.providerLabel),
        missingAdvancedSettings: !settings.advancedModelSettings
      });
      if (!settings.advancedModelSettings) {
        await saveAdvancedModelSettings(createDefaultAdvancedModelSettings());
      }
      // Provider labels are transient/derived, we don't need to persist them back to DB immediately 
      // unless we want to cache them. For now, we just return the patched object.
    }
    return settings;
  }

  // If settings don't exist, we still need to initialize the row
  await storageBridge.settingsSetDefaults(null, null);
  return fallback;
}

export async function writeSettings(s: Settings, suppressBroadcast = false): Promise<void> {
  SettingsSchema.parse(s);
  await storageBridge.writeSettings(s);
  if (!suppressBroadcast) {
    broadcastSettingsUpdated();
  }
}

// Granular update functions
export async function setDefaultProvider(id: string | null): Promise<void> {
  await storageBridge.settingsSetDefaultProvider(id);
  broadcastSettingsUpdated();
}

export async function setDefaultModel(id: string | null): Promise<void> {
  await storageBridge.settingsSetDefaultModel(id);
  broadcastSettingsUpdated();
}

export async function setAppState(state: AppState): Promise<void> {
  await storageBridge.settingsSetAppState(state);
  broadcastSettingsUpdated();
}

export async function setPromptTemplate(id: string | null): Promise<void> {
  await storageBridge.settingsSetPromptTemplate(id);
  broadcastSettingsUpdated();
}

export async function setSystemPrompt(prompt: string | null): Promise<void> {
  await storageBridge.settingsSetSystemPrompt(prompt);
  broadcastSettingsUpdated();
}

export async function setMigrationVersion(version: number): Promise<void> {
  await storageBridge.settingsSetMigrationVersion(version);
  broadcastSettingsUpdated();
}

export async function addOrUpdateProviderCredential(cred: Omit<ProviderCredential, "id"> & { id?: string }): Promise<ProviderCredential> {
  const entity: ProviderCredential = await storageBridge.providerUpsert({ id: cred.id ?? uuidv4(), ...cred });
  // Ensure a default provider is set if missing
  const current = await readSettings();
  if (!current.defaultProviderCredentialId) {
    await setDefaultProvider(entity.id);
  }
  broadcastSettingsUpdated();
  return entity;
}

export async function removeProviderCredential(id: string): Promise<void> {
  await storageBridge.providerDelete(id);
  const current = await readSettings();
  if (current.defaultProviderCredentialId === id) {
    const nextDefault = current.providerCredentials.find((c) => c.id !== id)?.id ?? null;
    await setDefaultProvider(nextDefault);
  }
  broadcastSettingsUpdated();
}

export async function addOrUpdateModel(model: Omit<Model, "id" | "createdAt"> & { id?: string }): Promise<Model> {
  const entity: Model = await storageBridge.modelUpsert({ id: model.id ?? uuidv4(), ...model });
  const current = await readSettings();
  if (!current.defaultModelId) {
    await setDefaultModel(entity.id);
  }
  broadcastSettingsUpdated();
  return entity;
}

export async function removeModel(id: string): Promise<void> {
  await storageBridge.modelDelete(id);
  const current = await readSettings();
  if (current.defaultModelId === id) {
    const nextDefault = current.models.find((m) => m.id !== id)?.id ?? null;
    await setDefaultModel(nextDefault);
  }
  broadcastSettingsUpdated();
}

export async function setDefaultModelId(id: string): Promise<void> {
  const settings = await readSettings();
  if (settings.models.find((m) => m.id === id)) {
    await setDefaultModel(id);
  }
}

export async function listCharacters(): Promise<Character[]> {
  const data = await storageBridge.charactersList();
  return z.array(CharacterSchema).parse(data);
}

export async function saveCharacter(c: Partial<Character>): Promise<Character> {
  const settings = await readSettings();
  const pureModeEnabled = settings.appState.pureModeEnabled ?? true;
  const defaultRules = c.rules && c.rules.length > 0 ? c.rules : await getDefaultCharacterRules(pureModeEnabled);
  const timestamp = now();

  const scenes = c.scenes ?? [];
  const entity: Character = {
    id: c.id ?? (globalThis.crypto?.randomUUID?.() ?? uuidv4()),
    name: c.name!,
    avatarPath: c.avatarPath,
    backgroundImagePath: c.backgroundImagePath,
    description: c.description,
    scenes,
    defaultSceneId: c.defaultSceneId ?? (scenes.length === 1 ? scenes[0].id : null),
    rules: defaultRules,
    defaultModelId: c.defaultModelId ?? null,
    memoryType: c.memoryType ?? "manual",
    createdAt: c.createdAt ?? timestamp,
    updatedAt: timestamp,
  } as Character;

  const stored = await storageBridge.characterUpsert(entity);
  return CharacterSchema.parse(stored);
}

export async function deleteCharacter(id: string): Promise<void> {
  await storageBridge.characterDelete(id);
}

export async function listSessionIds(): Promise<string[]> {
  return storageBridge.sessionsListIds();
}

export async function saveAdvancedModelSettings(settings: AdvancedModelSettings): Promise<void> {
  await storageBridge.settingsSetAdvancedModelSettings(settings);
  broadcastSettingsUpdated();
}

export async function saveAdvancedSettings(settings: Settings["advancedSettings"]): Promise<void> {
  await storageBridge.settingsSetAdvanced(settings);
  broadcastSettingsUpdated();
}

// Legacy writeSessionIndex removed (DB manages session IDs)

export async function getSession(id: string): Promise<Session | null> {
  const data = await storageBridge.sessionGet(id);
  return data ? SessionSchema.parse(data) : null;
}

export async function saveSession(s: Session): Promise<void> {
  SessionSchema.parse(s);
  await storageBridge.sessionUpsert(s);
}

export async function archiveSession(id: string, archived = true): Promise<Session | null> {
  await storageBridge.sessionArchive(id, archived);
  return getSession(id);
}

export async function updateSessionTitle(id: string, title: string): Promise<Session | null> {
  await storageBridge.sessionUpdateTitle(id, title.trim());
  return getSession(id);
}

export async function deleteSession(id: string): Promise<void> {
  await storageBridge.sessionDelete(id);
}

export async function createSession(characterId: string, title: string, selectedSceneId?: string): Promise<Session> {
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
            memoryRefs: [],
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
    selectedSceneId: selectedSceneId || character?.defaultSceneId || character?.scenes[0]?.id,
    memories: [],
    messages,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await saveSession(s);
  return s;
}

export async function toggleMessagePin(sessionId: string, messageId: string): Promise<Session | null> {
  const updated = await storageBridge.messageTogglePin(sessionId, messageId);
  return updated ? SessionSchema.parse(updated) : null;
}

// Memory management functions
export async function addMemory(sessionId: string, memory: string): Promise<Session | null> {
  const updated = await storageBridge.sessionAddMemory(sessionId, memory);
  return updated ? SessionSchema.parse(updated) : null;
}

export async function removeMemory(sessionId: string, memoryIndex: number): Promise<Session | null> {
  const updated = await storageBridge.sessionRemoveMemory(sessionId, memoryIndex);
  return updated ? SessionSchema.parse(updated) : null;
}

export async function updateMemory(sessionId: string, memoryIndex: number, newMemory: string): Promise<Session | null> {
  const updated = await storageBridge.sessionUpdateMemory(sessionId, memoryIndex, newMemory);
  return updated ? SessionSchema.parse(updated) : null;
}

// Persona management functions
export async function listPersonas(): Promise<Persona[]> {
  const data = await storageBridge.personasList();
  return z.array(PersonaSchema).parse(data);
}

export async function getPersona(id: string): Promise<Persona | null> {
  const personas = await listPersonas();
  return personas.find(p => p.id === id) || null;
}

export async function savePersona(p: Partial<Persona> & { id?: string; title: string; description: string }): Promise<Persona> {
  const entity: Persona = {
    id: p.id ?? (globalThis.crypto?.randomUUID?.() ?? uuidv4()),
    title: p.title,
    description: p.description,
    avatarPath: p.avatarPath,
    isDefault: p.isDefault ?? false,
    createdAt: p.createdAt ?? now(),
    updatedAt: now(),
  } as Persona;

  const saved = await storageBridge.personaUpsert(entity);
  return PersonaSchema.parse(saved);
}

export async function deletePersona(id: string): Promise<void> {
  await storageBridge.personaDelete(id);
}

export async function getDefaultPersona(): Promise<Persona | null> {
  const p = await storageBridge.personaDefaultGet();
  return p ? PersonaSchema.parse(p) : null;
}

export async function checkEmbeddingModel(): Promise<boolean> {
  return storageBridge.checkEmbeddingModel();
}
