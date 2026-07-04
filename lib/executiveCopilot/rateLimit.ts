// Simple in-memory rate limit for the ask endpoint, keyed by bearer token. Fine for this
// app's deployment model (a single PM2 process per environment, no clustering) — cheap
// insurance against a client-side bug or accidental spam-clicking running up real LLM
// API cost, not a security control.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

const requestLog = new Map<string, number[]>();

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    requestLog.set(key, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(key, recent);
  return false;
}
