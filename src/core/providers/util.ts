export function assertUrlAllowed(url: string) {
  if (/^https:\/\//i.test(url)) return;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) return;
  throw new Error("Only HTTPS or localhost URLs are allowed");
}

export function sanitizeHeaders(
  headers: Record<string, string | undefined>,
  allowlist: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of allowlist) {
    const v = headers[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

