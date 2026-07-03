# Phase 5: Analytics & Trackers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent plan:** `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (read its Phase 5 section and §0.1 decision 7 before starting).
>
> **REQUIRED SUB-SKILL for chart tasks:** Any task that writes chart/tile/dashboard code (Task 10) must read the `dataviz` skill **before** writing the first line of chart code. This is non-negotiable — the skill supplies the palette, mark specs, and layout rules the components below must follow.

**Goal:** Live, accurate analytics — headline money tiles, receivable/payable aging + DSO + collection trend + cash-flow projection, party/agent analytics with risk flags, and stock analytics with a daily low-stock alert job — all backed by SQL aggregates in a tested `analytics.service`, cached with a short TTL, and charted with Recharts.

**Architecture:** New `src/server/services/analytics.service.ts` (SQL aggregates via Prisma `aggregate`/`groupBy` + `$queryRaw`, all org-scoped, every method deterministic given an `asOf` date) → thin cached API routes under `/api/analytics/*` (`unstable_cache`, 60 s TTL, per-org tags) → client components in `src/modules/analytics/` using TanStack Query + Recharts. Low-stock alerts run as an Inngest daily cron that fans out per org (same pattern as the existing `reminder-scan`). Follows the existing layering: `app/api` route → `lib/api/handler` → `server/services` → Prisma.

**Tech Stack:** Next.js App Router (`unstable_cache`), Prisma (`aggregate`, `groupBy`, `$queryRaw`), date-fns, Recharts (already a dependency), Inngest, Vitest integration tests against a disposable Postgres, Playwright smoke test.

## Global Constraints

