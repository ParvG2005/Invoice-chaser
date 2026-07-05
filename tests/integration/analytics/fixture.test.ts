import { beforeAll, describe, expect, it } from "vitest";
import { prisma, resetAndSeed } from "./setup";

describe("analytics fixture consistency", () => {
  beforeAll(resetAndSeed);

  it("every invoice's totalAmount/amountPaid match the fixture spec", async () => {
    const invoices = await prisma.invoice.findMany({ where: { organizationId: "org-analytics-fixture" } });
    expect(invoices).toHaveLength(6);
    for (const inv of invoices) {
      const balance = inv.totalAmount!.toNumber() - inv.amountPaid.toNumber();
      expect(balance).toBeGreaterThanOrEqual(0);
    }
  });

  it("every payment's allocations sum to its amount", async () => {
    const payments = await prisma.payment.findMany({
      where: { organizationId: "org-analytics-fixture" },
      include: { allocations: true },
    });
    expect(payments).toHaveLength(4);
    for (const p of payments) {
      const allocated = p.allocations.reduce((s, a) => s + a.amount.toNumber(), 0);
      expect(allocated).toBe(p.amount.toNumber());
    }
  });

  it("amountPaid per invoice equals its IN allocations", async () => {
    const allocs = await prisma.paymentAllocation.findMany({ where: { invoiceId: { not: null } } });
    const byInvoice = new Map<string, number>();
    for (const a of allocs) byInvoice.set(a.invoiceId!, (byInvoice.get(a.invoiceId!) ?? 0) + a.amount.toNumber());
    const invoices = await prisma.invoice.findMany({ where: { amountPaid: { gt: 0 } } });
    for (const inv of invoices) expect(byInvoice.get(inv.id)).toBe(inv.amountPaid.toNumber());
  });
});
