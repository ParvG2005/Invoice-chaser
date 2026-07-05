/**
 * EXPLAIN checks for the app's actual hot-path query shapes (invoice list,
 * dashboard tiles, aging buckets, party ledger — see
 * src/server/repositories/invoice.repository.ts, dashboard.service.ts,
 * analytics.service.ts) at 10k invoices / 1k parties.
 *
 * Run AFTER scripts/seed-volume.ts, against the same DB.
 * Run: npm run explain:check
 */
import { prisma } from "../src/lib/db/prisma";

type Check = { name: string; sql: string; maxMs: number };

// $1 substituted below with the volume org id.
const CHECKS: Check[] = [
  {
    // Invoice list page (invoice.repository.ts#findMany): org-scoped,
    // status-filtered, due-date sorted, paginated.
    name: "invoice-list",
    sql: `SELECT * FROM invoices
          WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'OVERDUE'
          ORDER BY due_date ASC LIMIT 50`,
    maxMs: 50,
  },
  {
    // Dashboard headline tiles (dashboard.service.ts#getStats).
    name: "dashboard-tiles",
    sql: `SELECT status, count(*), sum(amount)
          FROM invoices
          WHERE organization_id = $1 AND deleted_at IS NULL
          GROUP BY status`,
    maxMs: 100,
  },
  {
    // Aging buckets (analytics.service.ts#getAgingReport).
    name: "aging-buckets",
    sql: `SELECT
            CASE
              WHEN due_date >= now() THEN 'CURRENT'
              WHEN due_date >= now() - interval '30 days' THEN '0_30'
              WHEN due_date >= now() - interval '60 days' THEN '31_60'
              WHEN due_date >= now() - interval '90 days' THEN '61_90'
              ELSE '90_PLUS'
            END AS bucket,
            count(*), sum(COALESCE(total_amount, amount) - amount_paid)
          FROM invoices
          WHERE organization_id = $1 AND deleted_at IS NULL AND status != 'PAID'
          GROUP BY 1`,
    maxMs: 100,
  },
  {
    // Party ledger drill-down.
    name: "party-invoices",
    sql: `SELECT * FROM invoices
          WHERE organization_id = $1 AND party_id = (
            SELECT id FROM parties WHERE organization_id = $1 LIMIT 1)
          ORDER BY due_date DESC LIMIT 50`,
    maxMs: 50,
  },
];

function hasSeqScanOnInvoices(node: Record<string, unknown>): boolean {
  if (node["Node Type"] === "Seq Scan" && node["Relation Name"] === "invoices") return true;
  const children = (node["Plans"] as Record<string, unknown>[]) ?? [];
  return children.some(hasSeqScanOnInvoices);
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: "volume-test-org" },
  });
  let failed = false;
  for (const check of CHECKS) {
    const sql = check.sql.replaceAll("$1", `'${org.id}'`);
    const rows = await prisma.$queryRawUnsafe<{ "QUERY PLAN": unknown }[]>(
      `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`,
    );
    const plan = (rows[0]["QUERY PLAN"] as Record<string, unknown>[])[0];
    const root = plan["Plan"] as Record<string, unknown>;
    const ms = plan["Execution Time"] as number;
    const seq = hasSeqScanOnInvoices(root);
    const ok = !seq && ms <= check.maxMs;
    console.log(`${ok ? "PASS" : "FAIL"} ${check.name}: ${ms.toFixed(1)}ms, seqScanOnInvoices=${seq}`);
    if (!ok) failed = true;
  }
  if (failed) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
