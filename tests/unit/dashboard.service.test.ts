import { describe, it, expect, vi } from "vitest";
import { dashboardService } from "@/server/services/dashboard.service";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    invoice: {
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async () => []),
    },
    bill: {
      groupBy: vi.fn(async () => [
        { status: "PENDING", _sum: { amount: 74500, amountPaid: 0 } },
        { status: "PARTIALLY_PAID", _sum: { amount: 20000, amountPaid: 5000 } },
        { status: "PAID", _sum: { amount: 62000, amountPaid: 62000 } },
      ]),
    },
    reminder: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
    },
    emailLog: {
      count: vi.fn(async () => 0),
    },
  },
}));

const ORG = "org-1";

describe("dashboardService.getStats — moneyToPay", () => {
  it("sums outstanding (amount - amountPaid) across non-PAID, non-WRITTEN_OFF bills", async () => {
    const stats = await dashboardService.getStats(ORG);
    // (74500 - 0) + (20000 - 5000) = 89500; the PAID bill contributes nothing.
    expect(stats.moneyToPay).toBe("89500");
  });
});
