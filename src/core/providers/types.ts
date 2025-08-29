export type Role = "system" | "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

export type ChatParams = {
  model: string;
  messages: Message[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  system?: string;
  stream?: boolean;
  signal?: AbortSignal;
};

export type Usage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ChatCallbacks = {
  onDelta?: (text: string) => void;
  onDone?: () => void;
};

export type ProviderInfo = {
  id: string;
  name: string;
};

export interface Provider {
  info: ProviderInfo;
  listModels(config: ProviderConfig): Promise<string[]>;
  chat(
    config: ProviderConfig,
    params: ChatParams,
    cbs?: ChatCallbacks,
  ): Promise<{ text: string; usage?: Usage; raw?: unknown }>;
  usageFromResponse?(raw: unknown): Usage | undefined;
}

export type ProviderConfig = {
  baseUrl?: string; 
  apiKeyRef?: SecretRef; 
  defaultModel?: string;
  headers?: Record<string, string>; 
  modelMap?: Record<string, string>;
};

export type SecretRef = {
  providerId: string;
  key: string; 
  credId?: string;
};
