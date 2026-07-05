import { describe, it, expect, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn().mockResolvedValue({ userId: "clerk-1" }) }));
vi.mock("@/server/services/organization.service", () => ({
  organizationService: {
    ensureUserOrganization: vi.fn().mockResolvedValue({ userId: "u1", organizationId: "org-1" }),
  },
}));
vi.mock("@/server/services/communication.service", () => ({
  communicationService: {
    listForInvoice: vi.fn().mockResolvedValue([
      { id: "c1", channel: "EMAIL", direction: "OUTBOUND", status: "DELIVERED" },
    ]),
  },
}));

import { GET } from "@/app/api/invoices/[id]/communications/route";
import { communicationService } from "@/server/services/communication.service";

describe("GET /api/invoices/:id/communications", () => {
  it("returns the org-scoped communication log for the invoice", async () => {
    const res = await GET(new Request("http://localhost/api/invoices/inv-1/communications"), {
      params: Promise.resolve({ id: "inv-1" }),
    });
    expect(res.status).toBe(200);
    expect(communicationService.listForInvoice).toHaveBeenCalledWith("org-1", "inv-1");
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });
});
