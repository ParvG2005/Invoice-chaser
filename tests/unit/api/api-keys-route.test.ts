import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn().mockResolvedValue({ userId: "clerk-1" }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("@/server/services/organization.service", () => ({
  organizationService: {
    ensureUserOrganization: vi.fn().mockResolvedValue({ userId: "user-1", organizationId: "org-1", role: "admin" }),
  },
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { apiKey: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() } },
}));

import { POST, GET } from "@/app/api/settings/api-keys/route";
import { prisma } from "@/lib/db/prisma";

const rc = { params: Promise.resolve({}) };

describe("api-keys route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST creates a key and returns the raw secret once", async () => {
    vi.mocked(prisma.apiKey.create).mockResolvedValue({ id: "k1", name: "PC", prefix: "oc_live_ab" } as never);
    const res = await POST(
      new Request("http://t/api/settings/api-keys", { method: "POST", body: JSON.stringify({ name: "PC" }) }),
      rc,
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.secret.startsWith("oc_live_")).toBe(true);
    expect(json.data.apiKey.id).toBe("k1");
  });

  it("GET lists keys for the org", async () => {
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([{ id: "k1" }] as never);
    const res = await GET(new Request("http://t/api/settings/api-keys"), rc);
    expect(res.status).toBe(200);
    expect((await res.json()).data.apiKeys).toHaveLength(1);
  });
});
