import { Redis } from "@upstash/redis";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/api/errors";

const DEFAULT_DAILY_BUDGET = 2_000_000;

function budgetLimit(): number {
  const raw = Number(process.env.ASSISTANT_DAILY_TOKEN_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_BUDGET;
}

let _redis: Redis | null = null;
function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // budget enforcement is a no-op without Redis
  if (!_redis) _redis = new Redis({ url, token });
  return _redis;
}

function dayKey(organizationId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `invoicepilot/assistant/tokens:${organizationId}:${day}`;
}

/** Per-org + per-user request cap: 30 assistant turns / minute. */
export async function checkAssistantRateLimit(organizationId: string, userId: string): Promise<boolean> {
  const res = await checkRateLimit({
    key: `assistant:${organizationId}:${userId}`,
    limit: 30,
    windowMs: 60_000,
  });
  return res.allowed;
}

export async function getDailyTokenUsage(organizationId: string): Promise<number> {
  const r = redis();
  if (!r) return 0;
  const v = await r.get<number>(dayKey(organizationId));
  return Number(v ?? 0);
}

export async function assertTokenBudget(organizationId: string): Promise<void> {
  const used = await getDailyTokenUsage(organizationId);
  if (used >= budgetLimit()) {
    throw new RateLimitError("Daily AI assistant token budget exhausted for this organization");
  }
}

export async function recordTokenUsage(organizationId: string, tokens: number): Promise<void> {
  const r = redis();
  if (!r || tokens <= 0) return;
  const key = dayKey(organizationId);
  await r.incrby(key, tokens);
  await r.expire(key, 60 * 60 * 48);
}
