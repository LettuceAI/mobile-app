import { z } from "zod";

const TokenCount = z.number().int().nonnegative();

export const UsageSummarySchema = z.object({
  promptTokens: TokenCount.optional(),
  completionTokens: TokenCount.optional(),
  totalTokens: TokenCount.optional(),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

export const MessageVariantSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  createdAt: z.number().int(),
  usage: UsageSummarySchema.optional().nullable(),
});
export type MessageVariant = z.infer<typeof MessageVariantSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  createdAt: z.number().int(),
  usage: UsageSummarySchema.optional().nullable(),
  variants: z.array(MessageVariantSchema).optional(),
  selectedVariantId: z.string().uuid().optional(),
});
export type StoredMessage = z.infer<typeof MessageSchema>;

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
});
export type AppState = z.infer<typeof AppStateSchema>;

export function createDefaultAppState(): AppState {
  return {
    onboarding: createDefaultOnboardingState(),
    theme: "light",
    tooltips: {},
  };
}

export const SettingsSchema = z.object({
  $version: z.literal(2),
  defaultProviderCredentialId: z.string().uuid().nullable(),
  defaultModelId: z.string().uuid().nullable(),
  providerCredentials: z.array(ProviderCredentialSchema),
  models: z.array(ModelSchema),
  appState: AppStateSchema,
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
  };
}

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  avatarPath: z.string().optional(),
  description: z.string().optional(),
  style: z.string().optional(),
  boundaries: z.string().optional(),
  defaultModelId: z.string().uuid().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  title: z.string(),
  systemPrompt: z.string().nullish(),
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
