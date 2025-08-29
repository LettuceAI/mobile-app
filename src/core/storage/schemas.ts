import { z } from "zod";

export const MessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  createdAt: z.number().int(),
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
  displayName: z.string().min(1),
  createdAt: z.number().int(),
});
export type Model = z.infer<typeof ModelSchema>;

export const SettingsSchema = z.object({
  $version: z.literal(1),
  defaultProviderCredentialId: z.string().uuid().nullable(),
  defaultModelId: z.string().uuid().nullable(),
  providerCredentials: z.array(ProviderCredentialSchema),
  models: z.array(ModelSchema),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  avatarPath: z.string().optional(),
  persona: z.string().optional(),
  style: z.string().optional(),
  boundaries: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  title: z.string(),
  systemPrompt: z.string().optional(),
  messages: z.array(MessageSchema),
  archived: z.boolean().default(false),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Session = z.infer<typeof SessionSchema>;
