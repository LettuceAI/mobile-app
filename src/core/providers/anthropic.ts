import { httpRequest } from "../http/client";
import { getSecret } from "../secrets";
import type { ChatCallbacks, ChatParams, Provider, ProviderConfig, Usage } from "./types";
import { assertUrlAllowed, sanitizeHeaders } from "./util";

type AnthropicMessage = { role: "user" | "assistant" | "system"; content: string };

type AnthropicResp = {
  id: string;
  type: string;
  content: { type: string; text: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

export const AnthropicProvider: Provider = {
  info: { id: "anthropic", name: "Anthropic" },

  async listModels(): Promise<string[]> {
    return [
      "claude-3-5-sonnet-20240620",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
    ];
  },

  async chat(config: ProviderConfig, params: ChatParams, cbs?: ChatCallbacks) {
    const base = (config.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    const url = `${base}/v1/messages`;
    assertUrlAllowed(url);

    const apiKey = config.apiKeyRef ? await getSecret(config.apiKeyRef) : null;
    if (!apiKey) throw new Error("Missing API key");

    const headers = sanitizeHeaders(
      {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      ["x-api-key", "anthropic-version", "Content-Type"],
    );

    const system = params.system ? [{ type: "text", text: params.system }] : undefined;

    const messages: AnthropicMessage[] = params.messages.map((m) => ({
      role: m.role as any,
      content: m.content,
    }));

    const body = {
      model: params.model,
      messages,
      system,
      max_tokens: params.max_tokens ?? 1024,
      temperature: params.temperature,
      top_p: params.top_p,
    } as any;

    const resp = await httpRequest<AnthropicResp>({ url, method: "POST", headers, body }, undefined, params.signal);
    const text = (resp.data.content ?? []).map((c: any) => c.text).join("");
    cbs?.onDelta?.(text);
    cbs?.onDone?.();
    return { text, usage: mapUsage(resp.data.usage), raw: resp.data };
  },

  usageFromResponse(raw?: unknown): Usage | undefined {
    const u = (raw as any)?.usage;
    if (!u) return undefined;
    return { promptTokens: u.input_tokens, completionTokens: u.output_tokens, totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) };
  },
};

function mapUsage(u: any | undefined): Usage | undefined {
  if (!u) return undefined;
  return {
    promptTokens: u.input_tokens,
    completionTokens: u.output_tokens,
    totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
  };
}

