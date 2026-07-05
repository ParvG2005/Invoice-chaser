import { startOfDay, startOfMonth } from "date-fns";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/utils/currency";
import type { HeadlineTiles } from "@/types/analytics";

// Deviation from the Phase 5 plan's assumed schema: Invoice/Bill have no
// distinct `issueDate`/`balanceDue` columns (see prisma/schema.prisma).
// `createdAt` stands in for issue date everywhere below (the fixture sets
// it explicitly rather than relying on `@default(now())`). Balance is
// computed in SQL: `COALESCE(total_amount, amount) - amount_paid` for
// invoices, `amount - amount_paid` for bills.

const num = (v: unknown): number => (v == null ? 0 : decimalToNumber(v as never));
export const round1 = (n: number): number => Math.round(n * 10) / 10;
export const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export const analyticsService = {
  async getHeadlineTiles(organizationId: string, asOf: Date = new Date()): Promise<HeadlineTiles> {
    const dayStart = startOfDay(asOf);
    const monthStart = startOfMonth(asOf);

    const [recv, pay, overdue, collected] = await Promise.all([
      prisma.$queryRaw<{ sum: unknown; count: bigint }[]>(Prisma.sql`
        SELECT COALESCE(SUM(COALESCE(total_amount, amount) - amount_paid), 0) AS sum, COUNT(*) AS count
        FROM invoices
        WHERE organization_id = ${organizationId} AND deleted_at IS NULL AND type = 'RECEIVABLE'
          AND status <> 'PAID' AND (COALESCE(total_amount, amount) - amount_paid) > 0
      `),
      prisma.$queryRaw<{ sum: unknown }[]>(Prisma.sql`
        SELECT COALESCE(SUM(amount - amount_paid), 0) AS sum
        FROM bills
        WHERE organization_id = ${organizationId} AND deleted_at IS NULL
          AND status <> 'PAID' AND (amount - amount_paid) > 0
      `),
      prisma.$queryRaw<{ sum: unknown }[]>(Prisma.sql`
        SELECT COALESCE(SUM(COALESCE(total_amount, amount) - amount_paid), 0) AS sum
        FROM invoices
        WHERE organization_id = ${organizationId} AND deleted_at IS NULL AND type = 'RECEIVABLE'
          AND status <> 'PAID' AND (COALESCE(total_amount, amount) - amount_paid) > 0
          AND due_date < ${dayStart}
      `),
      prisma.payment.aggregate({
        where: { organizationId, deletedAt: null, direction: "IN", paymentDate: { gte: monthStart, lte: asOf } },
        _sum: { amount: true },
      }),
    ]);

    return {
      moneyToCome: num(recv[0]?.sum),
      moneyToPay: num(pay[0]?.sum),
      pendingInvoices: { count: Number(recv[0]?.count ?? 0), value: num(recv[0]?.sum) },
      overdueValue: num(overdue[0]?.sum),
      collectedThisMonth: num(collected._sum.amount),
    };
  },
};
