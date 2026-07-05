import { addDays, differenceInCalendarDays, format, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/utils/currency";
import type {
  AgentLeaderboardRow, AgingBucketLabel, AgingReport, AgingSide, CashflowProjection, CashflowWeek,
  CollectionTrendPoint, HeadlineTiles, PartyAnalytics, PartyAnalyticsRow, PartyRiskFlag,
} from "@/types/analytics";

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

  async getCollectionTrend(organizationId: string, asOf: Date = new Date()): Promise<CollectionTrendPoint[]> {
    const windowStart = startOfMonth(subMonths(asOf, 5));

    const [invoicedRows, collectedRows] = await Promise.all([
      prisma.$queryRaw<{ month: string; total: unknown }[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               SUM(COALESCE(total_amount, amount)) AS total
        FROM invoices
        WHERE organization_id = ${organizationId} AND deleted_at IS NULL
          AND type = 'RECEIVABLE'
          AND created_at >= ${windowStart} AND created_at <= ${asOf}
        GROUP BY 1
      `),
      prisma.$queryRaw<{ month: string; total: unknown }[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month,
               SUM(amount) AS total
        FROM payments
        WHERE organization_id = ${organizationId} AND deleted_at IS NULL
          AND direction = 'IN'
          AND payment_date >= ${windowStart} AND payment_date <= ${asOf}
        GROUP BY 1
      `),
    ]);

    const invoicedBy = new Map(invoicedRows.map((r) => [r.month, num(r.total)]));
    const collectedBy = new Map(collectedRows.map((r) => [r.month, num(r.total)]));

    return Array.from({ length: 6 }, (_, i) => {
      const month = format(subMonths(asOf, 5 - i), "yyyy-MM");
      const invoiced = invoicedBy.get(month) ?? 0;
      const collected = collectedBy.get(month) ?? 0;
      return { month, invoiced, collected, rate: invoiced > 0 ? round4(collected / invoiced) : null };
    });
  },

  async getCashflowProjection(organizationId: string, asOf: Date = new Date()): Promise<CashflowProjection> {
    const dayStart = startOfDay(asOf);
    const WEEKS = 8;

    const [receivables, payables] = await Promise.all([
      prisma.invoice.findMany({
        where: { organizationId, deletedAt: null, type: "RECEIVABLE", status: { not: "PAID" } },
        select: { dueDate: true, totalAmount: true, amount: true, amountPaid: true },
      }),
      prisma.bill.findMany({
        where: { organizationId, deletedAt: null, status: { not: "PAID" } },
        select: { dueDate: true, amount: true, amountPaid: true },
      }),
    ]);

    const overdue = { inflow: 0, outflow: 0 };
    const weeks: CashflowWeek[] = Array.from({ length: WEEKS }, (_, i) => ({
      weekStart: format(addDays(dayStart, i * 7), "yyyy-MM-dd"),
      inflow: 0, outflow: 0, net: 0,
    }));

    const place = (dueDate: Date, amount: number, key: "inflow" | "outflow") => {
      if (amount <= 0) return;
      const days = differenceInCalendarDays(dueDate, dayStart);
      if (days < 0) overdue[key] += amount;
      else if (days < WEEKS * 7) weeks[Math.floor(days / 7)][key] += amount;
      // due dates beyond the horizon are omitted by design
    };

    for (const r of receivables) place(r.dueDate, num(r.totalAmount ?? r.amount) - num(r.amountPaid), "inflow");
    for (const b of payables) place(b.dueDate, num(b.amount) - num(b.amountPaid), "outflow");
    for (const w of weeks) w.net = w.inflow - w.outflow;

    return { overdue, weeks };
  },

  async getPartyAnalytics(organizationId: string, _asOf: Date = new Date()): Promise<PartyAnalytics> {
    const [parties, recvRows, payRows, paidInvoices, collectedByParty] = await Promise.all([
      prisma.party.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true, type: true, creditLimit: true, agentId: true },
      }),
      prisma.$queryRaw<{ party_id: string; sum: unknown }[]>(Prisma.sql`
        SELECT party_id, COALESCE(SUM(COALESCE(total_amount, amount) - amount_paid), 0) AS sum
        FROM invoices
        WHERE organization_id = ${organizationId} AND deleted_at IS NULL AND type = 'RECEIVABLE'
          AND status <> 'PAID' AND (COALESCE(total_amount, amount) - amount_paid) > 0 AND party_id IS NOT NULL
        GROUP BY party_id
      `),
      prisma.$queryRaw<{ party_id: string; sum: unknown }[]>(Prisma.sql`
        SELECT party_id, COALESCE(SUM(amount - amount_paid), 0) AS sum
        FROM bills
        WHERE organization_id = ${organizationId} AND deleted_at IS NULL
          AND status <> 'PAID' AND (amount - amount_paid) > 0
        GROUP BY party_id
      `),
      prisma.invoice.findMany({
        where: { organizationId, deletedAt: null, type: "RECEIVABLE", status: "PAID", paidAt: { not: null }, partyId: { not: null } },
        select: { partyId: true, createdAt: true, dueDate: true, paidAt: true },
      }),
      prisma.payment.groupBy({
        by: ["partyId"],
        where: { organizationId, deletedAt: null, direction: "IN" },
        _sum: { amount: true },
      }),
    ]);

    const recvBy = new Map(recvRows.map((r) => [r.party_id, num(r.sum)]));
    const payBy = new Map(payRows.map((r) => [r.party_id, num(r.sum)]));
    const collectedBy = new Map(collectedByParty.map((r) => [r.partyId, num(r._sum.amount)]));

    const behavior = new Map<string, { paidCount: number; totalDays: number; onTime: number }>();
    for (const inv of paidInvoices) {
      const partyId = inv.partyId!;
      const b = behavior.get(partyId) ?? { paidCount: 0, totalDays: 0, onTime: 0 };
      b.paidCount += 1;
      b.totalDays += differenceInCalendarDays(inv.paidAt!, inv.createdAt);
      if (differenceInCalendarDays(inv.paidAt!, inv.dueDate) <= 0) b.onTime += 1;
      behavior.set(partyId, b);
    }

    const rows: PartyAnalyticsRow[] = parties
      .filter((p) => p.type !== "AGENT")
      .map((p) => {
        const receivableExposure = recvBy.get(p.id) ?? 0;
        const creditLimit = p.creditLimit == null ? null : num(p.creditLimit);
        const b = behavior.get(p.id);
        const onTimePct = b ? round1((b.onTime / b.paidCount) * 100) : null;
        const riskFlags: PartyRiskFlag[] = [];
        if (creditLimit != null && receivableExposure > creditLimit) riskFlags.push("OVER_CREDIT_LIMIT");
        if (b && b.paidCount >= 2 && onTimePct != null && onTimePct < 50) riskFlags.push("HABITUAL_LATE");
        return {
          partyId: p.id, partyName: p.name, partyType: p.type,
          receivableExposure, payableExposure: payBy.get(p.id) ?? 0,
          creditLimit,
          avgDaysToPay: b ? round1(b.totalDays / b.paidCount) : null,
          onTimePct, riskFlags,
        };
      })
      .sort((a, b) => b.receivableExposure - a.receivableExposure);

    const agents: AgentLeaderboardRow[] = parties
      .filter((p) => p.type === "AGENT")
      .map((agent) => {
        const managed = parties.filter((p) => p.agentId === agent.id);
        return {
          agentId: agent.id, agentName: agent.name,
          collected: managed.reduce((s, p) => s + (collectedBy.get(p.id) ?? 0), 0),
          outstanding: managed.reduce((s, p) => s + (recvBy.get(p.id) ?? 0), 0),
          managedParties: managed.length,
        };
      })
      .sort((a, b) => b.collected - a.collected);

    return { parties: rows, agents };
  },
};
