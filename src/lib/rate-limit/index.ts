/**
 * Rate limiting with a pluggable backend.
 *
 * - In production (multi-instance / serverless), set UPSTASH_REDIS_REST_URL and
 *   UPSTASH_REDIS_REST_TOKEN and limits are enforced globally via Redis.
 * - Otherwise it falls back to an in-process fixed-window limiter. That fallback
 *   is per-instance, so on Vercel the effective limit is `limit * instanceCount`.
 */
import { createLogger } from "@/lib/logger";
import { UpstashRateLimiter } from "@/lib/rate-limit/upstash";

const log = createLogger("rate-limit");

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimiter {
  check(options: RateLimitOptions): Promise<RateLimitResult>;
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Bound the number of tracked keys so a flood of unique keys (e.g. spoofed IPs)
// cannot grow the map without limit.
const MAX_ENTRIES = 50_000;
const SWEEP_INTERVAL_MS = 60_000;

class InMemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();
  private lastSweepAt = 0;

  /** Remove all expired entries. Cheap because entries are short-lived. */
  private sweep(now: number): void {
    if (now - this.lastSweepAt < SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = now;
    for (const [key, entry] of this.store) {
      if (entry.resetAt <= now) this.store.delete(key);
    }
    // Hard backstop: if still over capacity, drop the oldest-resetting entries.
    if (this.store.size > MAX_ENTRIES) {
      const sorted = [...this.store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
      const toRemove = this.store.size - MAX_ENTRIES;
      for (let i = 0; i < toRemove; i += 1) this.store.delete(sorted[i][0]);
    }
  }

  async check(options: RateLimitOptions): Promise<RateLimitResult> {
    const now = Date.now();
    this.sweep(now);

    const existing = this.store.get(options.key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + options.windowMs;
      this.store.set(options.key, { count: 1, resetAt });
      return { allowed: true, remaining: options.limit - 1, resetAt };
    }

    if (existing.count >= options.limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: options.limit - existing.count,
      resetAt: existing.resetAt,
    };
  }
}

// ---------------------------------------------------------------------------
// Backend selection (lazy, memoized)
// ---------------------------------------------------------------------------

let limiter: RateLimiter | null = null;

function createDefaultLimiter(): RateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      log.info("Using Upstash Redis rate limiter");
      return new UpstashRateLimiter(url, token);
    } catch (error) {
      log.error("Failed to init Upstash limiter, falling back to in-memory", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return new InMemoryRateLimiter();
}

function getLimiter(): RateLimiter {
  if (!limiter) limiter = createDefaultLimiter();
  return limiter;
}

/** Override the limiter implementation (e.g. in tests). */
export function setRateLimiter(custom: RateLimiter): void {
  limiter = custom;
}

export function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  return getLimiter().check(options);
}
