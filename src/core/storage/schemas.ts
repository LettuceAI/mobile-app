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
  frequencyPenalty: z.number().min(-2).max(2).nullable().optional(),
  presencePenalty: z.number().min(-2).max(2).nullable().optional(),
  topK: z.number().int().min(1).max(500).nullable().optional(),
});
export type AdvancedModelSettings = z.infer<typeof AdvancedModelSettingsSchema>;

/**
 * Provider parameter support information
 * Documents which advanced parameters are supported by each LLM provider
 */
export const PROVIDER_PARAMETER_SUPPORT = {
  openai: {
    providerId: 'openai',
    displayName: 'OpenAI',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: true,
      presencePenalty: true,
      topK: false,
    },
  },
  openrouter: {
    providerId: 'openrouter',
    displayName: 'OpenRouter',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: true,
      presencePenalty: true,
      topK: true,
    },
  },
  anthropic: {
    providerId: 'anthropic',
    displayName: 'Anthropic',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: false,
      presencePenalty: false,
      topK: true,
    },
  },
  groq: {
    providerId: 'groq',
    displayName: 'Groq',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: true,
      presencePenalty: true,
      topK: false,
    },
  },
  mistral: {
    providerId: 'mistral',
    displayName: 'Mistral',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: true,
      presencePenalty: true,
      topK: false,
    },
  },
  google: {
    providerId: 'google',
    displayName: 'Google',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: false,
      presencePenalty: false,
      topK: true,
    },
  },
  deepseek: {
    providerId: 'deepseek',
    displayName: 'DeepSeek',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: true,
      presencePenalty: true,
      topK: false,
    },
  },

  nanogpt: {
    providerId: 'nanogpt',
    displayName: 'NanoGPT',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: true,
      presencePenalty: true,
      topK: false,
    },
  },

  xai: {
    providerId: 'xai',
    displayName: 'xAI (Grok)',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: true,
      presencePenalty: true,
      topK: false, // not supported in OpenAI-compatible API
    },
  },

  anannas: {
    providerId: 'anannas',
    displayName: 'Anannas AI',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: true,
      presencePenalty: true,
      topK: false,
    },
  },

  zai: {
    providerId: 'zai',
    displayName: 'ZAI (Zhipu / GLM)',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: false, // not documented
      presencePenalty: false,  // not documented
      topK: false, // GLM API uses top_p but not top_k exposed
    },
  },

  moonshot: {
    providerId: 'moonshot',
    displayName: 'Moonshot AI (Kimi)',
    supportedParameters: {
      temperature: true,
      topP: true,
      maxOutputTokens: true,
      frequencyPenalty: true,
      presencePenalty: true,
      topK: false,
    },
  },
} as const;

export type ProviderId = keyof typeof PROVIDER_PARAMETER_SUPPORT;
export type ProviderParameterSupport = typeof PROVIDER_PARAMETER_SUPPORT[ProviderId];

/**
 * Helper function to check if a provider supports a specific parameter
 */
export function providerSupportsParameter(
  providerId: string,
  parameter: keyof AdvancedModelSettings
): boolean {
  const provider = PROVIDER_PARAMETER_SUPPORT[providerId as ProviderId];
  if (!provider) return false;
  return provider.supportedParameters[parameter] ?? false;
}

/**
 * Helper function to get all supported parameters for a provider
 */
export function getSupportedParameters(providerId: string): (keyof AdvancedModelSettings)[] {
  const provider = PROVIDER_PARAMETER_SUPPORT[providerId as ProviderId];
  if (!provider) return ['temperature', 'topP', 'maxOutputTokens'];

  return Object.entries(provider.supportedParameters)
    .filter(([_, supported]) => supported)
    .map(([param]) => param as keyof AdvancedModelSettings);
}

export const ImageAttachmentSchema = z.object({
  id: z.string().uuid(),
  /** Base64 encoded image data or a URL - may be empty if storagePath is set (lazy loading) */
  data: z.string(),
  /** MIME type (e.g., 'image/png', 'image/jpeg') */
  mimeType: z.string(),
  /** Original filename if available */
  filename: z.string().optional(),
  /** Width in pixels */
  width: z.number().int().optional(),
  /** Height in pixels */
  height: z.number().int().optional(),
  /** Relative storage path for persisted images (lazy loading) */
  storagePath: z.string().optional(),
});
export type ImageAttachment = z.infer<typeof ImageAttachmentSchema>;

export const MessageVariantSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  createdAt: z.number().int(),
  usage: UsageSummarySchema.optional().nullable(),
  attachments: z.array(ImageAttachmentSchema).optional(),
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
  isPinned: z.boolean().default(false).optional(),
  memoryRefs: z.array(z.string()).optional().default([]),
  /** Image attachments for multimodal messages */
  attachments: z.array(ImageAttachmentSchema).optional(),
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


export const ProviderCredentialSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string(),
  label: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  defaultModel: z.string().optional(),
  headers: z.record(z.string()).optional(),
});
export type ProviderCredential = z.infer<typeof ProviderCredentialSchema>;

export const ModelTypeSchema = z.enum(["chat", "multimodel", "imagegeneration", "embedding"]);
export type ModelType = z.infer<typeof ModelTypeSchema>;

export const ModelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  providerId: z.string(),
  providerLabel: z.string().min(1),
  displayName: z.string().min(1),
  createdAt: z.number().int(),
  modelType: ModelTypeSchema.default("chat"),
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
  advancedSettings: z.object({
    summarisationModelId: z.string().optional(),
    creationHelperEnabled: z.boolean().default(false),
    creationHelperModelId: z.string().optional(),
    dynamicMemory: z.object({
      enabled: z.boolean().default(false),
      summaryMessageInterval: z.number().int().min(1).default(20),
      maxEntries: z.number().int().min(1).default(50),
    }).optional(),
  }).optional(),
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
  memoryType: z.enum(["manual", "dynamic"]).default("manual"),
  disableAvatarGradient: z.boolean().default(false).optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  title: z.string(),
  selectedSceneId: z.string().uuid().nullish(), // ID of the scene from character.scenes array
  personaId: z.union([
    z.string().uuid(),
    z.literal(""),
    z.null(),
    z.undefined()
  ]).optional(),
  advancedModelSettings: AdvancedModelSettingsSchema.nullish().optional(),
  memories: z.array(z.string()).default([]),
  memoryEmbeddings: z.array(z.object({
    id: z.string(),
    text: z.string(),
    embedding: z.array(z.number()),
    createdAt: z.number().int(),
    tokenCount: z.number().int().nonnegative().default(0),
  })).default([]).optional(),
  memorySummary: z.string().default("").optional(),
  memorySummaryTokenCount: z.number().default(0),
  memoryToolEvents: z.array(z.object({
    id: z.string(),
    windowStart: z.number().int(),
    windowEnd: z.number().int(),
    summary: z.string(),
    actions: z.array(z.object({
      name: z.string(),
      arguments: z.any().optional(),
      timestamp: z.number().int().optional(),
      updatedMemories: z.array(z.string()).optional(),
    })),
    createdAt: z.number().int(),
  })).default([]).optional(),
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
  avatarPath: z.string().optional(),
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