(Verbatim from the parent plan — every task's requirements implicitly include these.)

- Version floors: Node >= 26 (LTS), Next.js >= 16.2, React >= 19.2, TypeScript >= 6.0, Prisma >= 7.8, Tailwind >= 4.3. Pin Node via `.nvmrc`/`engines`; keep dependencies on latest stable at each phase start.
- Multi-tenant: every new table carries `organization_id`; every query is org-scoped at the repository layer. No cross-org data access, ever.
- All money columns `Decimal(12,2)`; all quantities `Decimal(12,3)`; currency INR-first but stored with a `currency` code.
- Soft deletes (`deleted_at`) on all business entities, matching existing convention.
- All writes performed by the AI assistant require explicit user approval (see Phase 7 guardrails) — no silent mutations.
- Existing layered convention preserved: `app/api` route → `lib/api/handler` → `server/services` → `server/repositories` → Prisma.
- Secrets only in env vars / provider credential stores; never in code, prompts, or logs.
- TDD for all service/parser/tool code; Playwright smoke tests for each new page.
- After code changes, run `graphify update .` (per CLAUDE.md) — **note:** the Phase 0 plan recorded that `graphify-out/` was removed from the repo on 2026-07-03 and the CLAUDE.md section is stale; skip this step if the CLI/graph is absent and note it in the commit.

## Cross-Phase Interface Contract

Written in parallel with the Phase 1–4 and Phase 6 plans — **use verbatim, do not rename:**

- Models per master plan §0.3: `Party` (`creditLimit`, `creditDays`, `agentId` self-relation), `Item`, `StockMovement`, `InvoiceLineItem`, `Bill`, `Payment`, `PaymentAllocation`; `Invoice` has `type` RECEIVABLE/PAYABLE, `partyId`, `totalAmount`, `amountPaid`, `balanceDue`.
- **This phase produces `src/server/services/analytics.service.ts`** with exactly these exported methods (Phase 6's `get_analytics` assistant tool calls them):
  - `getHeadlineTiles(organizationId: string, asOf?: Date): Promise<HeadlineTiles>`
  - `getAgingReport(organizationId: string, side: AgingSide, asOf?: Date): Promise<AgingReport>` (includes DSO for the RECEIVABLE side)
  - `getCollectionTrend(organizationId: string, asOf?: Date): Promise<CollectionTrendPoint[]>`
  - `getCashflowProjection(organizationId: string, asOf?: Date): Promise<CashflowProjection>`
  - `getPartyAnalytics(organizationId: string, asOf?: Date): Promise<PartyAnalytics>`
  - `getStockAnalytics(organizationId: string, asOf?: Date): Promise<StockAnalytics>`
- All money `Decimal(12,2)`, quantities `Decimal(12,3)`. Every method takes `organizationId: string` first; all queries org-scoped. Return types use plain `number` (converted via the existing `decimalToNumber` helper) so results are JSON-serializable for `unstable_cache` and the assistant tool.

**Consumes (Phase 1/2 schema — assumed Prisma field names / mapped columns).** The plan's code uses these names; Phase 1 owns the schema, so if it landed a different name, fix it in *one* place per name (the seed fixture + the raw SQL in `analytics.service.ts` — grep for the column):

| Prisma model.field | Mapped column (table) | Notes |
|---|---|---|
| `Invoice.type` (`RECEIVABLE`\|`PAYABLE`), `.partyId`, `.issueDate`, `.dueDate`, `.totalAmount`, `.amountPaid`, `.balanceDue`, `.status`, `.paidAt`, `.deletedAt` | `type`, `party_id`, `issue_date`, `due_date`, `total_amount`, `amount_paid`, `balance_due`, `status`, `paid_at`, `deleted_at` (`invoices`) | legacy `clientName/clientEmail/amount` still non-nullable — fixture fills them |
| `Bill.partyId`, `.billNumber`, `.issueDate`, `.dueDate`, `.totalAmount`, `.amountPaid`, `.balanceDue`, `.status` | (`bills`) | status enum mirrors `InvoiceStatus` |
| `Party.type` (`CUSTOMER`\|`SUPPLIER`\|`AGENT`\|`BOTH`), `.creditLimit`, `.creditDays`, `.agentId` | (`parties`) | `agentId` self-relation |
| `Payment.partyId`, `.direction` (`IN`\|`OUT`), `.amount`, `.date`, `.allocations` | (`payments`, `payment_allocations`) | allocation rows carry `invoiceId?`/`billId?`/`amount` |
| `Item.name`, `.sku`, `.unit`, `.reorderLevel`, `.purchasePrice`, `.salePrice` | (`items`) | `reorderLevel` Decimal(12,3) |
| `StockMovement.itemId`, `.qty` (signed Decimal(12,3)), `.rate`, `.sourceType` (`OPENING`\|`INVOICE`\|`BILL`\|`ADJUSTMENT`), `.movementDate` | (`stock_movements`) | positive qty = IN, negative = OUT |

**Definitions locked here (cite this section, don't re-derive):**
- *Money to come* = Σ `balanceDue` of non-deleted RECEIVABLE invoices with `status ≠ PAID` and `balanceDue > 0`. *Money to pay* = same over `bills`.
- *Overdue* = `dueDate < startOfDay(asOf)` (an invoice due today is not overdue).
- Aging buckets on days past due at `asOf`: `CURRENT` (not yet due), `0_30` (1–30), `31_60`, `61_90`, `90_PLUS`.
- *DSO* = outstanding receivables ÷ (total `totalAmount` of RECEIVABLE invoices issued in the trailing 90 days) × 90, rounded to 1 decimal; `null` when trailing sales are 0. PAYABLE side returns `dso: null`.
- *Collected* = Σ `Payment.amount` with `direction = IN` in the period (payment `date`, not invoice `paidAt`).
- *Valuation* of an item = current qty × latest inbound movement rate (fallback `purchasePrice`, fallback 0).
- *Low stock* = `reorderLevel` set and current qty < `reorderLevel`. *Dead stock* = current qty > 0 and no outbound movement in the trailing 90 days.
- Risk flags: `OVER_CREDIT_LIMIT` when receivable exposure > `creditLimit`; `HABITUAL_LATE` when a party has ≥ 2 fully-paid invoices and on-time % < 50.
- All date math is UTC — tests run with `TZ=UTC`.

---

### Task 1: Analytics Domain Types

**Files:**
- Create: `src/types/analytics.ts`

**Interfaces:**
- Produces: every return type used by `analytics.service.ts` (Tasks 3–7), the API routes (Task 8) and the UI hooks (Task 10). Exact names below — later tasks import them verbatim.

- [ ] **Step 1: Write `src/types/analytics.ts`:**

```typescript
export type AgingSide = "RECEIVABLE" | "PAYABLE";

export interface HeadlineTiles {
  moneyToCome: number; // outstanding receivables (sum of balanceDue)
  moneyToPay: number; // outstanding bills (sum of balanceDue)
  pendingInvoices: { count: number; value: number }; // unpaid receivable invoices
  overdueValue: number; // receivable balanceDue past due date
  collectedThisMonth: number; // payments IN, calendar month of asOf
}

export type AgingBucketLabel = "CURRENT" | "0_30" | "31_60" | "61_90" | "90_PLUS";

export interface AgingBucket {
  label: AgingBucketLabel;
  amount: number;
  count: number;
}

export interface AgingReport {
  side: AgingSide;
  buckets: AgingBucket[]; // always all 5 buckets, in the order above
  total: number;
  dso: number | null; // RECEIVABLE only; null for PAYABLE or zero trailing sales
}

export interface CollectionTrendPoint {
  month: string; // "2026-04"
  invoiced: number; // receivable invoice totalAmount issued that month
  collected: number; // payments IN received that month
  rate: number | null; // collected / invoiced, 4 dp; null when invoiced === 0
}

export interface CashflowWeek {
  weekStart: string; // ISO date "2026-07-15"; week covers [weekStart, weekStart + 7d)
  inflow: number; // receivable balanceDue falling due in the week
  outflow: number; // bill balanceDue falling due in the week
  net: number; // inflow - outflow
}

export interface CashflowProjection {
  overdue: { inflow: number; outflow: number }; // already past due at asOf
  weeks: CashflowWeek[]; // 8 weeks starting at asOf's day
}

export type PartyRiskFlag = "OVER_CREDIT_LIMIT" | "HABITUAL_LATE";

export interface PartyAnalyticsRow {
  partyId: string;
  partyName: string;
  partyType: string; // CUSTOMER | SUPPLIER | BOTH (AGENT rows live in `agents`)
  receivableExposure: number;
  payableExposure: number;
  creditLimit: number | null;
  avgDaysToPay: number | null; // mean(paidAt - issueDate) over fully paid invoices, 1 dp
  onTimePct: number | null; // % of paid invoices with paidAt <= dueDate, 1 dp
  riskFlags: PartyRiskFlag[];
}

export interface AgentLeaderboardRow {
  agentId: string;
  agentName: string;
  collected: number; // all-time payments IN from parties managed by this agent
  outstanding: number; // receivable exposure of managed parties
  managedParties: number;
}

export interface PartyAnalytics {
  parties: PartyAnalyticsRow[]; // sorted by receivableExposure desc
  agents: AgentLeaderboardRow[]; // sorted by collected desc
}

export interface StockItemStat {
  itemId: string;
  name: string;
  sku: string | null;
  unit: string;
  currentQty: number;
  valuation: number; // currentQty x latest inbound rate (fallback purchasePrice, then 0)
  reorderLevel: number | null;
  lowStock: boolean;
  deadStock: boolean;
}

export interface StockMovementTrendPoint {
  month: string; // "2026-06"
  inQty: number;
  outQty: number; // reported positive
}

export interface StockAnalytics {
  totalValuation: number;
  items: StockItemStat[]; // sorted by valuation desc
  lowStockItems: StockItemStat[];
  deadStockItems: StockItemStat[];
  movementTrend: StockMovementTrendPoint[]; // last 6 calendar months incl. current
}
```

- [ ] **Step 2: Typecheck.** Run: `npm run typecheck` — Expected: PASS (types only, no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add src/types/analytics.ts
git commit -m "feat(analytics): add analytics domain types (Phase 5 contract)"
```

---

### Task 2: Seed Fixture + Hand-Computed Expected Values

This fixture is the phase's ground truth. Every service test (Tasks 3–7) and the phase gate (Task 12) reconcile against the `expected.ts` numbers, which were computed **by hand** from the tables below — if a test disagrees with `expected.ts`, the code is wrong, not the fixture.

**Files:**
- Create: `tests/fixtures/analytics/seed.ts`
- Create: `tests/fixtures/analytics/expected.ts`
- Create: `tests/integration/analytics/setup.ts`
- Create: `tests/integration/analytics/fixture.test.ts`
- Create: `scripts/seed-analytics-fixture.ts`
- Modify: `package.json` (add `db:seed:analytics` script)

**Interfaces:**
- Consumes: Phase 1 Prisma schema (see contract table above); Phase 1's Vitest setup (`vitest` is installed and `npx vitest run <file>` works).
- Produces: `seedAnalyticsFixture(prisma): Promise<void>`, constants `ORG_ID`, `AS_OF`; `EXPECTED` object consumed by all later tests; `resetAndSeed()` helper.

**Fixture spec (hand-computed reference — reproduce exactly in code).** Reference instant: `AS_OF = 2026-07-15T12:00:00Z`. All timestamps seeded at `12:00:00Z`.

Parties (org `org-analytics-fixture`):

| id | name | type | creditLimit | creditDays | agentId |
|---|---|---|---|---|---|
| `party-a1` | Agent Anil | AGENT | — | — | — |
| `party-a2` | Agent Bina | AGENT | — | — | — |
| `party-p1` | Acme Traders | CUSTOMER | 50000.00 | 30 | party-a1 |
| `party-p2` | Bharat Mills | CUSTOMER | 40000.00 | 45 | party-a2 |
| `party-p3` | Chandra Supplies | SUPPLIER | — | — | — |

Invoices (all `type = RECEIVABLE`, `currency = INR`):

| number | party | issueDate | dueDate | total | paid | balance | status | paidAt | days overdue at AS_OF → bucket |
|---|---|---|---|---|---|---|---|---|---|
| INV-001 | p1 | 2026-05-11 | 2026-06-10 | 10000 | 10000 | 0 | PAID | 2026-07-05 | — (paid, 55 days to pay, late) |
| INV-002 | p1 | 2026-06-01 | 2026-07-01 | 20000 | 5000 | 15000 | OVERDUE | — | 14 → `0_30` |
| INV-003 | p1 | 2026-04-30 | 2026-05-30 | 8000 | 0 | 8000 | OVERDUE | — | 46 → `31_60` |
| INV-004 | p2 | 2026-06-25 | 2026-07-25 | 40000 | 0 | 40000 | PENDING | — | −10 → `CURRENT` |
| INV-005 | p2 | 2026-01-30 | 2026-03-01 | 12000 | 0 | 12000 | OVERDUE | — | 136 → `90_PLUS` |
| INV-006 | p1 | 2026-03-16 | 2026-04-15 | 5000 | 5000 | 0 | PAID | 2026-04-20 | — (paid, 35 days to pay, late) |

Bills (party p3, payables):

| number | issueDate | dueDate | total | paid | balance | status | bucket |
|---|---|---|---|---|---|---|---|
| BILL-001 | 2026-06-20 | 2026-07-20 | 18000 | 0 | 18000 | PENDING | `CURRENT` |
| BILL-002 | 2026-05-20 | 2026-06-20 | 7000 | 2000 | 5000 | OVERDUE | 25 → `0_30` |

Payments (+ allocations):

| id | party | direction | amount | date | allocated to |
|---|---|---|---|---|---|
| pay-001 | p1 | IN | 10000 | 2026-07-05 | INV-001 (10000) |
| pay-002 | p1 | IN | 5000 | 2026-07-10 | INV-002 (5000) |
| pay-003 | p1 | IN | 5000 | 2026-04-20 | INV-006 (5000) |
| pay-004 | p3 | OUT | 2000 | 2026-07-08 | BILL-002 (2000) |

Items + stock movements:

| item | unit | purchasePrice | reorderLevel | movements (qty @ rate, date, sourceType) |
|---|---|---|---|---|
| item-1 Steel Rod 12mm (SKU STL-12) | KG | 60 | 150 | +500 @60 2026-01-05 OPENING; −420 @75 2026-06-20 INVOICE; +50 @62 2026-07-01 BILL |
| item-2 Copper Wire (SKU CU-01) | MTR | 20 | 50 | +200 @20 2026-01-05 OPENING |

**Hand-computed expected values (show your work — these go into `expected.ts`):**

- Headline: moneyToCome = 15000+8000+40000+12000 = **75000**; moneyToPay = 18000+5000 = **23000**; pendingInvoices = **{ count: 4, value: 75000 }**; overdueValue = 15000+8000+12000 = **35000** (INV-004 not yet due); collectedThisMonth (July) = 10000+5000 = **15000** (pay-004 is OUT → excluded; pay-003 was April).
- Aging RECEIVABLE: CURRENT 40000/1 · 0_30 15000/1 · 31_60 8000/1 · 61_90 0/0 · 90_PLUS 12000/1; total **75000**. DSO: trailing-90-day sales (issueDate > 2026-04-16): INV-003 8000 + INV-001 10000 + INV-002 20000 + INV-004 40000 = 78000 → DSO = 75000/78000×90 = 86.538… → **86.5**. (INV-005 issued 2026-01-30 and INV-006 issued 2026-03-16 fall outside the window — deliberate edge cases.)
- Aging PAYABLE: CURRENT 18000/1 · 0_30 5000/1 · rest 0; total **23000**; dso **null**.
- Collection trend (Feb→Jul 2026): Feb {0, 0, null} · Mar {5000, 0, 0} · Apr {8000, 5000, 0.625} · May {10000, 0, 0} · Jun {60000, 0, 0} · Jul {0, 15000, null}.
- Cashflow: overdue { inflow 35000, outflow 5000 }; week 0 (start 2026-07-15): BILL-001 due 07-20 → { 0, 18000, −18000 }; week 1 (start 2026-07-22): INV-004 due 07-25 → { 40000, 0, 40000 }; weeks 2–7 all zeros.
- Parties: p1 { recv 23000, pay 0, avgDaysToPay (55+35)/2 = **45**, onTimePct **0** (both paid late), flags `[HABITUAL_LATE]` (2 paid, <50% on time) }; p2 { recv 52000 > limit 40000, flags `[OVER_CREDIT_LIMIT]`, avgDaysToPay null, onTimePct null }; p3 { recv 0, pay 23000, flags [] }. Sorted by receivableExposure desc: p2, p1, p3.
- Agents: a1 { collected 10000+5000+5000 = **20000**, outstanding 23000, managedParties 1 }; a2 { collected 0, outstanding 52000, managedParties 1 }.
- Stock: item-1 qty 500−420+50 = **130**, latest inbound rate 62 → valuation **8060**, lowStock (130 < 150) ✓, not dead (OUT on 2026-06-20 ≥ 2026-04-16); item-2 qty **200**, valuation **4000**, not low (200 ≥ 50), dead ✓ (no OUT ever). totalValuation **12060**. Movement trend Feb→Jul: all zeros except Jun { in 0, out 420 } and Jul { in 50, out 0 } (Jan openings outside window).

- [ ] **Step 1: Start a disposable test Postgres and push the schema** (skip if Phase 1 already established a test DB — reuse it):

```bash
docker run --name invoicepilot-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=invoicepilot_test -p 5433:5432 -d postgres:17
export TEST_DATABASE_URL="postgresql://postgres:test@localhost:5433/invoicepilot_test"
DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx prisma db push
```

Expected: schema pushed with all Phase 1 tables (`parties`, `items`, `stock_movements`, `bills`, `payments`, `payment_allocations`, extended `invoices`).

- [ ] **Step 2: Write `tests/fixtures/analytics/seed.ts`** — transcribe the tables above exactly. Money values as strings (Prisma Decimal), all timestamps `T12:00:00Z`:

```typescript
import type { PrismaClient } from "@prisma/client";

export const ORG_ID = "org-analytics-fixture";
export const AS_OF = new Date("2026-07-15T12:00:00Z");

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

export async function seedAnalyticsFixture(prisma: PrismaClient): Promise<void> {
  await prisma.organization.create({
    data: { id: ORG_ID, name: "Analytics Fixture Co", slug: "analytics-fixture" },
  });

  await prisma.party.createMany({
    data: [
      { id: "party-a1", organizationId: ORG_ID, name: "Agent Anil", type: "AGENT" },
      { id: "party-a2", organizationId: ORG_ID, name: "Agent Bina", type: "AGENT" },
      { id: "party-p1", organizationId: ORG_ID, name: "Acme Traders", type: "CUSTOMER", creditLimit: "50000.00", creditDays: 30, agentId: "party-a1" },
      { id: "party-p2", organizationId: ORG_ID, name: "Bharat Mills", type: "CUSTOMER", creditLimit: "40000.00", creditDays: 45, agentId: "party-a2" },
      { id: "party-p3", organizationId: ORG_ID, name: "Chandra Supplies", type: "SUPPLIER" },
    ],
  });

  // Legacy columns (clientName/clientEmail/amount) are still non-nullable after
  // Phase 1 — fill them alongside the new party-centric fields.
  const invoice = (n: {
    id: string; number: string; partyId: string; partyName: string;
    issue: string; due: string; total: string; paid: string; balance: string;
    status: "PENDING" | "OVERDUE" | "PAID"; paidAt?: string;
  }) =>
    prisma.invoice.create({
      data: {
        id: n.id, organizationId: ORG_ID, invoiceNumber: n.number,
        type: "RECEIVABLE", partyId: n.partyId,
        clientName: n.partyName, clientEmail: `${n.partyId}@fixture.test`,
        amount: n.total, totalAmount: n.total, amountPaid: n.paid, balanceDue: n.balance,
        currency: "INR", issueDate: d(n.issue), dueDate: d(n.due),
        status: n.status, paidAt: n.paidAt ? d(n.paidAt) : null,
      },
    });

  await invoice({ id: "inv-001", number: "INV-001", partyId: "party-p1", partyName: "Acme Traders", issue: "2026-05-11", due: "2026-06-10", total: "10000.00", paid: "10000.00", balance: "0.00", status: "PAID", paidAt: "2026-07-05" });
  await invoice({ id: "inv-002", number: "INV-002", partyId: "party-p1", partyName: "Acme Traders", issue: "2026-06-01", due: "2026-07-01", total: "20000.00", paid: "5000.00", balance: "15000.00", status: "OVERDUE" });
  await invoice({ id: "inv-003", number: "INV-003", partyId: "party-p1", partyName: "Acme Traders", issue: "2026-04-30", due: "2026-05-30", total: "8000.00", paid: "0.00", balance: "8000.00", status: "OVERDUE" });
  await invoice({ id: "inv-004", number: "INV-004", partyId: "party-p2", partyName: "Bharat Mills", issue: "2026-06-25", due: "2026-07-25", total: "40000.00", paid: "0.00", balance: "40000.00", status: "PENDING" });
  await invoice({ id: "inv-005", number: "INV-005", partyId: "party-p2", partyName: "Bharat Mills", issue: "2026-01-30", due: "2026-03-01", total: "12000.00", paid: "0.00", balance: "12000.00", status: "OVERDUE" });
  await invoice({ id: "inv-006", number: "INV-006", partyId: "party-p1", partyName: "Acme Traders", issue: "2026-03-16", due: "2026-04-15", total: "5000.00", paid: "5000.00", balance: "0.00", status: "PAID", paidAt: "2026-04-20" });

  await prisma.bill.createMany({
    data: [
      { id: "bill-001", organizationId: ORG_ID, billNumber: "BILL-001", partyId: "party-p3", issueDate: d("2026-06-20"), dueDate: d("2026-07-20"), totalAmount: "18000.00", amountPaid: "0.00", balanceDue: "18000.00", status: "PENDING", currency: "INR" },
      { id: "bill-002", organizationId: ORG_ID, billNumber: "BILL-002", partyId: "party-p3", issueDate: d("2026-05-20"), dueDate: d("2026-06-20"), totalAmount: "7000.00", amountPaid: "2000.00", balanceDue: "5000.00", status: "OVERDUE", currency: "INR" },
    ],
  });

  await prisma.payment.create({ data: { id: "pay-001", organizationId: ORG_ID, partyId: "party-p1", direction: "IN", amount: "10000.00", date: d("2026-07-05"), allocations: { create: [{ invoiceId: "inv-001", amount: "10000.00" }] } } });
  await prisma.payment.create({ data: { id: "pay-002", organizationId: ORG_ID, partyId: "party-p1", direction: "IN", amount: "5000.00", date: d("2026-07-10"), allocations: { create: [{ invoiceId: "inv-002", amount: "5000.00" }] } } });
  await prisma.payment.create({ data: { id: "pay-003", organizationId: ORG_ID, partyId: "party-p1", direction: "IN", amount: "5000.00", date: d("2026-04-20"), allocations: { create: [{ invoiceId: "inv-006", amount: "5000.00" }] } } });
  await prisma.payment.create({ data: { id: "pay-004", organizationId: ORG_ID, partyId: "party-p3", direction: "OUT", amount: "2000.00", date: d("2026-07-08"), allocations: { create: [{ billId: "bill-002", amount: "2000.00" }] } } });

  await prisma.item.createMany({
    data: [
      { id: "item-1", organizationId: ORG_ID, name: "Steel Rod 12mm", sku: "STL-12", unit: "KG", purchasePrice: "60.00", salePrice: "75.00", reorderLevel: "150.000" },
      { id: "item-2", organizationId: ORG_ID, name: "Copper Wire", sku: "CU-01", unit: "MTR", purchasePrice: "20.00", salePrice: "28.00", reorderLevel: "50.000" },
    ],
  });

  await prisma.stockMovement.createMany({
    data: [
      { organizationId: ORG_ID, itemId: "item-1", qty: "500.000", rate: "60.00", sourceType: "OPENING", movementDate: d("2026-01-05") },
      { organizationId: ORG_ID, itemId: "item-1", qty: "-420.000", rate: "75.00", sourceType: "INVOICE", movementDate: d("2026-06-20") },
      { organizationId: ORG_ID, itemId: "item-1", qty: "50.000", rate: "62.00", sourceType: "BILL", movementDate: d("2026-07-01") },
      { organizationId: ORG_ID, itemId: "item-2", qty: "200.000", rate: "20.00", sourceType: "OPENING", movementDate: d("2026-01-05") },
    ],
  });
}
```

- [ ] **Step 3: Write `tests/fixtures/analytics/expected.ts`** — the hand-computed values, verbatim from the tables above:

```typescript
import type {
  AgingReport, CashflowProjection, CollectionTrendPoint,
  HeadlineTiles, PartyAnalytics, StockAnalytics,
} from "@/types/analytics";

export const EXPECTED_HEADLINE: HeadlineTiles = {
  moneyToCome: 75000,
  moneyToPay: 23000,
  pendingInvoices: { count: 4, value: 75000 },
  overdueValue: 35000,
  collectedThisMonth: 15000,
};

export const EXPECTED_AGING_RECEIVABLE: AgingReport = {
  side: "RECEIVABLE",
  buckets: [
    { label: "CURRENT", amount: 40000, count: 1 },
    { label: "0_30", amount: 15000, count: 1 },
    { label: "31_60", amount: 8000, count: 1 },
    { label: "61_90", amount: 0, count: 0 },
    { label: "90_PLUS", amount: 12000, count: 1 },
  ],
  total: 75000,
  dso: 86.5, // 75000 / 78000 * 90
};

export const EXPECTED_AGING_PAYABLE: AgingReport = {
  side: "PAYABLE",
  buckets: [
    { label: "CURRENT", amount: 18000, count: 1 },
    { label: "0_30", amount: 5000, count: 1 },
    { label: "31_60", amount: 0, count: 0 },
    { label: "61_90", amount: 0, count: 0 },
    { label: "90_PLUS", amount: 0, count: 0 },
  ],
  total: 23000,
  dso: null,
};

export const EXPECTED_TREND: CollectionTrendPoint[] = [
  { month: "2026-02", invoiced: 0, collected: 0, rate: null },
  { month: "2026-03", invoiced: 5000, collected: 0, rate: 0 },
  { month: "2026-04", invoiced: 8000, collected: 5000, rate: 0.625 },
  { month: "2026-05", invoiced: 10000, collected: 0, rate: 0 },
  { month: "2026-06", invoiced: 60000, collected: 0, rate: 0 },
  { month: "2026-07", invoiced: 0, collected: 15000, rate: null },
];

export const EXPECTED_CASHFLOW: CashflowProjection = {
  overdue: { inflow: 35000, outflow: 5000 },
  weeks: [
    { weekStart: "2026-07-15", inflow: 0, outflow: 18000, net: -18000 },
    { weekStart: "2026-07-22", inflow: 40000, outflow: 0, net: 40000 },
    { weekStart: "2026-07-29", inflow: 0, outflow: 0, net: 0 },
    { weekStart: "2026-08-05", inflow: 0, outflow: 0, net: 0 },
    { weekStart: "2026-08-12", inflow: 0, outflow: 0, net: 0 },
    { weekStart: "2026-08-19", inflow: 0, outflow: 0, net: 0 },
    { weekStart: "2026-08-26", inflow: 0, outflow: 0, net: 0 },
    { weekStart: "2026-09-02", inflow: 0, outflow: 0, net: 0 },
  ],
};

export const EXPECTED_PARTIES: PartyAnalytics = {
  parties: [
    { partyId: "party-p2", partyName: "Bharat Mills", partyType: "CUSTOMER", receivableExposure: 52000, payableExposure: 0, creditLimit: 40000, avgDaysToPay: null, onTimePct: null, riskFlags: ["OVER_CREDIT_LIMIT"] },
    { partyId: "party-p1", partyName: "Acme Traders", partyType: "CUSTOMER", receivableExposure: 23000, payableExposure: 0, creditLimit: 50000, avgDaysToPay: 45, onTimePct: 0, riskFlags: ["HABITUAL_LATE"] },
    { partyId: "party-p3", partyName: "Chandra Supplies", partyType: "SUPPLIER", receivableExposure: 0, payableExposure: 23000, creditLimit: null, avgDaysToPay: null, onTimePct: null, riskFlags: [] },
  ],
  agents: [
    { agentId: "party-a1", agentName: "Agent Anil", collected: 20000, outstanding: 23000, managedParties: 1 },
    { agentId: "party-a2", agentName: "Agent Bina", collected: 0, outstanding: 52000, managedParties: 1 },
  ],
};

export const EXPECTED_STOCK: StockAnalytics = {
  totalValuation: 12060,
  items: [
    { itemId: "item-1", name: "Steel Rod 12mm", sku: "STL-12", unit: "KG", currentQty: 130, valuation: 8060, reorderLevel: 150, lowStock: true, deadStock: false },
    { itemId: "item-2", name: "Copper Wire", sku: "CU-01", unit: "MTR", currentQty: 200, valuation: 4000, reorderLevel: 50, lowStock: false, deadStock: true },
  ],
  lowStockItems: [
    { itemId: "item-1", name: "Steel Rod 12mm", sku: "STL-12", unit: "KG", currentQty: 130, valuation: 8060, reorderLevel: 150, lowStock: true, deadStock: false },
  ],
  deadStockItems: [
    { itemId: "item-2", name: "Copper Wire", sku: "CU-01", unit: "MTR", currentQty: 200, valuation: 4000, reorderLevel: 50, lowStock: false, deadStock: true },
  ],
  movementTrend: [
    { month: "2026-02", inQty: 0, outQty: 0 },
    { month: "2026-03", inQty: 0, outQty: 0 },
    { month: "2026-04", inQty: 0, outQty: 0 },
    { month: "2026-05", inQty: 0, outQty: 0 },
    { month: "2026-06", inQty: 0, outQty: 420 },
    { month: "2026-07", inQty: 50, outQty: 0 },
  ],
};
```

- [ ] **Step 4: Write `tests/integration/analytics/setup.ts`:**

```typescript
process.env.TZ = "UTC"; // all fixture dates + bucket math are UTC

import { PrismaClient } from "@prisma/client";
import { seedAnalyticsFixture } from "../../fixtures/analytics/seed";

export const prisma = new PrismaClient();

export async function resetAndSeed(): Promise<void> {
  // Organizations cascade to every business table.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE organizations CASCADE`);
  await seedAnalyticsFixture(prisma);
}
```

- [ ] **Step 5: Write `tests/integration/analytics/fixture.test.ts`** — internal-consistency checks (catches transcription errors before any service exists):

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetAndSeed } from "./setup";

describe("analytics fixture consistency", () => {
  beforeAll(resetAndSeed);
  afterAll(() => prisma.$disconnect());

  it("every invoice satisfies balanceDue = totalAmount - amountPaid", async () => {
    const invoices = await prisma.invoice.findMany();
    expect(invoices).toHaveLength(6);
    for (const inv of invoices) {
      expect(inv.balanceDue.toNumber()).toBe(inv.totalAmount.toNumber() - inv.amountPaid.toNumber());
    }
  });

  it("every payment's allocations sum to its amount", async () => {
    const payments = await prisma.payment.findMany({ include: { allocations: true } });
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
```

- [ ] **Step 6: Run it.** `TZ=UTC DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx vitest run tests/integration/analytics/fixture.test.ts` — Expected: 3 tests PASS. (If Prisma field names differ from the contract table, fix the seed *and* the contract table's "Consumes" mapping now — every later task depends on it.)

- [ ] **Step 7: Write `scripts/seed-analytics-fixture.ts`** (dev-DB eyeballing for Task 10/12):

```typescript
import { PrismaClient } from "@prisma/client";
import { seedAnalyticsFixture, ORG_ID } from "../tests/fixtures/analytics/seed";

const prisma = new PrismaClient();
seedAnalyticsFixture(prisma)
  .then(() => console.log(`Seeded analytics fixture into org ${ORG_ID}`))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

Add to `package.json` scripts: `"db:seed:analytics": "npx tsx scripts/seed-analytics-fixture.ts"` (Phase 1 added `tsx` for scripts; if not, `npm i -D tsx` first).

- [ ] **Step 8: Commit**

```bash
git add tests/fixtures/analytics tests/integration/analytics scripts/seed-analytics-fixture.ts package.json
git commit -m "test(analytics): seed fixture with hand-computed expected values"
```

---

### Task 3: `analytics.service.getHeadlineTiles`

**Files:**
- Create: `src/server/services/analytics.service.ts`
- Test: `tests/integration/analytics/headline.test.ts`

**Interfaces:**
- Consumes: `resetAndSeed`, `ORG_ID`, `AS_OF` (Task 2), `HeadlineTiles` (Task 1).
- Produces: `analyticsService.getHeadlineTiles(organizationId: string, asOf?: Date): Promise<HeadlineTiles>` — Phase 6's `get_analytics` tool and Task 8's route call this.

- [ ] **Step 1: Write the failing test** `tests/integration/analytics/headline.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetAndSeed } from "./setup";
import { AS_OF, ORG_ID } from "../../fixtures/analytics/seed";
import { EXPECTED_HEADLINE } from "../../fixtures/analytics/expected";
import { analyticsService } from "@/server/services/analytics.service";

describe("getHeadlineTiles", () => {
  beforeAll(resetAndSeed);
  afterAll(() => prisma.$disconnect());

  it("reconciles every tile against hand-computed fixture values", async () => {
    const tiles = await analyticsService.getHeadlineTiles(ORG_ID, AS_OF);
    expect(tiles).toEqual(EXPECTED_HEADLINE);
  });

  it("is org-scoped: another org sees zeros", async () => {
    await prisma.organization.create({ data: { id: "org-other", name: "Other", slug: "other-org" } });
    const tiles = await analyticsService.getHeadlineTiles("org-other", AS_OF);
    expect(tiles).toEqual({
      moneyToCome: 0, moneyToPay: 0,
      pendingInvoices: { count: 0, value: 0 },
      overdueValue: 0, collectedThisMonth: 0,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `TZ=UTC DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx vitest run tests/integration/analytics/headline.test.ts` — Expected: FAIL, cannot resolve `@/server/services/analytics.service`.

- [ ] **Step 3: Create `src/server/services/analytics.service.ts`** with the file skeleton + first method (later tasks append methods to this same object):

```typescript
import { startOfDay, startOfMonth } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/utils/currency";
import type { HeadlineTiles } from "@/types/analytics";

const num = (v: unknown): number => (v == null ? 0 : decimalToNumber(v as never));
export const round1 = (n: number): number => Math.round(n * 10) / 10;
export const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export const analyticsService = {
  async getHeadlineTiles(organizationId: string, asOf: Date = new Date()): Promise<HeadlineTiles> {
    const dayStart = startOfDay(asOf);
    const monthStart = startOfMonth(asOf);

    const openReceivable = {
      organizationId, deletedAt: null, type: "RECEIVABLE" as const,
      status: { not: "PAID" as const }, balanceDue: { gt: 0 },
    };

    const [recv, pay, overdue, collected] = await Promise.all([
      prisma.invoice.aggregate({ where: openReceivable, _sum: { balanceDue: true }, _count: { _all: true } }),
      prisma.bill.aggregate({
        where: { organizationId, deletedAt: null, status: { not: "PAID" }, balanceDue: { gt: 0 } },
        _sum: { balanceDue: true },
      }),
      prisma.invoice.aggregate({
        where: { ...openReceivable, dueDate: { lt: dayStart } },
        _sum: { balanceDue: true },
      }),
      prisma.payment.aggregate({
        where: { organizationId, deletedAt: null, direction: "IN", date: { gte: monthStart, lte: asOf } },
        _sum: { amount: true },
      }),
    ]);

    return {
      moneyToCome: num(recv._sum.balanceDue),
      moneyToPay: num(pay._sum.balanceDue),
      pendingInvoices: { count: recv._count._all, value: num(recv._sum.balanceDue) },
      overdueValue: num(overdue._sum.balanceDue),
      collectedThisMonth: num(collected._sum.amount),
    };
  },
};
```

- [ ] **Step 4: Run the test.** Same command as Step 2 — Expected: 2 tests PASS. If `collectedThisMonth` comes back 17000, the `direction: "IN"` filter is missing (pay-004 leaked in); if `overdueValue` is 75000, the `dueDate < dayStart` filter is missing.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/server/services/analytics.service.ts tests/integration/analytics/headline.test.ts
git commit -m "feat(analytics): headline tiles service with reconciled aggregates"
```

---

### Task 4: `getAgingReport` (receivable + payable) with DSO

**Files:**
- Modify: `src/server/services/analytics.service.ts`
- Test: `tests/integration/analytics/aging.test.ts`

**Interfaces:**
- Consumes: fixture + `AgingReport`, `AgingSide`, `AgingBucketLabel` types.
- Produces: `analyticsService.getAgingReport(organizationId: string, side: AgingSide, asOf?: Date): Promise<AgingReport>`.

- [ ] **Step 1: Write the failing test** `tests/integration/analytics/aging.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetAndSeed } from "./setup";
import { AS_OF, ORG_ID } from "../../fixtures/analytics/seed";
import { EXPECTED_AGING_PAYABLE, EXPECTED_AGING_RECEIVABLE } from "../../fixtures/analytics/expected";
import { analyticsService } from "@/server/services/analytics.service";

describe("getAgingReport", () => {
  beforeAll(resetAndSeed);
  afterAll(() => prisma.$disconnect());

  it("buckets receivables 0-30/31-60/61-90/90+ and computes DSO 86.5", async () => {
    const report = await analyticsService.getAgingReport(ORG_ID, "RECEIVABLE", AS_OF);
    expect(report).toEqual(EXPECTED_AGING_RECEIVABLE);
  });

  it("buckets payables from bills, dso null", async () => {
    const report = await analyticsService.getAgingReport(ORG_ID, "PAYABLE", AS_OF);
    expect(report).toEqual(EXPECTED_AGING_PAYABLE);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `TZ=UTC DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx vitest run tests/integration/analytics/aging.test.ts` — Expected: FAIL, `getAgingReport is not a function`.

- [ ] **Step 3: Add the method** to `analyticsService` (append to the object; add imports `subDays` from date-fns, `Prisma` from `@prisma/client`, types `AgingBucketLabel, AgingReport, AgingSide` from `@/types/analytics`):

```typescript
  async getAgingReport(organizationId: string, side: AgingSide, asOf: Date = new Date()): Promise<AgingReport> {
    const dayStart = startOfDay(asOf);
    // Table name is a compile-time constant per side — safe with Prisma.raw.
    const table = side === "RECEIVABLE" ? Prisma.raw("invoices") : Prisma.raw("bills");
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
        COALESCE(SUM(balance_due), 0) AS amount,
        COUNT(*) AS count
      FROM ${table}
      WHERE organization_id = ${organizationId}
        AND deleted_at IS NULL
        AND status <> 'PAID'
        AND balance_due > 0
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
      const sales = await prisma.invoice.aggregate({
        where: {
          organizationId, deletedAt: null, type: "RECEIVABLE",
          issueDate: { gt: subDays(dayStart, 90), lte: asOf },
        },
        _sum: { totalAmount: true },
      });
      const trailingSales = num(sales._sum.totalAmount);
      dso = trailingSales > 0 ? round1((total / trailingSales) * 90) : null;
    }

    return { side, buckets, total, dso };
  },
```

- [ ] **Step 4: Run the test.** Expected: 2 tests PASS. Boundary sanity if it fails: INV-002 (due 07-01, 14 days) must land in `0_30`; INV-003 (due 05-30, 46 days) in `31_60`; DSO window must *exclude* INV-005 (issued 01-30) and INV-006 (issued 03-16) — trailing sales exactly 78000.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/analytics.service.ts tests/integration/analytics/aging.test.ts
git commit -m "feat(analytics): aging report for receivables and payables with DSO"
```

---

### Task 5: `getCollectionTrend` + `getCashflowProjection`

**Files:**
- Modify: `src/server/services/analytics.service.ts`
- Test: `tests/integration/analytics/trend-cashflow.test.ts`

**Interfaces:**
- Produces: `analyticsService.getCollectionTrend(organizationId, asOf?): Promise<CollectionTrendPoint[]>` (6 calendar months incl. current) and `analyticsService.getCashflowProjection(organizationId, asOf?): Promise<CashflowProjection>` (overdue bucket + 8 weekly buckets from `asOf`'s day; due dates beyond 8 weeks are omitted).

- [ ] **Step 1: Write the failing test** `tests/integration/analytics/trend-cashflow.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetAndSeed } from "./setup";
import { AS_OF, ORG_ID } from "../../fixtures/analytics/seed";
import { EXPECTED_CASHFLOW, EXPECTED_TREND } from "../../fixtures/analytics/expected";
import { analyticsService } from "@/server/services/analytics.service";

describe("collection trend + cashflow projection", () => {
  beforeAll(resetAndSeed);
  afterAll(() => prisma.$disconnect());

  it("computes 6-month invoiced/collected/rate series", async () => {
    const trend = await analyticsService.getCollectionTrend(ORG_ID, AS_OF);
    expect(trend).toEqual(EXPECTED_TREND);
  });

  it("projects weekly cashflow from due dates with an overdue bucket", async () => {
    const projection = await analyticsService.getCashflowProjection(ORG_ID, AS_OF);
    expect(projection).toEqual(EXPECTED_CASHFLOW);
  });
});
```

- [ ] **Step 2: Run to verify failure.** `TZ=UTC DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx vitest run tests/integration/analytics/trend-cashflow.test.ts` — Expected: FAIL, methods not defined.

- [ ] **Step 3: Add both methods** (extend imports: `addDays, differenceInCalendarDays, format, subMonths` from date-fns; types `CashflowProjection, CashflowWeek, CollectionTrendPoint` from `@/types/analytics`):

```typescript
  async getCollectionTrend(organizationId: string, asOf: Date = new Date()): Promise<CollectionTrendPoint[]> {
    const windowStart = startOfMonth(subMonths(asOf, 5));

    const [invoicedRows, collectedRows] = await Promise.all([
      prisma.$queryRaw<{ month: string; total: unknown }[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', issue_date), 'YYYY-MM') AS month,
               SUM(total_amount) AS total
        FROM invoices
        WHERE organization_id = ${organizationId} AND deleted_at IS NULL
          AND type = 'RECEIVABLE'
          AND issue_date >= ${windowStart} AND issue_date <= ${asOf}
        GROUP BY 1
      `),
      prisma.$queryRaw<{ month: string; total: unknown }[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
               SUM(amount) AS total
        FROM payments
        WHERE organization_id = ${organizationId} AND deleted_at IS NULL
          AND direction = 'IN'
          AND date >= ${windowStart} AND date <= ${asOf}
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
        where: { organizationId, deletedAt: null, type: "RECEIVABLE", status: { not: "PAID" }, balanceDue: { gt: 0 } },
        select: { dueDate: true, balanceDue: true },
      }),
      prisma.bill.findMany({
        where: { organizationId, deletedAt: null, status: { not: "PAID" }, balanceDue: { gt: 0 } },
        select: { dueDate: true, balanceDue: true },
      }),
    ]);

    const overdue = { inflow: 0, outflow: 0 };
    const weeks: CashflowWeek[] = Array.from({ length: WEEKS }, (_, i) => ({
      weekStart: format(addDays(dayStart, i * 7), "yyyy-MM-dd"),
      inflow: 0, outflow: 0, net: 0,
    }));

    const place = (dueDate: Date, amount: number, key: "inflow" | "outflow") => {
      const days = differenceInCalendarDays(dueDate, dayStart);
      if (days < 0) overdue[key] += amount;
      else if (days < WEEKS * 7) weeks[Math.floor(days / 7)][key] += amount;
      // due dates beyond the horizon are omitted by design
    };

    for (const r of receivables) place(r.dueDate, num(r.balanceDue), "inflow");
    for (const b of payables) place(b.dueDate, num(b.balanceDue), "outflow");
    for (const w of weeks) w.net = w.inflow - w.outflow;

    return { overdue, weeks };
  },
```

- [ ] **Step 4: Run the test.** Expected: 2 tests PASS. If July's `collected` is 17000, `direction = 'IN'` is missing from the payments SQL; if week 0 shows INV-004's 40000, the day diff for 07-25 vs 07-15 (10 → week index 1) is wrong.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/analytics.service.ts tests/integration/analytics/trend-cashflow.test.ts
git commit -m "feat(analytics): collection-rate trend and due-date cashflow projection"
```

---

### Task 6: `getPartyAnalytics` — exposure, payment behavior, agent leaderboard, risk flags

**Files:**
- Modify: `src/server/services/analytics.service.ts`
- Test: `tests/integration/analytics/parties.test.ts`

**Interfaces:**
- Produces: `analyticsService.getPartyAnalytics(organizationId, asOf?): Promise<PartyAnalytics>`. Risk-flag thresholds are the contract definitions (over credit limit; ≥2 paid invoices and <50% on-time).

- [ ] **Step 1: Write the failing test** `tests/integration/analytics/parties.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetAndSeed } from "./setup";
import { AS_OF, ORG_ID } from "../../fixtures/analytics/seed";
import { EXPECTED_PARTIES } from "../../fixtures/analytics/expected";
import { analyticsService } from "@/server/services/analytics.service";

describe("getPartyAnalytics", () => {
  beforeAll(resetAndSeed);
  afterAll(() => prisma.$disconnect());

  it("computes exposure, days-to-pay, on-time %, flags, and agent leaderboard", async () => {
    const result = await analyticsService.getPartyAnalytics(ORG_ID, AS_OF);
    expect(result).toEqual(EXPECTED_PARTIES);
  });
});
```

- [ ] **Step 2: Run to verify failure.** `TZ=UTC DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx vitest run tests/integration/analytics/parties.test.ts` — Expected: FAIL, method not defined.

- [ ] **Step 3: Add the method** (extend type imports with `AgentLeaderboardRow, PartyAnalytics, PartyAnalyticsRow, PartyRiskFlag`):

```typescript
  async getPartyAnalytics(organizationId: string, _asOf: Date = new Date()): Promise<PartyAnalytics> {
    const [parties, recvExposure, payExposure, paidInvoices, collectedByParty] = await Promise.all([
      prisma.party.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true, type: true, creditLimit: true, agentId: true },
      }),
      prisma.invoice.groupBy({
        by: ["partyId"],
        where: { organizationId, deletedAt: null, type: "RECEIVABLE", status: { not: "PAID" }, balanceDue: { gt: 0 } },
        _sum: { balanceDue: true },
      }),
      prisma.bill.groupBy({
        by: ["partyId"],
        where: { organizationId, deletedAt: null, status: { not: "PAID" }, balanceDue: { gt: 0 } },
        _sum: { balanceDue: true },
      }),
      prisma.invoice.findMany({
        where: { organizationId, deletedAt: null, type: "RECEIVABLE", status: "PAID", paidAt: { not: null } },
        select: { partyId: true, issueDate: true, dueDate: true, paidAt: true },
      }),
      prisma.payment.groupBy({
        by: ["partyId"],
        where: { organizationId, deletedAt: null, direction: "IN" },
        _sum: { amount: true },
      }),
    ]);

    const recvBy = new Map(recvExposure.map((r) => [r.partyId, num(r._sum.balanceDue)]));
    const payBy = new Map(payExposure.map((r) => [r.partyId, num(r._sum.balanceDue)]));
    const collectedBy = new Map(collectedByParty.map((r) => [r.partyId, num(r._sum.amount)]));

    const behavior = new Map<string, { paidCount: number; totalDays: number; onTime: number }>();
    for (const inv of paidInvoices) {
      const b = behavior.get(inv.partyId) ?? { paidCount: 0, totalDays: 0, onTime: 0 };
      b.paidCount += 1;
      b.totalDays += differenceInCalendarDays(inv.paidAt!, inv.issueDate);
      if (differenceInCalendarDays(inv.paidAt!, inv.dueDate) <= 0) b.onTime += 1;
      behavior.set(inv.partyId, b);
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
```

- [ ] **Step 4: Run the test.** Expected: PASS. Trip-wires: p1 avgDaysToPay must be 45 (55 for INV-001, 35 for INV-006); a1's collected 20000 must include April's pay-003 (leaderboard is all-time by design).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/analytics.service.ts tests/integration/analytics/parties.test.ts
git commit -m "feat(analytics): party exposure, payment behavior, agent leaderboard, risk flags"
```

---

### Task 7: `getStockAnalytics` — stock on hand, valuation, trends, low/dead stock

**Files:**
- Modify: `src/server/services/analytics.service.ts`
- Test: `tests/integration/analytics/stock.test.ts`

**Interfaces:**
- Produces: `analyticsService.getStockAnalytics(organizationId, asOf?): Promise<StockAnalytics>`. Task 9's low-stock job consumes `lowStockItems` from this exact method — no separate query path.

- [ ] **Step 1: Write the failing test** `tests/integration/analytics/stock.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, resetAndSeed } from "./setup";
import { AS_OF, ORG_ID } from "../../fixtures/analytics/seed";
import { EXPECTED_STOCK } from "../../fixtures/analytics/expected";
import { analyticsService } from "@/server/services/analytics.service";

describe("getStockAnalytics", () => {
  beforeAll(resetAndSeed);
  afterAll(() => prisma.$disconnect());

  it("computes qty, valuation, low/dead stock, and movement trend", async () => {
    const result = await analyticsService.getStockAnalytics(ORG_ID, AS_OF);
    expect(result).toEqual(EXPECTED_STOCK);
  });
});
```

- [ ] **Step 2: Run to verify failure.** Expected: FAIL, method not defined.

- [ ] **Step 3: Add the method** (extend type imports with `StockAnalytics, StockItemStat, StockMovementTrendPoint`):

```typescript
  async getStockAnalytics(organizationId: string, asOf: Date = new Date()): Promise<StockAnalytics> {
    const dayStart = startOfDay(asOf);
    const deadCutoff = subDays(dayStart, 90);
    const trendStart = startOfMonth(subMonths(asOf, 5));

    const [items, stockRows, trendRows] = await Promise.all([
      prisma.item.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true, sku: true, unit: true, reorderLevel: true, purchasePrice: true },
      }),
      prisma.$queryRaw<{ item_id: string; qty: unknown; last_in_rate: unknown; last_out: Date | null }[]>(Prisma.sql`
        SELECT sm.item_id,
               COALESCE(SUM(sm.qty), 0) AS qty,
               (SELECT sm2.rate FROM stock_movements sm2
                 WHERE sm2.item_id = sm.item_id AND sm2.qty > 0
                 ORDER BY sm2.movement_date DESC LIMIT 1) AS last_in_rate,
               MAX(CASE WHEN sm.qty < 0 THEN sm.movement_date END) AS last_out
        FROM stock_movements sm
        WHERE sm.organization_id = ${organizationId}
        GROUP BY sm.item_id
      `),
      prisma.$queryRaw<{ month: string; in_qty: unknown; out_qty: unknown }[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', movement_date), 'YYYY-MM') AS month,
               COALESCE(SUM(CASE WHEN qty > 0 THEN qty END), 0) AS in_qty,
               COALESCE(SUM(CASE WHEN qty < 0 THEN -qty END), 0) AS out_qty
        FROM stock_movements
        WHERE organization_id = ${organizationId}
          AND movement_date >= ${trendStart} AND movement_date <= ${asOf}
        GROUP BY 1
      `),
    ]);

    const stockBy = new Map(stockRows.map((r) => [r.item_id, r]));

    const itemStats: StockItemStat[] = items
      .map((item) => {
        const row = stockBy.get(item.id);
        const currentQty = num(row?.qty);
        const rate = row?.last_in_rate != null ? num(row.last_in_rate)
          : item.purchasePrice != null ? num(item.purchasePrice) : 0;
        const reorderLevel = item.reorderLevel == null ? null : num(item.reorderLevel);
        const lastOut = row?.last_out ?? null;
        return {
          itemId: item.id, name: item.name, sku: item.sku, unit: item.unit,
          currentQty,
          valuation: Math.round(currentQty * rate * 100) / 100,
          reorderLevel,
          lowStock: reorderLevel != null && currentQty < reorderLevel,
          deadStock: currentQty > 0 && (lastOut == null || lastOut < deadCutoff),
        };
      })
      .sort((a, b) => b.valuation - a.valuation);

    const trendBy = new Map(trendRows.map((r) => [r.month, r]));
    const movementTrend: StockMovementTrendPoint[] = Array.from({ length: 6 }, (_, i) => {
      const month = format(subMonths(asOf, 5 - i), "yyyy-MM");
      const r = trendBy.get(month);
      return { month, inQty: num(r?.in_qty), outQty: num(r?.out_qty) };
    });

    return {
      totalValuation: itemStats.reduce((s, i) => s + i.valuation, 0),
      items: itemStats,
      lowStockItems: itemStats.filter((i) => i.lowStock),
      deadStockItems: itemStats.filter((i) => i.deadStock),
      movementTrend,
    };
  },
```

- [ ] **Step 4: Run the test.** Expected: PASS. Trip-wires: item-1 valuation must use the *latest inbound* rate 62 (8060), not purchasePrice 60 or the outbound 75; item-1 is not dead (out on 06-20 ≥ cutoff 04-16) while item-2 is.

- [ ] **Step 5: Run the whole analytics suite** — `TZ=UTC DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx vitest run tests/integration/analytics` — Expected: all files PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/analytics.service.ts tests/integration/analytics/stock.test.ts
git commit -m "feat(analytics): stock valuation, movement trend, low/dead stock detection"
```

---

### Task 8: Cached API Routes

**Files:**
- Create: `src/lib/cache/analytics-cache.ts`
- Create: `src/app/api/analytics/headline/route.ts`
- Create: `src/app/api/analytics/aging/route.ts`
- Create: `src/app/api/analytics/trend/route.ts`
- Create: `src/app/api/analytics/cashflow/route.ts`
- Create: `src/app/api/analytics/parties/route.ts`
- Create: `src/app/api/analytics/stock/route.ts`
- Modify: the mutating services Phase 1/4 produced — `src/server/services/payment.service.ts` and `src/server/services/invoice.service.ts`

**Interfaces:**
- Consumes: `analyticsService` (Tasks 3–7), `withApiHandler`/`successResponse` (existing).
- Produces: `GET /api/analytics/{headline,aging?side=,trend,cashflow,parties,stock}` returning `ApiSuccess<T>` with the Task 1 types; `analyticsCacheTag(organizationId)` used by mutating services to invalidate.

⚠️ **Workers-runtime verification (ADR-001):** hosting is Cloudflare Pages via the OpenNext Cloudflare adapter, not Vercel. `unstable_cache`/`revalidateTag` rely on Next.js's Data Cache, which on OpenNext Cloudflare needs an explicit incremental-cache binding (KV or R2) to actually persist/invalidate across requests — it does not "just work" the way it does on Vercel by default. Confirm the adapter's cache-handler setup is in place and that `revalidateTag` actually invalidates on Cloudflare before relying on this for correctness; if it doesn't hold up, fall back to a plain in-memory/Upstash-backed TTL cache keyed the same way (`analytics:{organizationId}:{key}`) instead of `next/cache` primitives.

- [ ] **Step 1: Write `src/lib/cache/analytics-cache.ts`:**

```typescript
import { unstable_cache } from "next/cache";

const TTL_SECONDS = 60; // short TTL per parent plan §Phase 5.5 — freshness backstop

export const analyticsCacheTag = (organizationId: string) => `analytics:${organizationId}`;

export function cachedAnalytics<T>(
  organizationId: string,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  return unstable_cache(fn, ["analytics", organizationId, key], {
    revalidate: TTL_SECONDS,
    tags: [analyticsCacheTag(organizationId)],
  })();
}
```

- [ ] **Step 2: Write the six routes.** `headline/route.ts`:

```typescript
import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { cachedAnalytics } from "@/lib/cache/analytics-cache";
import { analyticsService } from "@/server/services/analytics.service";

export const GET = withApiHandler(async (_request, ctx) => {
  const data = await cachedAnalytics(ctx.organizationId, "headline", () =>
    analyticsService.getHeadlineTiles(ctx.organizationId),
  );
  return successResponse(data);
});
```

`aging/route.ts` (the only one with a parameter):

```typescript
import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { cachedAnalytics } from "@/lib/cache/analytics-cache";
import { analyticsService } from "@/server/services/analytics.service";

const querySchema = z.object({ side: z.enum(["RECEIVABLE", "PAYABLE"]).default("RECEIVABLE") });

export const GET = withApiHandler(async (request, ctx) => {
  const { side } = querySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const data = await cachedAnalytics(ctx.organizationId, `aging:${side}`, () =>
    analyticsService.getAgingReport(ctx.organizationId, side),
  );
  return successResponse(data);
});
```

`trend/route.ts`, `cashflow/route.ts`, `parties/route.ts`, `stock/route.ts` follow the headline shape exactly, swapping the cache key (`"trend"`, `"cashflow"`, `"parties"`, `"stock"`) and the service call (`getCollectionTrend`, `getCashflowProjection`, `getPartyAnalytics`, `getStockAnalytics`) — write each file out in full; same three imports, one `GET` export each.

- [ ] **Step 3: Wire cache invalidation into mutating services.** In every method of `payment.service.ts` and `invoice.service.ts` that writes payment/invoice rows (record payment, mark paid, create/update/delete invoice — the methods Phase 1/3 landed), add after the successful write:

```typescript
import { revalidateTag } from "next/cache";
import { analyticsCacheTag } from "@/lib/cache/analytics-cache";
// ... after the successful Prisma write, inside the service method:
revalidateTag(analyticsCacheTag(organizationId));
```

These services are only invoked from route handlers/server actions, where `revalidateTag` is legal. The 60 s TTL remains the backstop for paths you miss (e.g. Inngest import jobs — acceptable staleness per parent plan).

- [ ] **Step 4: Verify.** `npm run typecheck && npm run lint && npm run build` — Expected: all pass. Then `npm run dev`, sign in, and `curl` each endpoint from the browser session (or just load them in the browser): `/api/analytics/headline` must return `{"success":true,"data":{"moneyToCome":...}}`; `/api/analytics/aging?side=PAYABLE` must return the bills-based report; `/api/analytics/aging?side=BOGUS` must return a 422 `VALIDATION_ERROR`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache/analytics-cache.ts src/app/api/analytics src/server/services/payment.service.ts src/server/services/invoice.service.ts
git commit -m "feat(analytics): cached /api/analytics routes with per-org tag invalidation"
```

---

### Task 9: Low-Stock Daily Job (Inngest) → Notification

**Files:**
- Modify: `src/lib/jobs/types.ts`
- Modify: `src/lib/jobs/inngest/scheduler.ts`
- Create: `src/server/services/notification.service.ts`
- Modify: `src/server/workflows/inngest/functions.ts`
- Test: `tests/integration/analytics/low-stock-notification.test.ts`

**Interfaces:**
- Consumes: `analyticsService.getStockAnalytics` (Task 7), existing `getEmailProvider`/`setEmailProvider` from `@/lib/email`, `EmailLog` model.
- Produces: `notificationService.sendLowStockDigest(organizationId: string): Promise<boolean>`; Inngest events `invoicepilot/stock.low-stock-check` and cron `low-stock-scan` (daily 08:00 UTC); `JobScheduler.enqueueLowStockChecks(organizationIds: string[])`.

- [ ] **Step 1: Write the failing test** `tests/integration/analytics/low-stock-notification.test.ts` (uses the existing `setEmailProvider` seam — no network):

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetAndSeed } from "./setup";
import { ORG_ID } from "../../fixtures/analytics/seed";
import { setEmailProvider } from "@/lib/email";
import type { SendEmailParams } from "@/lib/email/types";
import { notificationService } from "@/server/services/notification.service";

const sent: SendEmailParams[] = [];

describe("sendLowStockDigest", () => {
  beforeAll(async () => {
    await resetAndSeed();
    // Fixture has no members; the digest needs an owner to email.
    const user = await prisma.user.create({
      data: { clerkId: "clerk-fixture-owner", email: "owner@fixture.test", name: "Owner" },
    });
    await prisma.organizationMember.create({
      data: { organizationId: ORG_ID, userId: user.id, role: "owner" },
    });
    setEmailProvider({
      name: "fake",
      async send(params) { sent.push(params); return { id: "fake-1", success: true }; },
    });
  });
  beforeEach(() => { sent.length = 0; });
  afterAll(() => prisma.$disconnect());

  it("emails the org owner a digest naming the low-stock item and logs it", async () => {
    const result = await notificationService.sendLowStockDigest(ORG_ID);
    expect(result).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("owner@fixture.test");
    expect(sent[0].subject).toContain("Low stock");
    expect(sent[0].html).toContain("Steel Rod 12mm"); // low-stock item
    expect(sent[0].html).not.toContain("Copper Wire"); // dead but not low
    const logs = await prisma.emailLog.findMany({ where: { organizationId: ORG_ID } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("SENT");
  });

  it("returns false and sends nothing when no item is low", async () => {
    const org = await prisma.organization.create({
      data: { id: "org-no-stock", name: "NoStock", slug: "no-stock" },
    });
    const result = await notificationService.sendLowStockDigest(org.id);
    expect(result).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure.** `TZ=UTC DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx vitest run tests/integration/analytics/low-stock-notification.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/server/services/notification.service.ts`:**

```typescript
import { prisma } from "@/lib/db/prisma";
import { getEmailProvider } from "@/lib/email";
import { createLogger } from "@/lib/logger";
import { analyticsService } from "@/server/services/analytics.service";

const log = createLogger("notification-service");

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const notificationService = {
  /** Emails the org owner a low-stock digest. Returns true when a digest was sent. */
  async sendLowStockDigest(organizationId: string): Promise<boolean> {
    const stock = await analyticsService.getStockAnalytics(organizationId);
    if (stock.lowStockItems.length === 0) return false;

    const owner = await prisma.organizationMember.findFirst({
      where: { organizationId, role: "owner" },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    });
    if (!owner?.user.email) {
      log.warn("Low-stock digest skipped: no owner email", { organizationId });
      return false;
    }

    const rows = stock.lowStockItems
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.name)}${i.sku ? ` (${escapeHtml(i.sku)})` : ""}</td>` +
          `<td align="right">${i.currentQty} ${escapeHtml(i.unit)}</td>` +
          `<td align="right">${i.reorderLevel ?? "-"} ${escapeHtml(i.unit)}</td></tr>`,
      )
      .join("");
    const subject = `Low stock alert: ${stock.lowStockItems.length} item(s) below reorder level`;
    const html =
      `<h2>Low stock alert</h2>` +
      `<p>The following items are below their reorder level:</p>` +
      `<table border="1" cellpadding="6" cellspacing="0">` +
      `<tr><th>Item</th><th>In stock</th><th>Reorder level</th></tr>${rows}</table>` +
      `<p>Review stock on your <a href="/dashboard/analytics">analytics page</a>.</p>`;

    const result = await getEmailProvider().send({ to: owner.user.email, subject, html });
    await prisma.emailLog.create({
      data: {
        organizationId,
        toEmail: owner.user.email,
        subject,
        bodyHtml: html,
        status: result.success ? "SENT" : "FAILED",
        providerId: result.id,
        sentAt: result.success ? new Date() : null,
      },
    });
    return result.success;
  },
};
```

- [ ] **Step 4: Run the test.** Expected: 2 tests PASS.

- [ ] **Step 5: Add the job events + scheduler method.** In `src/lib/jobs/types.ts` add to `JOB_EVENTS`:

```typescript
  LOW_STOCK_SCAN: "invoicepilot/stock.low-stock-scan",
  LOW_STOCK_CHECK: "invoicepilot/stock.low-stock-check",
```

and to the `JobScheduler` interface: `enqueueLowStockChecks(organizationIds: string[]): Promise<void>;`. In `src/lib/jobs/inngest/scheduler.ts` add to `InngestJobScheduler`:

```typescript
  async enqueueLowStockChecks(organizationIds: string[]): Promise<void> {
    if (organizationIds.length === 0) return;
    await inngest.send(
      organizationIds.map((organizationId) => ({
        name: JOB_EVENTS.LOW_STOCK_CHECK,
        data: { organizationId },
      })),
    );
  }
```

- [ ] **Step 6: Add the workflows** to `src/server/workflows/inngest/functions.ts` (import `notificationService`; reuse the existing `ORG_PAGE_SIZE` pagination exactly as `reminderScanWorkflow` does):

```typescript
export const lowStockScanWorkflow = inngest.createFunction(
  { id: "low-stock-scan", name: "Daily Low Stock Scan" },
  { cron: "0 8 * * *" },
  async ({ step }) => {
    let cursor: string | undefined;
    let dispatched = 0;
    for (let page = 0; ; page += 1) {
      const orgs: { id: string }[] = await step.run(`fetch-organizations-${page}`, () =>
        prisma.organization.findMany({
          where: { deletedAt: null },
          select: { id: true },
          orderBy: { id: "asc" },
          take: ORG_PAGE_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      );
      if (orgs.length === 0) break;
      await step.run(`dispatch-${page}`, () =>
        getJobScheduler().enqueueLowStockChecks(orgs.map((o) => o.id)),
      );
      dispatched += orgs.length;
      cursor = orgs[orgs.length - 1].id;
      if (orgs.length < ORG_PAGE_SIZE) break;
    }
    log.info("Low-stock scan dispatched", { organizations: dispatched });
    return { dispatched };
  },
);

export const lowStockCheckWorkflow = inngest.createFunction(
  { id: "low-stock-check", name: "Low Stock Check" },
  { event: JOB_EVENTS.LOW_STOCK_CHECK },
  async ({ event, step }) => {
    const organizationId = event.data.organizationId as string;
    const sent = await step.run("check-and-notify", () =>
      notificationService.sendLowStockDigest(organizationId),
    );
    return { organizationId, sent };
  },
);
```

Append both to the `inngestFunctions` export array.

- [ ] **Step 7: Verify.** `npm run typecheck` passes; `npm run dev` + `npx inngest-cli@latest dev` shows `low-stock-scan` and `low-stock-check` registered; trigger `invoicepilot/stock.low-stock-check` with `{"organizationId":"<dev org id>"}` from the Inngest dev UI and confirm a digest email is attempted (dev provider logs it).

- [ ] **Step 8: Commit**

```bash
git add src/lib/jobs src/server/services/notification.service.ts src/server/workflows/inngest/functions.ts tests/integration/analytics/low-stock-notification.test.ts
git commit -m "feat(analytics): daily low-stock Inngest job with owner email digest"
```

---

### Task 10: Analytics UI — Recharts Dashboard Page

> **STOP: read the `dataviz` skill via the Skill tool before writing any code in this task.** The palette module below ships neutral defaults; replace its hex values with the validated palette from the skill's `references/palette.md`, and apply the skill's form/mark/legend/tooltip rules when finishing each chart. Also note Phase 3's Stitch flow: generate/iterate the Analytics screen in the Stitch project ("InvoicePilot", IDs in `docs/design/DESIGN_SYSTEM.md`) before implementation, per parent plan Phase 3 gate.

**Files:**
- Create: `src/modules/analytics/palette.ts`
- Create: `src/modules/analytics/hooks/use-analytics.ts`
- Create: `src/modules/analytics/components/headline-tiles.tsx`
- Create: `src/modules/analytics/components/aging-chart.tsx`
- Create: `src/modules/analytics/components/collection-trend-chart.tsx`
- Create: `src/modules/analytics/components/cashflow-chart.tsx`
- Create: `src/modules/analytics/components/party-risk-table.tsx`
- Create: `src/modules/analytics/components/agent-leaderboard.tsx`
- Create: `src/modules/analytics/components/stock-panel.tsx`
- Create: `src/modules/analytics/components/analytics-view.tsx`
- Create: `src/app/dashboard/analytics/page.tsx`

**Interfaces:**
- Consumes: `GET /api/analytics/*` (Task 8), types from `src/types/analytics.ts`, existing `Card` components (`@/components/ui/card`), `formatCurrency` from `@/lib/utils/currency` (pass `"INR"`), TanStack Query provider already mounted by the app shell.
- Produces: route `/dashboard/analytics` (Task 11 smoke-tests it; Phase 3's nav links to it).

- [ ] **Step 1: Read the `dataviz` skill** (Skill tool). Then write `src/modules/analytics/palette.ts`:

```typescript
// Chart palette for analytics. Values below are placeholders — replace with the
// validated palette from the dataviz skill's references/palette.md before merge.
export const CHART_COLORS = {
  inflow: "#2563eb", // money coming in / receivable series
  outflow: "#d97706", // money going out / payable series
  neutral: "#64748b", // axes, gridlines, secondary marks
  positive: "#059669",
  negative: "#dc2626",
};
```

- [ ] **Step 2: Write `src/modules/analytics/hooks/use-analytics.ts`:**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  AgingReport, AgingSide, CashflowProjection, CollectionTrendPoint,
  HeadlineTiles, PartyAnalytics, StockAnalytics,
} from "@/types/analytics";

async function fetchAnalytics<T>(path: string): Promise<T> {
  const res = await fetch(`/api/analytics/${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? "Failed to load analytics");
  return json.data as T;
}

const useAnalytics = <T,>(path: string) =>
  useQuery<T>({ queryKey: ["analytics", path], queryFn: () => fetchAnalytics<T>(path), staleTime: 60_000 });

export const useHeadlineTiles = () => useAnalytics<HeadlineTiles>("headline");
export const useAgingReport = (side: AgingSide) => useAnalytics<AgingReport>(`aging?side=${side}`);
export const useCollectionTrend = () => useAnalytics<CollectionTrendPoint[]>("trend");
export const useCashflowProjection = () => useAnalytics<CashflowProjection>("cashflow");
export const usePartyAnalytics = () => useAnalytics<PartyAnalytics>("parties");
export const useStockAnalytics = () => useAnalytics<StockAnalytics>("stock");
```

- [ ] **Step 3: Write `headline-tiles.tsx`** (stat tiles per the dataviz skill's tile guidance — value dominant, label quiet, no decoration):

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { useHeadlineTiles } from "../hooks/use-analytics";

export function HeadlineTiles() {
  const { data, isLoading } = useHeadlineTiles();

  const tiles = [
    { label: "Money to come", value: data ? formatCurrency(data.moneyToCome, "INR") : "—" },
    { label: "Money to pay", value: data ? formatCurrency(data.moneyToPay, "INR") : "—" },
    {
      label: "Invoices pending",
      value: data ? `${data.pendingInvoices.count}` : "—",
      sub: data ? formatCurrency(data.pendingInvoices.value, "INR") : undefined,
    },
    { label: "Overdue value", value: data ? formatCurrency(data.overdueValue, "INR") : "—" },
    { label: "Collected this month", value: data ? formatCurrency(data.collectedThisMonth, "INR") : "—" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-busy={isLoading}>
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{t.value}</div>
            {t.sub && <div className="text-sm text-muted-foreground tabular-nums">{t.sub}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `aging-chart.tsx`** (grouped bars, receivable vs payable per bucket):

```tsx
"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CHART_COLORS } from "../palette";
import { useAgingReport } from "../hooks/use-analytics";

const BUCKET_LABELS: Record<string, string> = {
  CURRENT: "Not due", "0_30": "0-30", "31_60": "31-60", "61_90": "61-90", "90_PLUS": "90+",
};

export function AgingChart() {
  const receivable = useAgingReport("RECEIVABLE");
  const payable = useAgingReport("PAYABLE");
  if (!receivable.data || !payable.data) return <Card className="h-[360px]" />;

  const data = receivable.data.buckets.map((b, i) => ({
    bucket: BUCKET_LABELS[b.label],
    receivable: b.amount,
    payable: payable.data!.buckets[i].amount,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Aging — receivables vs payables
          {receivable.data.dso != null && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">DSO {receivable.data.dso} days</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="bucket" stroke={CHART_COLORS.neutral} fontSize={12} />
            <YAxis stroke={CHART_COLORS.neutral} fontSize={12} tickFormatter={(v: number) => formatCurrency(v, "INR")} width={90} />
            <Tooltip formatter={(v: number) => formatCurrency(v, "INR")} />
            <Legend />
            <Bar dataKey="receivable" name="Receivable" fill={CHART_COLORS.inflow} radius={[4, 4, 0, 0]} />
            <Bar dataKey="payable" name="Payable" fill={CHART_COLORS.outflow} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Write `collection-trend-chart.tsx`** (bars invoiced vs collected by month):

```tsx
"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CHART_COLORS } from "../palette";
import { useCollectionTrend } from "../hooks/use-analytics";

export function CollectionTrendChart() {
  const { data } = useCollectionTrend();
  if (!data) return <Card className="h-[360px]" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collection trend (6 months)</CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="month" stroke={CHART_COLORS.neutral} fontSize={12} />
            <YAxis stroke={CHART_COLORS.neutral} fontSize={12} tickFormatter={(v: number) => formatCurrency(v, "INR")} width={90} />
            <Tooltip formatter={(v: number) => formatCurrency(v, "INR")} />
            <Legend />
            <Bar dataKey="invoiced" name="Invoiced" fill={CHART_COLORS.neutral} radius={[4, 4, 0, 0]} />
            <Bar dataKey="collected" name="Collected" fill={CHART_COLORS.positive} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Write `cashflow-chart.tsx`:**

```tsx
"use client";

import { Bar, BarChart, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CHART_COLORS } from "../palette";
import { useCashflowProjection } from "../hooks/use-analytics";

export function CashflowChart() {
  const { data } = useCashflowProjection();
  if (!data) return <Card className="h-[360px]" />;

  const chartData = data.weeks.map((w) => ({ ...w, outflow: -w.outflow }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash-flow projection (8 weeks)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Already overdue: {formatCurrency(data.overdue.inflow, "INR")} to collect ·{" "}
          {formatCurrency(data.overdue.outflow, "INR")} to pay
        </p>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} stackOffset="sign">
            <XAxis dataKey="weekStart" stroke={CHART_COLORS.neutral} fontSize={12} />
            <YAxis stroke={CHART_COLORS.neutral} fontSize={12} tickFormatter={(v: number) => formatCurrency(v, "INR")} width={90} />
            <Tooltip formatter={(v: number) => formatCurrency(Math.abs(v), "INR")} />
            <Legend />
            <ReferenceLine y={0} stroke={CHART_COLORS.neutral} />
            <Bar dataKey="inflow" name="Expected in" stackId="flow" fill={CHART_COLORS.inflow} />
            <Bar dataKey="outflow" name="Due out" stackId="flow" fill={CHART_COLORS.outflow} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Write the tables.** `party-risk-table.tsx`:

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { usePartyAnalytics } from "../hooks/use-analytics";

const FLAG_LABELS: Record<string, string> = {
  OVER_CREDIT_LIMIT: "Over credit limit",
  HABITUAL_LATE: "Habitually late",
};

export function PartyRiskTable() {
  const { data } = usePartyAnalytics();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Party exposure & payment behavior</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4">Party</th>
              <th className="py-2 pr-4 text-right">Receivable</th>
              <th className="py-2 pr-4 text-right">Payable</th>
              <th className="py-2 pr-4 text-right">Avg days to pay</th>
              <th className="py-2 pr-4 text-right">On-time %</th>
              <th className="py-2">Risk</th>
            </tr>
          </thead>
          <tbody>
            {(data?.parties ?? []).map((p) => (
              <tr key={p.partyId} className="border-b last:border-0">
                <td className="py-2 pr-4">{p.partyName}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(p.receivableExposure, "INR")}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(p.payableExposure, "INR")}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{p.avgDaysToPay ?? "—"}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{p.onTimePct != null ? `${p.onTimePct}%` : "—"}</td>
                <td className="py-2">
                  {p.riskFlags.map((f) => (
                    <span key={f} className="mr-1 rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                      {FLAG_LABELS[f]}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

`agent-leaderboard.tsx` — same table pattern over `data?.agents` with columns Agent / Collected / Outstanding / Parties (rows keyed by `agentId`, money via `formatCurrency(..., "INR")`, card title "Agent leaderboard"). Write it out in full following the structure above.

- [ ] **Step 8: Write `stock-panel.tsx`:**

```tsx
"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CHART_COLORS } from "../palette";
import { useStockAnalytics } from "../hooks/use-analytics";

export function StockPanel() {
  const { data } = useStockAnalytics();
  if (!data) return <Card className="h-[360px]" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Stock — valuation {formatCurrency(data.totalValuation, "INR")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.movementTrend}>
              <XAxis dataKey="month" stroke={CHART_COLORS.neutral} fontSize={12} />
              <YAxis stroke={CHART_COLORS.neutral} fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="inQty" name="In" fill={CHART_COLORS.inflow} radius={[4, 4, 0, 0]} />
              <Bar dataKey="outQty" name="Out" fill={CHART_COLORS.outflow} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-medium">Low stock</h3>
            {data.lowStockItems.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
            <ul className="text-sm">
              {data.lowStockItems.map((i) => (
                <li key={i.itemId}>
                  {i.name}: {i.currentQty} {i.unit} (reorder at {i.reorderLevel})
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium">Dead stock (no movement 90d)</h3>
            {data.deadStockItems.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
            <ul className="text-sm">
              {data.deadStockItems.map((i) => (
                <li key={i.itemId}>
                  {i.name}: {i.currentQty} {i.unit} · {formatCurrency(i.valuation, "INR")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 9: Compose.** `analytics-view.tsx`:

```tsx
"use client";

import { HeadlineTiles } from "./headline-tiles";
import { AgingChart } from "./aging-chart";
import { CollectionTrendChart } from "./collection-trend-chart";
import { CashflowChart } from "./cashflow-chart";
import { PartyRiskTable } from "./party-risk-table";
import { AgentLeaderboard } from "./agent-leaderboard";
import { StockPanel } from "./stock-panel";

export function AnalyticsView() {
  return (
    <div className="space-y-6">
      <HeadlineTiles />
      <div className="grid gap-6 lg:grid-cols-2">
        <AgingChart />
        <CashflowChart />
        <CollectionTrendChart />
        <StockPanel />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <PartyRiskTable />
        <AgentLeaderboard />
      </div>
    </div>
  );
}
```

`src/app/dashboard/analytics/page.tsx`:

```tsx
import { AnalyticsView } from "@/modules/analytics/components/analytics-view";

export const metadata = { title: "Analytics — InvoicePilot" };

export default function AnalyticsPage() {
  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <AnalyticsView />
    </main>
  );
}
```

Also add an "Analytics" nav item pointing at `/dashboard/analytics` in the dashboard navigation component Phase 3 established (the app shell's sidebar/nav list — one entry, `BarChart3` icon from `lucide-react`).

- [ ] **Step 10: Verify against the fixture with your own eyes.** `npm run db:seed:analytics` into the dev DB, sign in to an account attached to `org-analytics-fixture` (or temporarily point your dev org — simplest: update the fixture org's member to your dev user with `npx prisma studio`), open `/dashboard/analytics`, and check the tiles read exactly: Money to come ₹75,000 · Money to pay ₹23,000 · Invoices pending 4 (₹75,000) · Overdue ₹35,000 · Collected this month ₹15,000; aging bars 40000/15000/8000/0/12000; DSO 86.5. Check dark mode and a narrow viewport (charts must not overflow horizontally).

- [ ] **Step 11: Lint, typecheck, build, commit**

```bash
npm run lint && npm run typecheck && npm run build
git add src/modules/analytics src/app/dashboard/analytics
git commit -m "feat(analytics): analytics dashboard page with Recharts (dataviz-skill styled)"
```

---

### Task 11: Playwright Smoke Test

**Files:**
- Create: `tests/e2e/analytics.spec.ts`

**Interfaces:**
- Consumes: the Playwright config + authenticated `storageState` fixture Phase 3 established for its per-screen smoke tests (same login mechanism — do not invent a new one), and the seeded fixture org from Task 2.

- [ ] **Step 1: Write `tests/e2e/analytics.spec.ts`:**

```typescript
import { test, expect } from "@playwright/test";

test.describe("analytics page", () => {
  test("renders headline tiles, charts, and tables", async ({ page }) => {
    await page.goto("/dashboard/analytics");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText("Money to come")).toBeVisible();
    await expect(page.getByText("Money to pay")).toBeVisible();
    await expect(page.getByText("Overdue value")).toBeVisible();
    await expect(page.getByText("Collected this month")).toBeVisible();
    await expect(page.getByText("Aging — receivables vs payables")).toBeVisible();
    await expect(page.getByText("Cash-flow projection (8 weeks)")).toBeVisible();
    await expect(page.getByText("Collection trend (6 months)")).toBeVisible();
    await expect(page.getByText("Party exposure & payment behavior")).toBeVisible();
    await expect(page.getByText("Agent leaderboard")).toBeVisible();
    // No client-side crash: at least one Recharts SVG rendered.
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it.** `npx playwright test tests/e2e/analytics.spec.ts` (dev server + seeded DB running, per the Phase 3 e2e README). Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/analytics.spec.ts
git commit -m "test(analytics): playwright smoke test for analytics page"
```

---

### Task 12: Phase Gate — Full Reconciliation & Sign-off

The parent plan's gate: **every tile reconciles against a hand-computed value on seeded fixture data (unit-tested aggregates).**

**Files:**
- Modify: `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (tick Phase 5)
- Create: `docs/setup/PHASE-5-GATE.md`

- [ ] **Step 1: Run the full reconciliation suite** against the fixture:

```bash
TZ=UTC DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx vitest run tests/integration/analytics
```

Expected: `fixture`, `headline`, `aging`, `trend-cashflow`, `parties`, `stock`, `low-stock-notification` — all PASS. Every asserted number traces to the hand-computed tables in Task 2 of this plan.

- [ ] **Step 2: Run the whole quality bar:** `npm run lint && npm run typecheck && npm run build && npx vitest run && npx playwright test` — Expected: all green (including all pre-Phase-5 suites).

- [ ] **Step 3: UI reconciliation walk** (repeat Task 10 Step 10 as a formal check): with the fixture seeded, verify on screen — the 5 headline tiles, both aging sides (toggle by checking payable numbers in the grouped bars), DSO 86.5, trend bar for 2026-04 showing ₹8,000 invoiced / ₹5,000 collected, cashflow overdue line "₹35,000 to collect · ₹5,000 to pay", p2 flagged "Over credit limit", p1 flagged "Habitually late", agent Anil ₹20,000 collected, stock valuation ₹12,060 with Steel Rod low-stock and Copper Wire dead-stock. Record each check in `docs/setup/PHASE-5-GATE.md` (status table + any deviations).

- [ ] **Step 4: Tick Phase 5** in the master plan's sequencing section notes and write the go/no-go recommendation in `PHASE-5-GATE.md`. **USER ACTION — user signs off** (name + date in the gate doc). Phase 6's detailed plan may now be written; hand Phase 6 the "Produces" method list from the Cross-Phase Interface Contract section verbatim.

- [ ] **Step 5: Commit**

```bash
git add docs/setup/PHASE-5-GATE.md docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md
git commit -m "docs: Phase 5 gate — analytics reconciled against hand-computed fixture"
```

---

## Self-Review Notes

- **Spec coverage:** parent Phase 5 item 1 (headline tiles) → Tasks 3, 10; item 2 (aging/DSO/collection trend/cashflow) → Tasks 4, 5, 10; item 3 (party/agent analytics, leaderboard via `agentId`, risk flags) → Task 6, 10; item 4 (stock + valuation, movement trends, low-stock Inngest daily job → notification, dead stock) → Tasks 7, 9, 10; item 5 (SQL aggregates in `analytics.service`, `unstable_cache` short TTL, Recharts per dataviz skill) → Tasks 3–8, 10; gate (hand-computed reconciliation on seeded fixture) → Tasks 2, 12.
- **Contract fidelity:** the five contract method names are used verbatim; `getCollectionTrend` is an addition beyond the contract's "e.g." list (the collection-rate trend needed a home and doesn't belong inside `getAgingReport`), and DSO is folded into `AgingReport` — both recorded here for the Phase 6 plan author. Redis was named as a cache option in the master plan; `unstable_cache` + per-org tags chosen since it needs no new infra and the master offered either ("unstable_cache/Redis").
- **Type consistency checked:** `HeadlineTiles`/`AgingReport`/`CollectionTrendPoint`/`CashflowProjection`/`PartyAnalytics`/`StockAnalytics` defined once in Task 1 and imported by Tasks 3–10; `expected.ts` literals typed against them so a drift fails typecheck.
- **Known dependency risk:** exact Phase 1 Prisma field names (`issueDate`, `movementDate`, `direction`, `date`) are assumed and centralized in the Cross-Phase Interface Contract's "Consumes" table — Task 2 Step 6 is the designated fail-fast point to reconcile any renames before service code exists.
- Placeholder scan done: every code step contains complete code; the two "follow the structure above" spots (Task 8 remaining routes, Task 10 agent-leaderboard) name the exact deltas (cache key + service call; columns + data field) against fully-shown siblings in the same task.
