import { z } from "zod";

const TokenCount = z.number().int().nonnegative();

export const PromptScopeSchema = z.enum(["appWide", "modelSpecific", "characterSpecific"]);
export type PromptScope = z.infer<typeof PromptScopeSchema>;

export const SystemPromptTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  scope: PromptScopeSchema,
  targetIds: z.array(z.string()).default([]),
  content: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type SystemPromptTemplate = z.infer<typeof SystemPromptTemplateSchema>;

export const UsageSummarySchema = z.object({
  promptTokens: TokenCount.optional(),
  completionTokens: TokenCount.optional(),
  totalTokens: TokenCount.optional(),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

export const AdvancedModelSettingsSchema = z.object({
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  maxOutputTokens: z.number().int().min(1).nullable().optional(),
});
export type AdvancedModelSettings = z.infer<typeof AdvancedModelSettingsSchema>;

export const MessageVariantSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  createdAt: z.number().int(),
  usage: UsageSummarySchema.optional().nullable(),
});
export type MessageVariant = z.infer<typeof MessageVariantSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["system", "user", "assistant", "scene"]),
  content: z.string(),
  createdAt: z.number().int(),
  usage: UsageSummarySchema.optional().nullable(),
  variants: z.array(MessageVariantSchema).optional(),
  selectedVariantId: z.string().uuid().nullish(),
});
export type StoredMessage = z.infer<typeof MessageSchema>;

export const SceneVariantSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  createdAt: z.number().int(),
});
export type SceneVariant = z.infer<typeof SceneVariantSchema>;

export const SceneSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  createdAt: z.number().int(),
  variants: z.array(SceneVariantSchema).optional(),
  selectedVariantId: z.string().uuid().nullish(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const SecretRefSchema = z.object({ providerId: z.string(), key: z.string(), credId: z.string().uuid().optional() });
export type SecretRef = z.infer<typeof SecretRefSchema>;

export const ProviderCredentialSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string(),
  label: z.string().min(1),
  apiKeyRef: SecretRefSchema.optional(),
  baseUrl: z.string().optional(),
  defaultModel: z.string().optional(),
  headers: z.record(z.string()).optional(),
});
export type ProviderCredential = z.infer<typeof ProviderCredentialSchema>;

export const ModelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  providerId: z.string(),
  providerLabel: z.string().min(1),
  displayName: z.string().min(1),
  createdAt: z.number().int(),
  advancedModelSettings: AdvancedModelSettingsSchema.nullish().optional(),
  promptTemplateId: z.string().nullish().optional(),
  systemPrompt: z.string().nullish().optional(), // Deprecated
});
export type Model = z.infer<typeof ModelSchema>;

export const OnboardingStateSchema = z.object({
  completed: z.boolean(),
  skipped: z.boolean(),
  providerSetupCompleted: z.boolean(),
  modelSetupCompleted: z.boolean(),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export function createDefaultOnboardingState(): OnboardingState {
  return {
    completed: false,
    skipped: false,
    providerSetupCompleted: false,
    modelSetupCompleted: false,
  };
}

export const TooltipsStateSchema = z.record(z.boolean());
export type TooltipsState = z.infer<typeof TooltipsStateSchema>;

export const AppStateSchema = z.object({
  onboarding: OnboardingStateSchema,
  theme: z.enum(["light", "dark"]),
  tooltips: TooltipsStateSchema,
  pureModeEnabled: z.boolean().default(true),
});
export type AppState = z.infer<typeof AppStateSchema>;

export function createDefaultAppState(): AppState {
  return {
    onboarding: createDefaultOnboardingState(),
    theme: "light",
    tooltips: {},
    pureModeEnabled: true,
  };
}

export const SettingsSchema = z.object({
  $version: z.literal(2),
  defaultProviderCredentialId: z.string().uuid().nullable(),
  defaultModelId: z.string().uuid().nullable(),
  providerCredentials: z.array(ProviderCredentialSchema),
  models: z.array(ModelSchema),
  appState: AppStateSchema,
  advancedModelSettings: AdvancedModelSettingsSchema.optional(),
  promptTemplateId: z.string().nullish().optional(),
  systemPrompt: z.string().nullish().optional(), // Deprecated
  migrationVersion: z.number().int().default(0),
});
export type Settings = z.infer<typeof SettingsSchema>;

export function createDefaultSettings(): Settings {
  return {
    $version: 2,
    defaultProviderCredentialId: null,
    defaultModelId: null,
    providerCredentials: [],
    models: [],
    appState: createDefaultAppState(),
    advancedModelSettings: createDefaultAdvancedModelSettings(),
    promptTemplateId: null,
    systemPrompt: null,
    migrationVersion: 0,
  };
}

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  avatarPath: z.string().optional(),
  backgroundImagePath: z.string().optional(),
  description: z.string().optional(),
  rules: z.array(z.string()).default([]),
  scenes: z.array(SceneSchema).default([]),
  defaultSceneId: z.string().uuid().nullish(),
  defaultModelId: z.string().uuid().nullable().optional(),
  promptTemplateId: z.string().nullish().optional(),
  systemPrompt: z.string().nullish().optional(), // Deprecated
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  title: z.string(),
  systemPrompt: z.string().nullish(),
  selectedSceneId: z.string().uuid().nullish(), // ID of the scene from character.scenes array
  personaId: z.union([
    z.string().uuid(),
    z.literal(""),
    z.null(),
    z.undefined()
  ]).optional(),
  advancedModelSettings: AdvancedModelSettingsSchema.nullish().optional(),
  messages: z.array(MessageSchema),
  archived: z.boolean().default(false),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Session = z.infer<typeof SessionSchema>;

export const PersonaSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  isDefault: z.boolean().default(false),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Persona = z.infer<typeof PersonaSchema>;

export function createDefaultAdvancedModelSettings(): AdvancedModelSettings {
  return {
    temperature: 0.7,
    topP: 1,
    maxOutputTokens: 1024,
  };
}
