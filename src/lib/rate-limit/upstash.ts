import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Duration } from "@upstash/ratelimit";
import type { RateLimiter, RateLimitOptions, RateLimitResult } from "@/lib/rate-limit";

/**
 * Redis-backed sliding-window limiter. One Ratelimit instance is created per
 * distinct (limit, window) pair and cached, since each route configures its own.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly redis: Redis;
  private readonly instances = new Map<string, Ratelimit>();

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  private getInstance(limit: number, windowMs: number): Ratelimit {
    const cacheKey = `${limit}:${windowMs}`;
    let instance = this.instances.get(cacheKey);
    if (!instance) {
      instance = new Ratelimit({
        redis: this.redis,
        limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms` as Duration),
        prefix: "invoicepilot/rl",
        analytics: false,
      });
      this.instances.set(cacheKey, instance);
    }
    return instance;
  }

  async check(options: RateLimitOptions): Promise<RateLimitResult> {
    const instance = this.getInstance(options.limit, options.windowMs);
    const { success, remaining, reset } = await instance.limit(options.key);
    return { allowed: success, remaining, resetAt: reset };
  }
}
