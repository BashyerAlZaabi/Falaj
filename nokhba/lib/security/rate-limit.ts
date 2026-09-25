/**
 * Rate limiting. In-memory sliding window per process — enough for a single
 * instance and for development. For multi-instance deployments swap `store`
 * for a Redis/Upstash-backed implementation with the same interface.
 */
export type RateLimitOptions = { limit: number; windowMs: number };
export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

interface RateLimitStore {
  hit(key: string, opts: RateLimitOptions): RateLimitResult;
}

class MemoryStore implements RateLimitStore {
  private hits = new Map<string, number[]>();
  hit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 50_000) this.hits.clear(); // crude memory guard
    return { ok: list.length <= limit, remaining: Math.max(0, limit - list.length), resetAt: list[0] + windowMs };
  }
}

const globalStore = globalThis as unknown as { __rateLimitStore?: RateLimitStore };
const store: RateLimitStore = globalStore.__rateLimitStore ?? (globalStore.__rateLimitStore = new MemoryStore());

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  return store.hit(key, opts);
}

/** Presets used across API routes. */
export const LIMITS = {
  ai: { limit: 40, windowMs: 60_000 },
  aiHeavy: { limit: 10, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 15 * 60_000 },
  api: { limit: 240, windowMs: 60_000 },
  upload: { limit: 20, windowMs: 60_000 },
} as const;
