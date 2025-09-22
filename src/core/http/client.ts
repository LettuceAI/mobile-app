import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpRequest = {
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  timeoutMs?: number;
  stream?: boolean;
};

export type HttpResponse<T = unknown> = {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  data: T;
};

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type StreamHandler = (chunk: string) => void;

export async function httpRequest<T = unknown>(
  req: HttpRequest,
  onStreamChunk?: StreamHandler,
  signal?: AbortSignal,
): Promise<HttpResponse<T>> {
  if (signal?.aborted) {
    throw new HttpError("Request aborted", 0);
  }

  let unlisten: (() => void) | undefined;
  let requestId: string | undefined;

  try {
    if (req.stream && onStreamChunk) {
      requestId = crypto.randomUUID();
      const eventName = `api://${requestId}`;
      const listener = await listen<string>(eventName, (event) => {
        onStreamChunk(event.payload);
      });
      unlisten = () => listener();
    }

    const response = await invoke<HttpResponse<T>>("api_request", {
      req: {
        ...req,
        requestId,
      },
    });

    if (!response.ok) {
      const message = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      throw new HttpError(`HTTP ${response.status}: ${message}`.slice(0, 4096), response.status);
    }

    return response;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpError(`Request failed: ${message}`, 0);
  } finally {
    if (unlisten) {
      unlisten();
    }
  }
}
