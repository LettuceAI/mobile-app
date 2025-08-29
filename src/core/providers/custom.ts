import { httpRequest } from "../http/client";
import type { ChatCallbacks, ChatParams, Provider, ProviderConfig } from "./types";
import { assertUrlAllowed, sanitizeHeaders } from "./util";

// Request: { prompt, system?, model?, temperature?, max_tokens? }
// Response: { completion: string }
export const CustomJsonProvider: Provider = {
  info: { id: "custom-json", name: "Custom HTTP (JSON)" },

  async listModels(config: ProviderConfig): Promise<string[]> {
    return config.defaultModel ? [config.defaultModel] : ["default"];
  },

  async chat(config: ProviderConfig, params: ChatParams, cbs?: ChatCallbacks) {
    const base = (config.baseUrl ?? "").replace(/\/$/, "");
    if (!base) throw new Error("Custom base URL required");
    assertUrlAllowed(base);

    const headers = sanitizeHeaders(
      { "Content-Type": "application/json", ...(config.headers ?? {}) },
      ["Content-Type", ...(config.headers ? Object.keys(config.headers) : [])],
    );

    const body = {
      model: params.model,
      system: params.system,
      prompt: params.messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
      temperature: params.temperature,
      max_tokens: params.max_tokens,
    };

    const resp = await httpRequest<{ completion?: string; text?: string; message?: string }>(
      { url: base, method: "POST", headers, body, timeoutMs: 120_000 },
      undefined,
      params.signal,
    );
    const text = resp.data.completion ?? resp.data.text ?? resp.data.message ?? "";
    cbs?.onDelta?.(text);
    cbs?.onDone?.();
    return { text, raw: resp.data };
  },
};

