import { describe, it, expect, vi } from "vitest";
import { withApiHandler } from "@/lib/api/handler";
import { organizationService } from "@/server/services/organization.service";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "clerk-1" }),
}));

vi.mock("@/server/services/organization.service", () => ({
  organizationService: { ensureUserOrganization: vi.fn() },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

function membership(role: string) {
  return { userId: "user-1", organizationId: "org-1", organization: { id: "org-1" }, role };
}

const routeContext = { params: Promise.resolve({}) };

describe("withApiHandler requiredRole", () => {
  it("returns 403 when the member's role is below requiredRole", async () => {
    vi.mocked(organizationService.ensureUserOrganization).mockResolvedValue(
      membership("viewer") as never,
    );
    const handler = withApiHandler(async () => new Response("ok"), { requiredRole: "member" });
    const response = await handler(new Request("http://test/api/x"), routeContext);
    expect(response.status).toBe(403);
  });

  it("passes and exposes ctx.role when the role is sufficient", async () => {
    vi.mocked(organizationService.ensureUserOrganization).mockResolvedValue(
      membership("admin") as never,
    );
    const handler = withApiHandler(
      async (_request, ctx) => new Response(ctx.role),
      { requiredRole: "member" },
    );
    const response = await handler(new Request("http://test/api/x"), routeContext);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("admin");
  });
});
