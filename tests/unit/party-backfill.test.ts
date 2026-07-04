import { describe, it, expect } from "vitest";
import { groupInvoicesForBackfill } from "@/lib/import/party-backfill";

describe("groupInvoicesForBackfill", () => {
  it("groups case-insensitively and trims, keeping the first-seen display name", () => {
    const groups = groupInvoicesForBackfill([
      { id: "1", clientName: "Acme Traders", clientEmail: "a@acme.test", clientPhone: null },
      { id: "2", clientName: "  acme traders ", clientEmail: null, clientPhone: "+911234" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({
      name: "Acme Traders",
      email: "a@acme.test",
      phone: "+911234",
      invoiceIds: ["1", "2"],
    });
  });

  it("takes the first non-empty email and phone per group", () => {
    const groups = groupInvoicesForBackfill([
      { id: "1", clientName: "Beta", clientEmail: "", clientPhone: null },
      { id: "2", clientName: "Beta", clientEmail: "b@beta.test", clientPhone: "+91999" },
      { id: "3", clientName: "Beta", clientEmail: "other@beta.test", clientPhone: "+91000" },
    ]);
    expect(groups[0].email).toBe("b@beta.test");
    expect(groups[0].phone).toBe("+91999");
  });

  it("skips invoices with a blank clientName", () => {
    expect(
      groupInvoicesForBackfill([
        { id: "1", clientName: "   ", clientEmail: null, clientPhone: null },
      ]),
    ).toHaveLength(0);
  });

  it("produces separate groups for distinct names", () => {
    const groups = groupInvoicesForBackfill([
      { id: "1", clientName: "A", clientEmail: null, clientPhone: null },
      { id: "2", clientName: "B", clientEmail: null, clientPhone: null },
    ]);
    expect(groups.map((g) => g.name).sort()).toEqual(["A", "B"]);
  });
});
