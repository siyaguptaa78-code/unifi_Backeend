/**
 * Simple fixed-window in-memory rate limiter. Suitable for a single Node instance;
 * for horizontal scaling replace the store with Redis (documented in SETUP.md).
 */
type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { __rl?: Map<string, Bucket> };
const store: Map<string, Bucket> = g.__rl ?? new Map();
g.__rl = store;

export function rateLimit(key: string, limit: number, windowMs: number) {
  if (process.env.DISABLE_RATE_LIMIT === "true") return { allowed: true, remaining: limit };
  const now = Date.now();
  const b = store.get(key);
  if (!b || b.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    if (store.size > 10000) for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
    return { allowed: true, remaining: limit - 1 };
  }
  b.count += 1;
  return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count) };
}

