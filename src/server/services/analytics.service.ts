import { startOfDay, startOfMonth, subDays } from "date-fns";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/utils/currency";
import type { AgingBucketLabel, AgingReport, AgingSide, HeadlineTiles } from "@/types/analytics";

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

  async getAgingReport(organizationId: string, side: AgingSide, asOf: Date = new Date()): Promise<AgingReport> {
    const dayStart = startOfDay(asOf);
    // Table + balance expression are compile-time constants per side — safe with Prisma.raw.
    const table = side === "RECEIVABLE" ? Prisma.raw("invoices") : Prisma.raw("bills");
    const balanceExpr = side === "RECEIVABLE"
      ? Prisma.raw("(COALESCE(total_amount, amount) - amount_paid)")
      : Prisma.raw("(amount - amount_paid)");
    const typeFilter = side === "RECEIVABLE" ? Prisma.sql`AND type = 'RECEIVABLE'` : Prisma.empty;

    const rows = await prisma.$queryRaw<{ bucket: AgingBucketLabel; amount: unknown; count: bigint }[]>(Prisma.sql`
      SELECT
        CASE
          WHEN due_date >= ${dayStart} THEN 'CURRENT'
          WHEN due_date >= ${subDays(dayStart, 30)} THEN '0_30'
          WHEN due_date >= ${subDays(dayStart, 60)} THEN '31_60'
          WHEN due_date >= ${subDays(dayStart, 90)} THEN '61_90'
          ELSE '90_PLUS'
        END AS bucket,
        COALESCE(SUM(${balanceExpr}), 0) AS amount,
        COUNT(*) AS count
      FROM ${table}
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
        AND status <> 'PAID'
        AND ${balanceExpr} > 0
        ${typeFilter}
      GROUP BY 1
    `);

    const labels: AgingBucketLabel[] = ["CURRENT", "0_30", "31_60", "61_90", "90_PLUS"];
    const byLabel = new Map(rows.map((r) => [r.bucket, r]));
    const buckets = labels.map((label) => ({
      label,
      amount: num(byLabel.get(label)?.amount),
      count: Number(byLabel.get(label)?.count ?? 0),
    }));
    const total = buckets.reduce((s, b) => s + b.amount, 0);

    let dso: number | null = null;
    if (side === "RECEIVABLE") {
      const sales = await prisma.$queryRaw<{ sum: unknown }[]>(Prisma.sql`
        SELECT COALESCE(SUM(COALESCE(total_amount, amount)), 0) AS sum
        FROM invoices
        WHERE organization_id = ${organizationId} AND deleted_at IS NULL AND type = 'RECEIVABLE'
          AND created_at > ${subDays(dayStart, 90)} AND created_at <= ${asOf}
      `);
      const trailingSales = num(sales[0]?.sum);
      dso = trailingSales > 0 ? round1((total / trailingSales) * 90) : null;
    }

    return { side, buckets, total, dso };
  },
};
