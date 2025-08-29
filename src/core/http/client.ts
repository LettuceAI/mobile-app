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
  let fetchFn: typeof fetch;
  try {
    const tauriHttp = await import("@tauri-apps/plugin-http");
    fetchFn = tauriHttp.fetch;
  } catch {
    fetchFn = globalThis.fetch;
  }
  let url = req.url;
  if (req.query) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (value !== undefined) {
        queryParams.append(key, String(value));
      }
    }
    const queryString = queryParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const headers: Record<string, string> = {};
  if (req.headers) {
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers[k] = v;
    }
  }

  const method = req.method ?? "POST";

  let body: string | undefined;
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      body = req.body;
    } else {
      body = JSON.stringify(req.body);
      headers['Content-Type'] = 'application/json';
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    body,
    signal,
  };

  try {
    const resp = await fetchFn(url, fetchOptions);

    const allHeaders: Record<string, string> = {};
    resp.headers.forEach((value: string, key: string) => {
      allHeaders[key] = value;
    });

    const ok = resp.ok;
    const status = resp.status;

    const text = await resp.text();

    if (req.stream && onStreamChunk) {
      onStreamChunk(text);
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = text as any;
    }

    if (!ok) {
      throw new HttpError(`HTTP ${status}: ${typeof data === "string" ? data : text}`.slice(0, 4096), status);
    }

    return { status, ok, headers: allHeaders, data } as HttpResponse<T>;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    
    throw new HttpError(`Request failed: ${error instanceof Error ? error.message : String(error)}`, 0);
  }
}
