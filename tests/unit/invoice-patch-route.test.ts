import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/invoices/[id]/route";
import { invoiceService } from "@/server/services/invoice.service";
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

vi.mock("@/server/services/invoice.service", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/invoice.service")>(
    "@/server/services/invoice.service",
  );
  return {
    ...actual,
    invoiceService: { update: vi.fn() },
  };
});

const routeContext = { params: Promise.resolve({ id: "inv-1" }) };

function patchRequest(body: unknown) {
  return new Request("http://test/api/invoices/inv-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/invoices/[id] — line item clearing (review fix)", () => {
  beforeEach(() => {
    vi.mocked(organizationService.ensureUserOrganization).mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      organization: { id: "org-1" },
      role: "member",
    } as never);
    vi.mocked(invoiceService.update).mockResolvedValue({ id: "inv-1" } as never);
  });

  it("zeroes out subtotal/tax/total and forwards an empty line-items array when lineItems: [] is sent explicitly", async () => {
    await PATCH(patchRequest({ lineItems: [] }), routeContext);

    expect(invoiceService.update).toHaveBeenCalledWith(
      "org-1",
      "inv-1",
      expect.objectContaining({
        lineItems: [],
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        amount: 0,
      }),
    );
  });

  it("leaves existing line items/amounts untouched when lineItems is omitted entirely", async () => {
    await PATCH(patchRequest({ clientName: "Updated Co" }), routeContext);

    const [, , updateArg] = vi.mocked(invoiceService.update).mock.calls[0];
    expect(updateArg).not.toHaveProperty("lineItems");
    expect(updateArg).not.toHaveProperty("subtotal");
    expect(updateArg).not.toHaveProperty("taxAmount");
    expect(updateArg).not.toHaveProperty("totalAmount");
    expect(updateArg).toMatchObject({ clientName: "Updated Co" });
  });
});
