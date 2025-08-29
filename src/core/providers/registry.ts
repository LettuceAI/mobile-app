import { AnthropicProvider } from "./anthropic";
import { CustomJsonProvider } from "./custom";
import { OpenAICompatibleProvider } from "./openai";
import type { Provider, ProviderConfig } from "./types";

export type RegisteredProvider = {
  id: string;
  name: string;
  make: () => Provider;
  defaults?: Partial<ProviderConfig>;
};

export const providerRegistry: RegisteredProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    make: () => OpenAICompatibleProvider,
    defaults: { baseUrl: "https://api.openai.com" },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    make: () => AnthropicProvider,
    defaults: { baseUrl: "https://api.anthropic.com" },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    make: () => OpenAICompatibleProvider,
    defaults: { baseUrl: "https://openrouter.ai/api" },
  },
  {
    id: "openai-compatible",
    name: "OpenAI-Compatible",
    make: () => OpenAICompatibleProvider,
  },
  {
    id: "custom-json",
    name: "Custom HTTP (JSON)",
    make: () => CustomJsonProvider,
  },
];

export function getProvider(id: string): RegisteredProvider | undefined {
  return providerRegistry.find((p) => p.id === id);
}

