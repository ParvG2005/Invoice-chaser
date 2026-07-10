import { describe, it, expect, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn().mockResolvedValue({ userId: null }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { apiKey: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) } },
}));

import { withApiHandler } from "@/lib/api/handler";
import { prisma } from "@/lib/db/prisma";
import { hashApiKey } from "@/lib/auth/api-key";

const routeContext = { params: Promise.resolve({}) };

describe("withApiHandler API-key auth", () => {
  it("authenticates a valid bearer key and sets org context", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "k1", organizationId: "org-9", createdByUserId: "user-9", revokedAt: null,
    } as never);
    const handler = withApiHandler(async (_r, ctx) => new Response(ctx.organizationId), {
      requiredRole: "member",
    });
    const res = await handler(
      new Request("http://test/api/import/tally", { headers: { authorization: "Bearer oc_live_x" } }),
      routeContext,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("org-9");
    expect(prisma.apiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hashedKey: hashApiKey("oc_live_x"), revokedAt: null } }),
    );
  });

  it("rejects an unknown/revoked key with 401", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null as never);
    const handler = withApiHandler(async () => new Response("ok"));
    const res = await handler(
      new Request("http://test/api/import/tally", { headers: { authorization: "Bearer bad" } }),
      routeContext,
    );
    expect(res.status).toBe(401);
  });
});
