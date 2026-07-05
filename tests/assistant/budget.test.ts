import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, number>();
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async incrby(key: string, n: number) { const v = (store.get(key) ?? 0) + n; store.set(key, v); return v; }
    async get(key: string) { return store.get(key) ?? null; }
    async expire() { return 1; }
  },
}));

describe("token budget", () => {
  beforeEach(() => { store.clear(); process.env.UPSTASH_REDIS_REST_URL = "u"; process.env.UPSTASH_REDIS_REST_TOKEN = "t"; process.env.ASSISTANT_DAILY_TOKEN_BUDGET = "100"; });

  it("assertTokenBudget throws once usage exceeds the cap", async () => {
    const { recordTokenUsage, assertTokenBudget } = await import("@/lib/assistant/budget");
    await recordTokenUsage("org1", 150);
    await expect(assertTokenBudget("org1")).rejects.toThrow();
  });

  it("does not throw while under the cap", async () => {
    const { recordTokenUsage, assertTokenBudget } = await import("@/lib/assistant/budget");
    await recordTokenUsage("org1", 50);
    await expect(assertTokenBudget("org1")).resolves.toBeUndefined();
  });

  it("budgets are per-org isolated", async () => {
    const { recordTokenUsage, getDailyTokenUsage } = await import("@/lib/assistant/budget");
    await recordTokenUsage("orgA", 40);
    await recordTokenUsage("orgB", 10);
    expect(await getDailyTokenUsage("orgA")).toBe(40);
    expect(await getDailyTokenUsage("orgB")).toBe(10);
  });
});
