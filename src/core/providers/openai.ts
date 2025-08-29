import { httpRequest } from "../http/client";
import { getSecret } from "../secrets";
import type {
  ChatCallbacks,
  ChatParams,
  Provider,
  ProviderConfig,
  Usage,
} from "./types";
import { assertUrlAllowed, sanitizeHeaders } from "./util";

type OpenAIChatResponse = {
  id: string;
  choices: { index: number; message: { role: string; content: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export const OpenAICompatibleProvider: Provider = {
  info: { id: "openai-compatible", name: "OpenAI-Compatible" },

  async listModels(config: ProviderConfig): Promise<string[]> {
    const base = (config.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    try {
      assertUrlAllowed(base + "/v1/models");
      const apiKey = config.apiKeyRef ? await getSecret(config.apiKeyRef) : null;
      const res = await httpRequest<{ data?: { id: string }[] }>(
        {
          url: `${base}/v1/models`,
          method: "GET",
          headers: apiKey ? { Authorization: `Bearer ${mask(apiKey)}` } : {},
          timeoutMs: 15_000,
        },
        undefined,
      );
      const ids = (res.data?.data ?? []).map((m) => m.id);
      return ids.length ? ids : defaultOpenAIModels();
    } catch {
      return defaultOpenAIModels();
    }
  },

  async chat(config: ProviderConfig, params: ChatParams, cbs?: ChatCallbacks) {
    const base = (config.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    assertUrlAllowed(base + "/v1/chat/completions");

    const apiKey = config.apiKeyRef ? await getSecret(config.apiKeyRef) : null;
    if (!apiKey) throw new Error("Missing API key");

    const allowHeaders = ["Authorization", "Content-Type"] as const;
    const headers = sanitizeHeaders(
      {
        Authorization: `Bearer ${mask(apiKey)}`,
        "Content-Type": "application/json",
        ...(config.headers ?? {}),
      },
      Array.from(allowHeaders) as unknown as string[],
    );

    const messages = [
      ...(params.system ? [{ role: "system", content: params.system }] : []),
      ...params.messages,
    ];

    const body = {
      model: params.model,
      messages,
      temperature: params.temperature,
      top_p: params.top_p,
      max_tokens: params.max_tokens,
      stream: !!params.stream,
    };

    let fullText = "";
    const resp = await httpRequest<OpenAIChatResponse>(
      {
        url: `${base}/v1/chat/completions`,
        method: "POST",
        headers,
        body,
        timeoutMs: 120_000,
      },
      undefined,
      params.signal,
    );

    if (params.stream && typeof resp.data === "string") {
      try {
        const streamData = resp.data as string;
        const lines = streamData.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            
            try {
              const chunk = JSON.parse(data);
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                cbs?.onDelta?.(delta);
              }
            } catch (e) {
              continue;
            }
          }
        }
        
        cbs?.onDone?.();
        return { text: fullText };
      } catch (e) {
        const fallbackText = resp.data as string;
        fullText = fallbackText;
        cbs?.onDelta?.(fallbackText);
        cbs?.onDone?.();
        return { text: fullText };
      }
    }

    if (typeof resp.data === "string") {
      try {
        const json = JSON.parse(resp.data) as OpenAIChatResponse;
        const text = json.choices?.[0]?.message?.content ?? "";
        fullText = text;
        cbs?.onDelta?.(text);
        cbs?.onDone?.();
        return { text, usage: mapUsage(json.usage), raw: json };
      } catch {
        fullText = resp.data as unknown as string;
        cbs?.onDelta?.(fullText);
        cbs?.onDone?.();
        return { text: fullText };
      }
    }

    const json = resp.data as OpenAIChatResponse;
    const text = json.choices?.[0]?.message?.content ?? "";
    fullText = text;
    cbs?.onDelta?.(text);
    cbs?.onDone?.();
    return { text, usage: mapUsage(json.usage), raw: json };
  },

  usageFromResponse(raw: unknown): Usage | undefined {
    const u = (raw as any)?.usage;
    return mapUsage(u);
  },
};

function mapUsage(u: any | undefined): Usage | undefined {
  if (!u) return undefined;
  return {
    promptTokens: u.prompt_tokens ?? u.input_tokens,
    completionTokens: u.completion_tokens ?? u.output_tokens,
    totalTokens: u.total_tokens,
  };
}

function defaultOpenAIModels(): string[] {
  return [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1-mini",
    "gpt-4.1",
    "gpt-3.5-turbo",
  ];
}

function mask(s: string) {
  return s;
}
