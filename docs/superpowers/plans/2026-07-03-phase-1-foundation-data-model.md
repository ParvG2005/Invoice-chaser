# Phase 1: Foundation Hardening & Core Data Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent plan:** `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (read its Phase 1 section and §0.3 data-model blueprint before starting; §0.3 model names are canonical).
>
> **Hard ordering rule:** Task 1 and Task 2 (framework upgrade) must be fully green — app builds and runs identically — **before any schema work begins** (Tasks 4+). Do not interleave.

**Goal:** Upgrade the toolchain to current stable (Node 26 / Next 16 / React 19.2 / TS 6 / Prisma 7 / Tailwind 4.3), then land the tested, migrated party-centric data model (Party, Item/Stock, Payment with allocations, Bill), audit logging, RBAC, and CI with tests + `prisma migrate deploy` — with all existing invoice/reminder features still working.

**Architecture:** All new code follows the existing layering exactly: `app/api` route → `lib/api/handler` → `server/services` → `server/repositories` → Prisma. Services are plain object literals (`export const xService = {...}`), repositories are thin Prisma wrappers, every query is org-scoped inside the repository, soft deletes via `deletedAt`. New tables are created nullable/additive so the migration is non-destructive; `clientName` → `Party` backfill runs as a separate idempotent script; legacy client columns stay until a later phase verifies parity.

**Tech Stack:** Node 26 LTS, Next.js 16.2.x, React 19.2, TypeScript 6, Prisma 7 + Postgres, Tailwind 4.3, Vitest (+ jsdom for the XML parser), Clerk, Inngest, Zod.

## Global Constraints

(Copied from the parent plan — every task's requirements implicitly include these.)

- Version floors: Node >= 26 (LTS), Next.js >= 16.2, React >= 19.2, TypeScript >= 6.0, Prisma >= 7.8, Tailwind >= 4.3. Pin Node via `.nvmrc`/`engines`; keep dependencies on latest stable at each phase start.
- Multi-tenant: every new table carries `organization_id`; every query is org-scoped at the repository layer. No cross-org data access, ever.
- All money columns `Decimal(12,2)`; all quantities `Decimal(12,3)`; currency INR-first but stored with a `currency` code.
- Soft deletes (`deleted_at`) on all business entities, matching existing convention.
- All writes performed by the AI assistant require explicit user approval (Phase 7 guardrails) — Phase 1 only creates the `Assistant*` tables.
- Existing layered convention preserved: `app/api` route → `lib/api/handler` → `server/services` → `server/repositories` → Prisma.
- Secrets only in env vars / provider credential stores; never in code, prompts, or logs.
- TDD for all service/parser code.
- `graphify update .` is skipped: `graphify-out/` was removed from the repo on 2026-07-03 (see Phase 0 plan self-review notes); the stale CLAUDE.md section is being retired in Phase 0 Task 10.

## Cross-Phase Interface Contract

Later phase plans are written in parallel against these exact names. Use them verbatim:

- **Models (exactly as parent §0.3):** `Party`, `Item`, `StockMovement`, `InvoiceLineItem`, `Bill`, `Payment`, `PaymentAllocation`, `CommunicationLog`, `ImportBatch`, `ImportRecord`, `AuditLog`, `AssistantSession`, `AssistantMessage`, `AssistantAction`.
- **Services:** `src/server/services/party.service.ts`, `item.service.ts`, `stock.service.ts`, `payment.service.ts` (with `allocatePayment` logic), `bill.service.ts`, `audit.service.ts` (helper: `withAudit(actor, action, entity, fn)`).
- **Repositories mirror services:** `src/server/repositories/party.repository.ts`, `item.repository.ts`, `stock.repository.ts`, `payment.repository.ts`, `bill.repository.ts`, `audit-log.repository.ts`.
- **Every service method's first param is `organizationId: string`.**

## File Map (created/modified this phase)

```
.nvmrc                                        (verify/create — Node pin)
package.json                                  (upgrades, scripts: test, pages-build)
vitest.config.ts                              (new)
prisma/schema.prisma                          (Prisma 7 generator + all new models)
prisma/migrations/0_init/migration.sql        (baseline of pre-phase schema)
prisma/migrations/<ts>_phase1_core_data_model/ (the big migration)
scripts/backfill-parties.ts                   (new — clientName → Party)
src/lib/db/prisma.ts                          (Prisma 7 import path)
src/lib/auth/roles.ts                         (new — Role, hasRole)
src/lib/api/handler.ts                        (RBAC: role in context, requiredRole option)
src/lib/validations/party.ts item.ts stock.ts payment.ts bill.ts   (new zod schemas)
src/server/services/mappers.ts                (add toPartyDto/toItemDto/toBillDto/toPaymentDto)
src/server/services/audit.service.ts          (new — withAudit)
src/server/services/party.service.ts item.service.ts stock.service.ts
                     bill.service.ts payment.service.ts payment-allocation.ts   (new)
src/server/repositories/audit-log.repository.ts party.repository.ts item.repository.ts
                        stock.repository.ts bill.repository.ts payment.repository.ts (new)
src/server/services/organization.service.ts   (return membership role)
src/app/api/{invoices,reminders,ai}/**/route.ts (requiredRole on mutating routes)
src/lib/import/party-backfill.ts              (new — pure grouping logic)
tests/unit/*.test.ts                          (new — all unit tests live here)
.github/workflows/ci.yml                      (extend with test job + migrate check)
docs/setup/PHASE-1-GATE.md                    (gate record)
```

---

### Task 1: Framework Upgrade — Node 26, Next 16, React 19.2, TS 6, Tailwind 4.3

**Files:**
- Create/verify: `.nvmrc`
- Modify: `package.json`, `next.config.ts` (only if codemod requires), any files the Next codemod touches
- Do NOT touch: `prisma/**` (Prisma is Task 2)

**Interfaces:**
- Produces: a repo that builds and runs identically on the new toolchain; the route table baseline used by Task 2 and the gate.

- [ ] **Step 1: Verify/pin Node 26.** If Phase 0 already created `.nvmrc`, verify it; otherwise create it containing exactly:

```
26
```

In `package.json`, ensure:

```json
"engines": { "node": ">=26" }
```

and that `scripts` contains `"typecheck": "tsc --noEmit"` (added in Phase 0 Task 3; add it if missing). Switch your shell: `nvm install 26 && nvm use 26`. Run `node --version` — Expected: `v26.x.x`.

- [ ] **Step 2: Capture the pre-upgrade baseline.** With the current `.env`:

```bash
npm ci
npm run lint && npm run typecheck
npm run build 2>&1 | tee /tmp/build-before.txt
```

Expected: all pass. `/tmp/build-before.txt` contains the route table (`Route (app) ... ○ /dashboard ... ƒ /api/invoices ...`) — this is the "builds identically" reference.

- [ ] **Step 3: Run the Next.js upgrade codemod.**

```bash
npx @next/codemod@latest upgrade latest
```

Accept: upgrade to Next 16.2.x, React 19.2.x, and run the recommended codemods (async request APIs, config renames). Note: `src/lib/api/handler.ts` already awaits `routeContext.params` (it's typed `Promise<Record<string, string>>`), so route handlers should need no changes — verify rather than assume.

- [ ] **Step 4: Upgrade the rest of the toolchain (not Prisma).**

```bash
npm install typescript@^6 @types/node@^26 --save-dev
npm install tailwindcss@^4.3 @tailwindcss/postcss@^4.3 --save-dev
npm install eslint-config-next@^16 --save-dev
npm install @clerk/nextjs@latest inngest@latest @tanstack/react-query@latest zod@latest
```

Then `npm install` to settle the lockfile. If `zod@latest` is v4 and produces more than trivial type errors in `src/lib/validations/*`, pin back to `zod@^3` and record that in the commit message (zod 4 migration is not a Phase 1 goal).

- [ ] **Step 5: Fix compile/lint fallout.** Run:

```bash
npm run typecheck 2>&1 | head -50
```

Fix every error mechanically (import path renames, changed option names from the codemod output). Do not refactor anything beyond what compiles. Re-run until clean, then `npm run lint` (fix or `--fix`) until clean.

- [ ] **Step 6: Verify the app builds identically.**

```bash
npm run build 2>&1 | tee /tmp/build-after.txt
diff <(grep -E "^[├└┌]|^[ƒ○●]" /tmp/build-before.txt | sort) <(grep -E "^[├└┌]|^[ƒ○●]" /tmp/build-after.txt | sort)
```

Expected: build succeeds; the diff of route lines is empty (same pages/routes, same static/dynamic classification).

- [ ] **Step 7: Manual smoke.** `npm run dev`, sign in, load `/dashboard` and the invoices list, create one invoice, delete it. Expected: no runtime errors in terminal or browser console.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: upgrade to Node 26, Next 16, React 19.2, TS 6, Tailwind 4.3"
```

---

### Task 2: Prisma 6 → 7 Upgrade + Switch to `prisma migrate` Workflow

**Files:**
- Modify: `prisma/schema.prisma` (generator block only — no model changes)
- Modify: `src/lib/db/prisma.ts` and every file importing `@prisma/client`
- Create: `prisma/migrations/0_init/migration.sql` (baseline)
- Modify: `package.json`, `.gitignore`, `eslint.config.mjs` (ignore generated client)

**Interfaces:**
- Produces: Prisma 7 client generated to `src/generated/prisma`; all app code imports Prisma types from `@/generated/prisma/client`; a `0_init` baseline migration marked applied, so Task 4's migration is the first real one.

- [ ] **Step 1: Upgrade packages.**

```bash
npm install prisma@^7.8 @prisma/client@^7.8
```

- [ ] **Step 2: Switch the generator.** In `prisma/schema.prisma` replace the generator block:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

(Prisma 7 replaces `prisma-client-js` with the `prisma-client` generator, which emits TypeScript into your source tree. If `npx prisma generate` reports that `prisma-client-js` is still supported in the installed version with no deprecation error, you MAY keep `prisma-client-js` and skip Steps 3–4; record the choice in the commit message. The rest of this plan writes imports as `@/generated/prisma/client` — do a global mental substitution to `@prisma/client` if you kept the old generator.)

- [ ] **Step 3: Generate and rewrite imports.**

```bash
npx prisma generate
grep -rl "@prisma/client" src
```

Expected files (verify against grep output): `src/lib/db/prisma.ts`, `src/server/repositories/*.ts`, `src/server/services/mappers.ts`, `src/server/services/organization.service.ts`, possibly `src/types/index.ts`. Replace in each:

```bash
grep -rl "@prisma/client" src | xargs sed -i '' 's|from "@prisma/client"|from "@/generated/prisma/client"|g'
```

`src/lib/db/prisma.ts` becomes:

```typescript
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 4: Exclude generated code from lint/format/VCS churn.** Add to `.gitignore`:

```
# Prisma 7 generated client (regenerated by `prisma generate` on postinstall)
src/generated/
```

Add `"src/generated/**"` to the ESLint ignores (in `eslint.config.mjs`'s ignore list) and to `.prettierignore` (create the file if absent). `postinstall: prisma generate` and `build: prisma generate && next build` already exist in `package.json`, so CI/Cloudflare Pages regenerate it.

- [ ] **Step 5: Verify all repository queries still typecheck and run.**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: clean. Then `npm run dev`, load the invoices list and dashboard stats (exercises `findMany`, aggregates). Expected: data renders as before.

- [ ] **Step 6: Create the baseline migration.** The DB was managed with `prisma db push` (no `prisma/migrations/` exists). Baseline it so `migrate` can take over:

```bash
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
npx prisma migrate resolve --applied 0_init
npx prisma migrate status
```

Expected: `migrate status` reports `Database schema is up to date!` with 1 applied migration. **Note for prod:** the same `migrate resolve --applied 0_init` must be run once against the production DB before the first `migrate deploy` (this is a Task 13 gate step).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: upgrade to Prisma 7, generated client, migrate baseline"
```

---

### Task 3: Vitest + Characterization Tests (invoice.service, mappers, tally-parser)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (devDeps + `test` scripts)
- Test: `tests/unit/mappers.test.ts`, `tests/unit/invoice.service.test.ts`, `tests/unit/tally-parser.test.ts`

**Interfaces:**
- Produces: `npm test` (vitest run) with `@` alias resolution; the mocking pattern (`vi.mock` of repository modules) that Tasks 6–10 reuse; characterization tests that lock current behavior before schema refactors.

**Note on characterization tests:** unlike normal TDD these are expected to PASS immediately — they document what the code does today. If one fails, fix the *expectation* to match observed behavior (run the code, don't guess), never the production code.

- [ ] **Step 1: Install and configure Vitest.**

```bash
npm install --save-dev vitest jsdom
```

Create `vitest.config.ts`:

```typescript
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Write `tests/unit/mappers.test.ts`** (pure functions — no mocks):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseDueDate, computeInvoiceStatus } from "@/server/services/mappers";

describe("parseDueDate (characterization)", () => {
  it("treats a bare YYYY-MM-DD as noon UTC", () => {
    expect(parseDueDate("2026-07-15").toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("passes through ISO datetimes unchanged", () => {
    expect(parseDueDate("2026-07-15T09:30:00.000Z").toISOString()).toBe(
      "2026-07-15T09:30:00.000Z",
    );
  });
});

describe("computeInvoiceStatus (characterization)", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-07-03T00:00:00.000Z") }));
  afterEach(() => vi.useRealTimers());

  it("explicit PAID wins regardless of due date", () => {
    expect(computeInvoiceStatus(new Date("2020-01-01"), "PAID")).toBe("PAID");
  });

  it("explicit OVERDUE wins", () => {
    expect(computeInvoiceStatus(new Date("2099-01-01"), "OVERDUE")).toBe("OVERDUE");
  });

  it("past due date without explicit status is OVERDUE", () => {
    expect(computeInvoiceStatus(new Date("2026-07-01T00:00:00.000Z"))).toBe("OVERDUE");
  });

  it("future due date without explicit status is PENDING", () => {
    expect(computeInvoiceStatus(new Date("2026-07-10T00:00:00.000Z"))).toBe("PENDING");
  });

  it("explicit PENDING on a past date is still OVERDUE (current behavior)", () => {
    expect(computeInvoiceStatus(new Date("2026-07-01T00:00:00.000Z"), "PENDING")).toBe("OVERDUE");
  });
});
```

- [ ] **Step 3: Run it.**

```bash
npm test -- tests/unit/mappers.test.ts
```

Expected: PASS (all green). If the last test fails, the expectation is wrong — read `computeInvoiceStatus` and fix the test to the observed value.

- [ ] **Step 4: Write `tests/unit/invoice.service.test.ts`** — repository and scheduler mocked at module level (this is the pattern all later service tests copy):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoiceService } from "@/server/services/invoice.service";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";
import { NotFoundError } from "@/lib/api/errors";

vi.mock("@/server/repositories/invoice.repository", () => ({
  invoiceRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findByInvoiceNumbers: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    markOverdueBatch: vi.fn(),
  },
}));

vi.mock("@/lib/jobs/inngest/scheduler", () => ({
  getJobScheduler: vi.fn(),
}));

const ORG = "org-1";

function fakeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    organizationId: ORG,
    clientName: "Acme Traders",
    clientEmail: "billing@acme.test",
    clientPhone: null,
    amount: 1500.5, // decimalToNumber passes numbers through
    dueDate: new Date("2026-07-10T12:00:00.000Z"),
    invoiceNumber: "INV-001",
    notes: null,
    status: "PENDING",
    paidAt: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("invoiceService (characterization)", () => {
  const enqueueOverdueCheck = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-03T00:00:00.000Z") });
    vi.mocked(getJobScheduler).mockReturnValue({
      enqueueOverdueCheck,
      enqueueOverdueChecks: vi.fn(),
      enqueueReminder: vi.fn(),
    } as never);
  });
  afterEach(() => vi.useRealTimers());

  it("create computes OVERDUE for a past due date and enqueues an overdue check", async () => {
    vi.mocked(invoiceRepository.create).mockResolvedValue(
      fakeInvoice({ status: "OVERDUE" }) as never,
    );

    await invoiceService.create(ORG, {
      clientName: "Acme Traders",
      clientEmail: "billing@acme.test",
      amount: 1500.5,
      dueDate: "2026-06-01",
      invoiceNumber: "INV-001",
    });

    expect(invoiceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "OVERDUE", organization: { connect: { id: ORG } } }),
    );
    expect(enqueueOverdueCheck).toHaveBeenCalledWith(ORG);
  });

  it("get throws NotFoundError when the repo returns null", async () => {
    vi.mocked(invoiceRepository.findById).mockResolvedValue(null);
    await expect(invoiceService.get(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("get maps the invoice to a DTO with ISO date strings", async () => {
    vi.mocked(invoiceRepository.findById).mockResolvedValue(fakeInvoice() as never);
    const dto = await invoiceService.get(ORG, "inv-1");
    expect(dto).toMatchObject({
      id: "inv-1",
      amount: 1500.5,
      dueDate: "2026-07-10T12:00:00.000Z",
      status: "PENDING",
    });
  });

  it("update to PAID sets paidAt", async () => {
    vi.mocked(invoiceRepository.findById).mockResolvedValue(fakeInvoice() as never);
    vi.mocked(invoiceRepository.update).mockResolvedValue({ count: 1 } as never);

    await invoiceService.update(ORG, "inv-1", { status: "PAID" });

    expect(invoiceRepository.update).toHaveBeenCalledWith(
      ORG,
      "inv-1",
      expect.objectContaining({ status: "PAID", paidAt: expect.any(Date) }),
    );
  });

  it("remove throws NotFoundError when nothing was soft-deleted", async () => {
    vi.mocked(invoiceRepository.softDelete).mockResolvedValue({ count: 0 } as never);
    await expect(invoiceService.remove(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 5: Run it.**

```bash
npm test -- tests/unit/invoice.service.test.ts
```

Expected: PASS. If the scheduler mock shape mismatches, check `src/lib/jobs/inngest/scheduler.ts` for the real `JobScheduler` interface and adjust the mock object (keep `as never` casts minimal).

- [ ] **Step 6: Write `tests/unit/tally-parser.test.ts`** — the parser uses `DOMParser`, so this file runs under jsdom (per-file environment pragma):

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseTallyXml } from "@/lib/import/tally-parser";

function envelope(vouchers: string): string {
  return `<?xml version="1.0"?><ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>${vouchers}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

const SALES_VOUCHER = `
<VOUCHER VCHTYPE="Sales">
  <PARTYNAME>Sharma Textiles</PARTYNAME>
  <DATE>20260615</DATE>
  <VOUCHERNUMBER>SV-101</VOUCHERNUMBER>
  <NARRATION>June order</NARRATION>
  <ALLLEDGERENTRIES.LIST><AMOUNT>-18500.00</AMOUNT></ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST><AMOUNT>18500.00</AMOUNT></ALLLEDGERENTRIES.LIST>
</VOUCHER>`;

describe("parseTallyXml (characterization)", () => {
  it("parses a sales voucher: party, number, date, ledger-derived amount, narration", () => {
    const result = parseTallyXml(envelope(SALES_VOUCHER));
    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0]).toMatchObject({
      clientName: "Sharma Textiles",
      invoiceNumber: "SV-101",
      amount: 18500,
      dueDate: "2026-06-15",
      notes: "June order",
    });
    expect(result.warnings).toHaveLength(0);
  });

  it("counts missing emails and applies defaultEmail when given", () => {
    expect(parseTallyXml(envelope(SALES_VOUCHER)).missingEmailCount).toBe(1);
    const withDefault = parseTallyXml(envelope(SALES_VOUCHER), "fallback@org.test");
    expect(withDefault.missingEmailCount).toBe(0);
    expect(withDefault.invoices[0].clientEmail).toBe("fallback@org.test");
  });

  it("skips non-sales voucher types silently", () => {
    const payment = `<VOUCHER VCHTYPE="Payment"><PARTYNAME>X</PARTYNAME><DATE>20260601</DATE><AMOUNT>100</AMOUNT></VOUCHER>`;
    const result = parseTallyXml(envelope(payment));
    expect(result.invoices).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns and skips a voucher without a party name", () => {
    const noParty = `<VOUCHER VCHTYPE="Sales"><DATE>20260601</DATE><AMOUNT>100</AMOUNT></VOUCHER>`;
    const result = parseTallyXml(envelope(noParty));
    expect(result.invoices).toHaveLength(0);
    expect(result.warnings[0]).toContain("no PARTYNAME");
  });

  it("warns and skips when the date is unparseable", () => {
    const badDate = `<VOUCHER VCHTYPE="Sales"><PARTYNAME>Y</PARTYNAME><DATE>June-2026</DATE><AMOUNT>100</AMOUNT></VOUCHER>`;
    const result = parseTallyXml(envelope(badDate));
    expect(result.invoices).toHaveLength(0);
    expect(result.warnings[0]).toContain("could not parse date");
  });

  it("warns and skips when no positive amount can be extracted", () => {
    const noAmount = `<VOUCHER VCHTYPE="Sales"><PARTYNAME>Z</PARTYNAME><DATE>20260601</DATE><VOUCHERNUMBER>V1</VOUCHERNUMBER></VOUCHER>`;
    const result = parseTallyXml(envelope(noAmount));
    expect(result.invoices).toHaveLength(0);
    expect(result.warnings[0]).toContain("could not determine amount");
  });

  it("throws on invalid XML", () => {
    expect(() => parseTallyXml("<not-closed")).toThrow(/Invalid XML/);
  });
});
```

(Real Tally fixture files from Phase 0 Task 9 live in `tests/fixtures/tally/`; Phase 2's parser rewrite tests against those. These inline fixtures deliberately stay minimal and deterministic.)

- [ ] **Step 7: Run the full suite.**

```bash
npm test
```

Expected: 3 files, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts package.json package-lock.json tests/
git commit -m "test: add Vitest and characterization tests for invoice service and tally parser"
```

---

### Task 4: Prisma Migration — All §0.3 Blueprint Models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase1_core_data_model/migration.sql` (generated)

**Interfaces:**
- Produces: generated Prisma types for `Party`, `Item`, `StockMovement`, `InvoiceLineItem`, `Bill`, `Payment`, `PaymentAllocation`, `CommunicationLog`, `ImportBatch`, `ImportRecord`, `AuditLog`, `AssistantSession`, `AssistantMessage`, `AssistantAction`; enums `PartyType`, `InvoiceType`, `StockSourceType`, `PaymentDirection`, `PaymentMode`, `CommunicationChannel`, `CommunicationStatus`, `ImportSource`, `ImportBatchStatus`, `ImportRecordStatus`, `ActorType`, `AssistantMessageRole`, `AssistantActionStatus`; new nullable `Invoice` columns (`partyId`, `type`, `subtotal`, `taxAmount`, `totalAmount`, `amountPaid`, `currency`, `tallyGuid`). Everything additive/nullable — no existing column is altered or dropped.

- [ ] **Step 1: Add the new enums** to `prisma/schema.prisma` (below the existing enums):

```prisma
enum PartyType {
  CUSTOMER
  SUPPLIER
  AGENT
  BOTH
}

enum InvoiceType {
  RECEIVABLE
  PAYABLE
}

enum StockSourceType {
  INVOICE
  BILL
  ADJUSTMENT
  OPENING
}

enum PaymentDirection {
  IN
  OUT
}

enum PaymentMode {
  CASH
  BANK_TRANSFER
  UPI
  CHEQUE
  CARD
  OTHER
}

enum CommunicationChannel {
  EMAIL
  WHATSAPP
}

enum CommunicationStatus {
  QUEUED
  SENT
  DELIVERED
  READ
  FAILED
  BOUNCED
}

enum ImportSource {
  TALLY_XML
  CSV
}

enum ImportBatchStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  REVERTED
}

enum ImportRecordStatus {
  CREATED
  UPDATED
  SKIPPED
  ERRORED
}

enum ActorType {
  USER
  ASSISTANT
  SYSTEM
}

enum AssistantMessageRole {
  USER
  ASSISTANT
  SYSTEM
  TOOL
}

enum AssistantActionStatus {
  PROPOSED
  APPROVED
  REJECTED
  EXECUTED
  FAILED
}
```

- [ ] **Step 2: Add the new models** (append to `prisma/schema.prisma`):

```prisma
model Party {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  type           PartyType @default(CUSTOMER)
  name           String
  email          String?
  phone          String?
  whatsapp       String?
  gstin          String?
  billingAddress String?   @map("billing_address")
  creditLimit    Decimal?  @map("credit_limit") @db.Decimal(12, 2)
  creditDays     Int?      @map("credit_days")
  openingBalance Decimal?  @map("opening_balance") @db.Decimal(12, 2)
  notes          String?
  tallyGuid      String?   @map("tally_guid")
  agentId        String?   @map("agent_id")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  agent          Party?       @relation("PartyAgent", fields: [agentId], references: [id], onDelete: SetNull)
  managedParties Party[]      @relation("PartyAgent")
  invoices       Invoice[]
  bills          Bill[]
  payments       Payment[]

  @@unique([organizationId, name])
  @@unique([organizationId, tallyGuid])
  @@index([organizationId, type])
  @@index([organizationId, deletedAt])
  @@map("parties")
}

model Item {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  name           String
  sku            String?
  unit           String    @default("Nos")
  hsnCode        String?   @map("hsn_code")
  gstRate        Decimal?  @map("gst_rate") @db.Decimal(5, 2)
  openingQty     Decimal   @default(0) @map("opening_qty") @db.Decimal(12, 3)
  reorderLevel   Decimal?  @map("reorder_level") @db.Decimal(12, 3)
  purchasePrice  Decimal?  @map("purchase_price") @db.Decimal(12, 2)
  salePrice      Decimal?  @map("sale_price") @db.Decimal(12, 2)
  tallyGuid      String?   @map("tally_guid")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  organization   Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  stockMovements StockMovement[]
  lineItems      InvoiceLineItem[]

  @@unique([organizationId, name])
  @@unique([organizationId, tallyGuid])
  @@index([organizationId, deletedAt])
  @@map("items")
}

model StockMovement {
  id             String          @id @default(uuid())
  organizationId String          @map("organization_id")
  itemId         String          @map("item_id")
  qty            Decimal         @db.Decimal(12, 3)
  rate           Decimal?        @db.Decimal(12, 2)
  sourceType     StockSourceType @map("source_type")
  sourceId       String?         @map("source_id")
  godown         String?
  movementDate   DateTime        @default(now()) @map("movement_date")
  createdAt      DateTime        @default(now()) @map("created_at")
  deletedAt      DateTime?       @map("deleted_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  item         Item         @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@index([organizationId, itemId])
  @@index([organizationId, sourceType, sourceId])
  @@map("stock_movements")
}

model InvoiceLineItem {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  invoiceId      String    @map("invoice_id")
  itemId         String?   @map("item_id")
  description    String
  quantity       Decimal   @default(1) @db.Decimal(12, 3)
  rate           Decimal   @db.Decimal(12, 2)
  discount       Decimal   @default(0) @db.Decimal(12, 2)
  taxRate        Decimal   @default(0) @map("tax_rate") @db.Decimal(5, 2)
  amount         Decimal   @db.Decimal(12, 2)
  sortOrder      Int       @default(0) @map("sort_order")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  item    Item?   @relation(fields: [itemId], references: [id], onDelete: SetNull)

  @@index([organizationId, invoiceId])
  @@map("invoice_line_items")
}

model Bill {
  id             String        @id @default(uuid())
  organizationId String        @map("organization_id")
  partyId        String        @map("party_id")
  billNumber     String        @map("bill_number")
  billDate       DateTime?     @map("bill_date")
  dueDate        DateTime      @map("due_date")
  amount         Decimal       @db.Decimal(12, 2)
  amountPaid     Decimal       @default(0) @map("amount_paid") @db.Decimal(12, 2)
  currency       String        @default("INR")
  status         InvoiceStatus @default(PENDING)
  notes          String?
  tallyGuid      String?       @map("tally_guid")
  paidAt         DateTime?     @map("paid_at")
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")
  deletedAt      DateTime?     @map("deleted_at")

  organization Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  party        Party               @relation(fields: [partyId], references: [id], onDelete: Restrict)
  allocations  PaymentAllocation[]

  @@unique([organizationId, billNumber])
  @@unique([organizationId, tallyGuid])
  @@index([organizationId, status])
  @@index([organizationId, dueDate])
  @@map("bills")
}

model Payment {
  id             String           @id @default(uuid())
  organizationId String           @map("organization_id")
  partyId        String           @map("party_id")
  direction      PaymentDirection
  amount         Decimal          @db.Decimal(12, 2)
  unallocated    Decimal          @default(0) @db.Decimal(12, 2)
  mode           PaymentMode      @default(BANK_TRANSFER)
  paymentDate    DateTime         @default(now()) @map("payment_date")
  reference      String?
  notes          String?
  currency       String           @default("INR")
  tallyGuid      String?          @map("tally_guid")
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")
  deletedAt      DateTime?        @map("deleted_at")

  organization Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  party        Party               @relation(fields: [partyId], references: [id], onDelete: Restrict)
  allocations  PaymentAllocation[]

  @@unique([organizationId, tallyGuid])
  @@index([organizationId, partyId])
  @@index([organizationId, paymentDate])
  @@map("payments")
}

model PaymentAllocation {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  paymentId      String    @map("payment_id")
  invoiceId      String?   @map("invoice_id")
  billId         String?   @map("bill_id")
  amount         Decimal   @db.Decimal(12, 2)
  createdAt      DateTime  @default(now()) @map("created_at")
  deletedAt      DateTime? @map("deleted_at")

  payment Payment  @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  invoice Invoice? @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  bill    Bill?    @relation(fields: [billId], references: [id], onDelete: Cascade)

  @@index([organizationId, paymentId])
  @@index([invoiceId])
  @@index([billId])
  @@map("payment_allocations")
}

model CommunicationLog {
  id             String               @id @default(uuid())
  organizationId String               @map("organization_id")
  channel        CommunicationChannel
  toAddress      String               @map("to_address")
  templateId     String?              @map("template_id")
  subject        String?
  body           String?              @db.Text
  status         CommunicationStatus  @default(QUEUED)
  providerId     String?              @map("provider_id")
  errorMessage   String?              @map("error_message")
  partyId        String?              @map("party_id")
  invoiceId      String?              @map("invoice_id")
  reminderId     String?              @map("reminder_id")
  sentAt         DateTime?            @map("sent_at")
  createdAt      DateTime             @default(now()) @map("created_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  invoice      Invoice?     @relation(fields: [invoiceId], references: [id], onDelete: SetNull)
  reminder     Reminder?    @relation(fields: [reminderId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
  @@index([organizationId, invoiceId])
  @@index([providerId])
  @@map("communication_logs")
}

model ImportBatch {
  id             String            @id @default(uuid())
  organizationId String            @map("organization_id")
  source         ImportSource
  fileName       String?           @map("file_name")
  fileHash       String            @map("file_hash")
  status         ImportBatchStatus @default(PENDING)
  createdCount   Int               @default(0) @map("created_count")
  updatedCount   Int               @default(0) @map("updated_count")
  skippedCount   Int               @default(0) @map("skipped_count")
  errorCount     Int               @default(0) @map("error_count")
  errorSummary   String?           @map("error_summary") @db.Text
  startedAt      DateTime?         @map("started_at")
  completedAt    DateTime?         @map("completed_at")
  createdAt      DateTime          @default(now()) @map("created_at")
  updatedAt      DateTime          @updatedAt @map("updated_at")
  deletedAt      DateTime?         @map("deleted_at")

  organization Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  records      ImportRecord[]

  @@index([organizationId, createdAt])
  @@index([organizationId, fileHash])
  @@map("import_batches")
}

model ImportRecord {
  id             String             @id @default(uuid())
  organizationId String             @map("organization_id")
  batchId        String             @map("batch_id")
  recordType     String             @map("record_type")
  tallyGuid      String?            @map("tally_guid")
  alterId        String?            @map("alter_id")
  entityId       String?            @map("entity_id")
  status         ImportRecordStatus
  message        String?
  createdAt      DateTime           @default(now()) @map("created_at")

  batch ImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@index([organizationId, batchId])
  @@index([organizationId, tallyGuid])
  @@map("import_records")
}

model AuditLog {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  actorType      ActorType @map("actor_type")
  actorId        String?   @map("actor_id")
  action         String
  entityType     String    @map("entity_type")
  entityId       String?   @map("entity_id")
  before         Json?
  after          Json?
  createdAt      DateTime  @default(now()) @map("created_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, createdAt])
  @@index([organizationId, entityType, entityId])
  @@map("audit_logs")
}

model AssistantSession {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  userId         String    @map("user_id")
  title          String?
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages     AssistantMessage[]
  actions      AssistantAction[]

  @@index([organizationId, userId])
  @@map("assistant_sessions")
}

model AssistantMessage {
  id             String               @id @default(uuid())
  organizationId String               @map("organization_id")
  sessionId      String               @map("session_id")
  role           AssistantMessageRole
  content        Json
  tokensUsed     Int?                 @map("tokens_used")
  createdAt      DateTime             @default(now()) @map("created_at")

  session AssistantSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
  @@map("assistant_messages")
}

model AssistantAction {
  id             String                @id @default(uuid())
  organizationId String                @map("organization_id")
  sessionId      String                @map("session_id")
  messageId      String?               @map("message_id")
  toolName       String                @map("tool_name")
  input          Json
  status         AssistantActionStatus @default(PROPOSED)
  result         Json?
  errorMessage   String?               @map("error_message")
  approvedById   String?               @map("approved_by_id")
  approvedAt     DateTime?             @map("approved_at")
  executedAt     DateTime?             @map("executed_at")
  createdAt      DateTime              @default(now()) @map("created_at")
  updatedAt      DateTime              @updatedAt @map("updated_at")

  session AssistantSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([organizationId, status])
  @@index([sessionId, createdAt])
  @@map("assistant_actions")
}
```

- [ ] **Step 3: Extend the existing `Invoice`, `Organization`, `Reminder`, `User` models.** In `Invoice`, add these fields (all additive — keep every existing field including `clientName`/`clientEmail`/`clientPhone`/`amount`):

```prisma
  type        InvoiceType @default(RECEIVABLE)
  partyId     String?     @map("party_id")
  subtotal    Decimal?    @db.Decimal(12, 2)
  taxAmount   Decimal?    @map("tax_amount") @db.Decimal(12, 2)
  totalAmount Decimal?    @map("total_amount") @db.Decimal(12, 2)
  amountPaid  Decimal     @default(0) @map("amount_paid") @db.Decimal(12, 2)
  currency    String      @default("INR")
  tallyGuid   String?     @map("tally_guid")
```

and to `Invoice`'s relations block:

```prisma
  party             Party?              @relation(fields: [partyId], references: [id], onDelete: SetNull)
  lineItems         InvoiceLineItem[]
  allocations       PaymentAllocation[]
  communicationLogs CommunicationLog[]
```

and to `Invoice`'s index block:

```prisma
  @@index([organizationId, partyId])
  @@unique([organizationId, tallyGuid])
```

In `Organization`, add the back-relations:

```prisma
  parties           Party[]
  items             Item[]
  stockMovements    StockMovement[]
  bills             Bill[]
  payments          Payment[]
  communicationLogs CommunicationLog[]
  importBatches     ImportBatch[]
  auditLogs         AuditLog[]
  assistantSessions AssistantSession[]
```

In `Reminder`, add:

```prisma
  communicationLogs CommunicationLog[]
```

In `User`, add:

```prisma
  assistantSessions AssistantSession[]
```

- [ ] **Step 4: Validate and generate the migration.**

```bash
npx prisma validate
npx prisma migrate dev --name phase1_core_data_model
```

Expected: `prisma validate` prints "The schema ... is valid"; `migrate dev` creates `prisma/migrations/<ts>_phase1_core_data_model/migration.sql` and applies it to the dev DB with no data-loss warnings (everything is additive). Inspect the SQL: it must contain only `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`/`CREATE UNIQUE INDEX`, `ALTER TABLE "invoices" ADD COLUMN ...`, and `ADD CONSTRAINT` statements — **no `DROP` or `ALTER COLUMN` on existing columns.** If any appear, stop and fix the schema.

- [ ] **Step 5: Verify nothing regressed.**

```bash
npm run typecheck && npm test && npm run build
```

Expected: all green (the generated client gained models; no app code references them yet).

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat: add Phase 1 core data model (Party, Item, Stock, Bill, Payment, audit, import, assistant tables)"
```

---

### Task 5: Backfill Script — `clientName` → `Party`

**Files:**
- Create: `src/lib/import/party-backfill.ts` (pure grouping logic)
- Create: `scripts/backfill-parties.ts` (runner)
- Modify: `package.json` (add `tsx` devDep + `db:backfill-parties` script)
- Test: `tests/unit/party-backfill.test.ts`

**Interfaces:**
- Consumes: `Invoice` rows (`clientName`, `clientEmail`, `clientPhone`, `partyId`).
- Produces: `groupInvoicesForBackfill(invoices: BackfillInvoice[]): PartySeed[]` in `src/lib/import/party-backfill.ts`; an idempotent script `npm run db:backfill-parties` that creates `Party` rows and links `Invoice.partyId`. Task 13 (gate) reruns this against a prod copy.

- [ ] **Step 1: Write the failing test** `tests/unit/party-backfill.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npm test -- tests/unit/party-backfill.test.ts`
Expected: FAIL — `Cannot find module '@/lib/import/party-backfill'` (or equivalent).

- [ ] **Step 3: Implement** `src/lib/import/party-backfill.ts`:

```typescript
export interface BackfillInvoice {
  id: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
}

export interface PartySeed {
  name: string;
  email: string | null;
  phone: string | null;
  invoiceIds: string[];
}

/**
 * Groups invoices by normalized client name (trimmed, case-insensitive) into
 * Party seeds. First-seen display name wins; first non-empty email/phone win.
 */
export function groupInvoicesForBackfill(invoices: BackfillInvoice[]): PartySeed[] {
  const groups = new Map<string, PartySeed>();

  for (const invoice of invoices) {
    const displayName = invoice.clientName.trim();
    if (!displayName) continue;
    const key = displayName.toLowerCase();

    let group = groups.get(key);
    if (!group) {
      group = { name: displayName, email: null, phone: null, invoiceIds: [] };
      groups.set(key, group);
    }

    if (!group.email && invoice.clientEmail?.trim()) group.email = invoice.clientEmail.trim();
    if (!group.phone && invoice.clientPhone?.trim()) group.phone = invoice.clientPhone.trim();
    group.invoiceIds.push(invoice.id);
  }

  return Array.from(groups.values());
}
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `npm test -- tests/unit/party-backfill.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the runner** `scripts/backfill-parties.ts`:

```typescript
/**
 * Backfill: distinct Invoice.clientName/clientEmail/clientPhone → Party rows,
 * then link Invoice.partyId. Idempotent: only processes invoices with
 * partyId = null; reuses an existing Party when one matches by name.
 *
 * Run: npm run db:backfill-parties   (uses DATABASE_URL from .env)
 */
import { prisma } from "../src/lib/db/prisma";
import { groupInvoicesForBackfill } from "../src/lib/import/party-backfill";

async function main() {
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  let totalParties = 0;
  let totalLinked = 0;

  for (const org of orgs) {
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: org.id, deletedAt: null, partyId: null },
      select: { id: true, clientName: true, clientEmail: true, clientPhone: true },
    });
    if (invoices.length === 0) continue;

    const seeds = groupInvoicesForBackfill(invoices);

    for (const seed of seeds) {
      const linked = await prisma.$transaction(async (tx) => {
        // Match by normalized name against existing (incl. previously backfilled) parties.
        const existing = await tx.party.findFirst({
          where: {
            organizationId: org.id,
            deletedAt: null,
            name: { equals: seed.name, mode: "insensitive" },
          },
        });

        const party =
          existing ??
          (await tx.party.create({
            data: {
              organizationId: org.id,
              type: "CUSTOMER",
              name: seed.name,
              email: seed.email,
              phone: seed.phone,
            },
          }));

        if (!existing) totalParties++;

        const result = await tx.invoice.updateMany({
          where: { id: { in: seed.invoiceIds }, organizationId: org.id, partyId: null },
          data: { partyId: party.id },
        });
        return result.count;
      });
      totalLinked += linked;
    }
    console.log(`[${org.name}] processed ${invoices.length} invoices, ${seeds.length} parties`);
  }

  const remaining = await prisma.invoice.count({
    where: { deletedAt: null, partyId: null, clientName: { not: "" } },
  });
  console.log(`Done. Created ${totalParties} parties, linked ${totalLinked} invoices.`);
  console.log(`Invoices still unlinked (blank client name expected only): ${remaining}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

Install the runner and add the script:

```bash
npm install --save-dev tsx
```

In `package.json` scripts:

```json
"db:backfill-parties": "tsx scripts/backfill-parties.ts"
```

- [ ] **Step 6: Run against the dev DB and verify idempotency.**

```bash
npm run db:backfill-parties
npm run db:backfill-parties
```

Expected: first run prints created/linked counts matching your dev data; second run prints `Created 0 parties, linked 0 invoices.` Verify in `npx prisma studio` (or SQL): every non-deleted invoice with a non-blank clientName has `party_id` set.

- [ ] **Step 7: Commit**

```bash
git add src/lib/import/party-backfill.ts scripts/backfill-parties.ts tests/unit/party-backfill.test.ts package.json package-lock.json
git commit -m "feat: backfill clientName to Party with idempotent script"
```

---

### Task 6: AuditLog Repository + `withAudit` Helper

**Files:**
- Create: `src/server/repositories/audit-log.repository.ts`
- Create: `src/server/services/audit.service.ts`
- Test: `tests/unit/audit.service.test.ts`

**Interfaces:**
- Produces (used verbatim by Tasks 7–10 and Phase 6):

```typescript
// audit.service.ts
export interface AuditActor { type: "USER" | "ASSISTANT" | "SYSTEM"; id: string | null }
export const SYSTEM_ACTOR: AuditActor;
export interface AuditEntity { organizationId: string; entityType: string; entityId?: string; before?: unknown }
export function withAudit<T>(actor: AuditActor, action: string, entity: AuditEntity, fn: () => Promise<T>): Promise<T>
```

`withAudit` runs `fn`, then best-effort writes an `AuditLog` row (`after` = serialized result; `entityId` = `entity.entityId` or `result.id` when present). Audit-write failures are logged, never thrown — the business mutation must not be rolled back or masked by a logging failure.

- [ ] **Step 1: Write the failing test** `tests/unit/audit.service.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { withAudit, SYSTEM_ACTOR } from "@/server/services/audit.service";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";

vi.mock("@/server/repositories/audit-log.repository", () => ({
  auditLogRepository: { create: vi.fn() },
}));

const ORG = "org-1";

describe("withAudit", () => {
  it("returns fn's result and writes an audit row with entityId from the result", async () => {
    vi.mocked(auditLogRepository.create).mockResolvedValue({} as never);

    const result = await withAudit(
      { type: "USER", id: "user-1" },
      "party.create",
      { organizationId: ORG, entityType: "Party" },
      async () => ({ id: "party-9", name: "Acme" }),
    );

    expect(result).toEqual({ id: "party-9", name: "Acme" });
    expect(auditLogRepository.create).toHaveBeenCalledWith({
      organizationId: ORG,
      actorType: "USER",
      actorId: "user-1",
      action: "party.create",
      entityType: "Party",
      entityId: "party-9",
      before: undefined,
      after: { id: "party-9", name: "Acme" },
    });
  });

  it("prefers an explicit entityId and serializes before", async () => {
    vi.mocked(auditLogRepository.create).mockResolvedValue({} as never);

    await withAudit(
      SYSTEM_ACTOR,
      "invoice.update",
      { organizationId: ORG, entityType: "Invoice", entityId: "inv-1", before: { status: "PENDING" } },
      async () => ({ deleted: true }),
    );

    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "SYSTEM",
        actorId: null,
        entityId: "inv-1",
        before: { status: "PENDING" },
      }),
    );
  });

  it("does not audit when fn throws, and rethrows", async () => {
    await expect(
      withAudit(SYSTEM_ACTOR, "x", { organizationId: ORG, entityType: "X" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(auditLogRepository.create).not.toHaveBeenCalled();
  });

  it("swallows audit-write failures (mutation already committed)", async () => {
    vi.mocked(auditLogRepository.create).mockRejectedValue(new Error("db down"));
    const result = await withAudit(
      SYSTEM_ACTOR,
      "x",
      { organizationId: ORG, entityType: "X" },
      async () => "ok",
    );
    expect(result).toBe("ok");
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- tests/unit/audit.service.test.ts`
Expected: FAIL — module `@/server/services/audit.service` not found.

- [ ] **Step 3: Implement the repository** `src/server/repositories/audit-log.repository.ts`:

```typescript
import type { Prisma, ActorType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface CreateAuditLogData {
  organizationId: string;
  actorType: ActorType;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

export const auditLogRepository = {
  create(data: CreateAuditLogData) {
    return prisma.auditLog.create({ data });
  },

  findMany(organizationId: string, options: { take?: number; cursor?: string } = {}) {
    return prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: Math.min(options.take ?? 100, 500),
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },
};
```

- [ ] **Step 4: Implement the service** `src/server/services/audit.service.ts`:

```typescript
import type { ActorType, Prisma } from "@/generated/prisma/client";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";
import { createLogger } from "@/lib/logger";

const log = createLogger("audit-service");

export interface AuditActor {
  type: ActorType;
  id: string | null;
}

export const SYSTEM_ACTOR: AuditActor = { type: "SYSTEM", id: null };

export interface AuditEntity {
  organizationId: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
}

/** Strip Dates/Decimals/undefined so the value is valid Prisma JSON. */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Wraps a mutating service operation: runs `fn`, then writes one AuditLog row.
 * Every mutating service method in server/services MUST go through this.
 * Audit failures are logged but never thrown — the mutation already succeeded.
 */
export async function withAudit<T>(
  actor: AuditActor,
  action: string,
  entity: AuditEntity,
  fn: () => Promise<T>,
): Promise<T> {
  const result = await fn();

  const resultId =
    result && typeof result === "object" && "id" in result && typeof result.id === "string"
      ? result.id
      : undefined;

  try {
    await auditLogRepository.create({
      organizationId: entity.organizationId,
      actorType: actor.type,
      actorId: actor.id,
      action,
      entityType: entity.entityType,
      entityId: entity.entityId ?? resultId,
      before: toJson(entity.before),
      after: toJson(result),
    });
  } catch (error) {
    log.error("Failed to write audit log", {
      action,
      entityType: entity.entityType,
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  return result;
}
```

- [ ] **Step 5: Run tests.**

Run: `npm test -- tests/unit/audit.service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/audit-log.repository.ts src/server/services/audit.service.ts tests/unit/audit.service.test.ts
git commit -m "feat: add AuditLog repository and withAudit service helper"
```

---

### Task 7: Party Repository + Service

**Files:**
- Create: `src/lib/validations/party.ts`
- Create: `src/server/repositories/party.repository.ts`
- Create: `src/server/services/party.service.ts`
- Modify: `src/server/services/mappers.ts` (add `toPartyDto`)
- Test: `tests/unit/party.service.test.ts`

**Interfaces:**
- Consumes: `withAudit`, `AuditActor`, `SYSTEM_ACTOR` from Task 6.
- Produces (Phase 2 import and Phase 3 UI consume these exact signatures):

```typescript
partyService.list(organizationId: string, options?: { type?: PartyType; search?: string; take?: number; cursor?: string }): Promise<PartyDto[]>
partyService.get(organizationId: string, id: string): Promise<PartyDto>
partyService.create(organizationId: string, input: CreatePartyInput, actor?: AuditActor): Promise<PartyDto>
partyService.update(organizationId: string, id: string, input: UpdatePartyInput, actor?: AuditActor): Promise<PartyDto>
partyService.remove(organizationId: string, id: string, actor?: AuditActor): Promise<{ deleted: true }>
partyRepository.findByName(organizationId: string, name: string)  // case-insensitive, used by import + backfill
```

- [ ] **Step 1: Write validations** `src/lib/validations/party.ts`:

```typescript
import { z } from "zod";

export const partyTypeSchema = z.enum(["CUSTOMER", "SUPPLIER", "AGENT", "BOTH"]);

export const createPartySchema = z.object({
  type: partyTypeSchema.default("CUSTOMER"),
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  gstin: z.string().max(15).optional(),
  billingAddress: z.string().max(500).optional(),
  creditLimit: z.coerce.number().nonnegative().optional(),
  creditDays: z.coerce.number().int().nonnegative().optional(),
  openingBalance: z.coerce.number().optional(),
  notes: z.string().max(2000).optional(),
  agentId: z.string().uuid().optional(),
});

export const updatePartySchema = createPartySchema.partial();

export type CreatePartyInput = z.infer<typeof createPartySchema>;
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;
```

- [ ] **Step 2: Write the failing service test** `tests/unit/party.service.test.ts` (audit passthrough mock — the pattern for Tasks 8–10 too):

```typescript
import { describe, it, expect, vi } from "vitest";
import { partyService } from "@/server/services/party.service";
import { partyRepository } from "@/server/repositories/party.repository";
import { withAudit } from "@/server/services/audit.service";
import { NotFoundError, ValidationError } from "@/lib/api/errors";

vi.mock("@/server/repositories/party.repository", () => ({
  partyRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

vi.mock("@/server/services/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/audit.service")>();
  return {
    ...actual,
    withAudit: vi.fn((_actor, _action, _entity, fn) => fn()),
  };
});

const ORG = "org-1";

function fakeParty(overrides: Record<string, unknown> = {}) {
  return {
    id: "party-1",
    organizationId: ORG,
    type: "CUSTOMER",
    name: "Acme Traders",
    email: "a@acme.test",
    phone: null,
    whatsapp: null,
    gstin: null,
    billingAddress: null,
    creditLimit: null,
    creditDays: null,
    openingBalance: null,
    notes: null,
    tallyGuid: null,
    agentId: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("partyService", () => {
  it("create rejects a duplicate name in the same org", async () => {
    vi.mocked(partyRepository.findByName).mockResolvedValue(fakeParty() as never);
    await expect(
      partyService.create(ORG, { type: "CUSTOMER", name: "Acme Traders" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(partyRepository.create).not.toHaveBeenCalled();
  });

  it("create validates that agentId points to an AGENT/BOTH party in the org", async () => {
    vi.mocked(partyRepository.findByName).mockResolvedValue(null);
    vi.mocked(partyRepository.findById).mockResolvedValue(
      fakeParty({ id: "agent-1", type: "CUSTOMER" }) as never,
    );
    await expect(
      partyService.create(ORG, { type: "CUSTOMER", name: "New Co", agentId: "agent-1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("create persists and wraps in withAudit with action party.create", async () => {
    vi.mocked(partyRepository.findByName).mockResolvedValue(null);
    vi.mocked(partyRepository.create).mockResolvedValue(fakeParty() as never);

    const dto = await partyService.create(ORG, { type: "CUSTOMER", name: "Acme Traders" });

    expect(dto).toMatchObject({ id: "party-1", name: "Acme Traders", type: "CUSTOMER" });
    expect(withAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SYSTEM" }),
      "party.create",
      expect.objectContaining({ organizationId: ORG, entityType: "Party" }),
      expect.any(Function),
    );
  });

  it("get throws NotFoundError for a missing party", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue(null);
    await expect(partyService.get(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("remove throws NotFoundError when nothing was deleted", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue(fakeParty() as never);
    vi.mocked(partyRepository.softDelete).mockResolvedValue({ count: 0 } as never);
    await expect(partyService.remove(ORG, "party-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 3: Run to verify failure.**

Run: `npm test -- tests/unit/party.service.test.ts`
Expected: FAIL — `@/server/services/party.service` not found.

- [ ] **Step 4: Implement the repository** `src/server/repositories/party.repository.ts`:

```typescript
import type { PartyType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export const PARTY_PAGE_SIZE = 100;
export const PARTY_MAX_PAGE_SIZE = 500;

export interface PartyListOptions {
  type?: PartyType;
  search?: string;
  take?: number;
  cursor?: string;
}

export const partyRepository = {
  findMany(organizationId: string, options: PartyListOptions = {}) {
    const take = Math.min(options.take ?? PARTY_PAGE_SIZE, PARTY_MAX_PAGE_SIZE);
    return prisma.party.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.type ? { type: options.type } : {}),
        ...(options.search
          ? { name: { contains: options.search, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.party.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  },

  findByName(organizationId: string, name: string) {
    return prisma.party.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
      },
    });
  },

  create(data: Prisma.PartyCreateInput) {
    return prisma.party.create({ data });
  },

  update(organizationId: string, id: string, data: Prisma.PartyUpdateInput) {
    return prisma.party.updateMany({
      where: { id, organizationId, deletedAt: null },
      data,
    });
  },

  softDelete(organizationId: string, id: string) {
    return prisma.party.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },
};
```

- [ ] **Step 5: Add `toPartyDto`** to `src/server/services/mappers.ts` (append; also add the `PartyDto` interface to `src/types/index.ts` following the existing `InvoiceDto` style):

```typescript
// mappers.ts (append)
import type { Party } from "@/generated/prisma/client";

export function toPartyDto(party: Party): PartyDto {
  return {
    id: party.id,
    type: party.type,
    name: party.name,
    email: party.email,
    phone: party.phone,
    whatsapp: party.whatsapp,
    gstin: party.gstin,
    billingAddress: party.billingAddress,
    creditLimit: party.creditLimit === null ? null : decimalToNumber(party.creditLimit),
    creditDays: party.creditDays,
    openingBalance: party.openingBalance === null ? null : decimalToNumber(party.openingBalance),
    notes: party.notes,
    agentId: party.agentId,
    createdAt: party.createdAt.toISOString(),
    updatedAt: party.updatedAt.toISOString(),
  };
}
```

```typescript
// src/types/index.ts (append)
export interface PartyDto {
  id: string;
  type: "CUSTOMER" | "SUPPLIER" | "AGENT" | "BOTH";
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  gstin: string | null;
  billingAddress: string | null;
  creditLimit: number | null;
  creditDays: number | null;
  openingBalance: number | null;
  notes: string | null;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

(Import `PartyDto` in mappers.ts from `@/types` alongside the existing `InvoiceDto` import.)

- [ ] **Step 6: Implement the service** `src/server/services/party.service.ts`:

```typescript
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import type { CreatePartyInput, UpdatePartyInput } from "@/lib/validations/party";
import { partyRepository, type PartyListOptions } from "@/server/repositories/party.repository";
import { toPartyDto } from "@/server/services/mappers";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";

async function assertValidAgent(organizationId: string, agentId: string) {
  const agent = await partyRepository.findById(organizationId, agentId);
  if (!agent || (agent.type !== "AGENT" && agent.type !== "BOTH")) {
    throw new ValidationError("agentId must reference an AGENT or BOTH party in this organization");
  }
}

export const partyService = {
  async list(organizationId: string, options: PartyListOptions = {}) {
    const parties = await partyRepository.findMany(organizationId, options);
    return parties.map(toPartyDto);
  },

  async get(organizationId: string, id: string) {
    const party = await partyRepository.findById(organizationId, id);
    if (!party) throw new NotFoundError("Party not found");
    return toPartyDto(party);
  },

  async create(organizationId: string, input: CreatePartyInput, actor: AuditActor = SYSTEM_ACTOR) {
    const duplicate = await partyRepository.findByName(organizationId, input.name);
    if (duplicate) throw new ValidationError("A party with this name already exists");
    if (input.agentId) await assertValidAgent(organizationId, input.agentId);

    return withAudit(actor, "party.create", { organizationId, entityType: "Party" }, async () => {
      const party = await partyRepository.create({
        organization: { connect: { id: organizationId } },
        type: input.type,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        whatsapp: input.whatsapp ?? null,
        gstin: input.gstin ?? null,
        billingAddress: input.billingAddress ?? null,
        creditLimit: input.creditLimit ?? null,
        creditDays: input.creditDays ?? null,
        openingBalance: input.openingBalance ?? null,
        notes: input.notes ?? null,
        ...(input.agentId ? { agent: { connect: { id: input.agentId } } } : {}),
      });
      return toPartyDto(party);
    });
  },

  async update(
    organizationId: string,
    id: string,
    input: UpdatePartyInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const existing = await partyRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Party not found");

    if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await partyRepository.findByName(organizationId, input.name);
      if (duplicate) throw new ValidationError("A party with this name already exists");
    }
    if (input.agentId) await assertValidAgent(organizationId, input.agentId);

    return withAudit(
      actor,
      "party.update",
      { organizationId, entityType: "Party", entityId: id, before: toPartyDto(existing) },
      async () => {
        await partyRepository.update(organizationId, id, {
          type: input.type,
          name: input.name,
          email: input.email,
          phone: input.phone,
          whatsapp: input.whatsapp,
          gstin: input.gstin,
          billingAddress: input.billingAddress,
          creditLimit: input.creditLimit,
          creditDays: input.creditDays,
          openingBalance: input.openingBalance,
          notes: input.notes,
          agentId: input.agentId,
        });
        return this.get(organizationId, id);
      },
    );
  },

  async remove(organizationId: string, id: string, actor: AuditActor = SYSTEM_ACTOR) {
    const existing = await partyRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Party not found");

    return withAudit(
      actor,
      "party.delete",
      { organizationId, entityType: "Party", entityId: id, before: toPartyDto(existing) },
      async () => {
        const result = await partyRepository.softDelete(organizationId, id);
        if (result.count === 0) throw new NotFoundError("Party not found");
        return { deleted: true as const };
      },
    );
  },
};
```

- [ ] **Step 7: Run tests.**

Run: `npm test -- tests/unit/party.service.test.ts`
Expected: PASS (5 tests). Also run `npm run typecheck` — Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validations/party.ts src/server/repositories/party.repository.ts src/server/services/party.service.ts src/server/services/mappers.ts src/types/index.ts tests/unit/party.service.test.ts
git commit -m "feat: add Party repository and service with audit logging"
```

---

### Task 8: Item + Stock Repositories and Services

**Files:**
- Create: `src/lib/validations/item.ts`, `src/lib/validations/stock.ts`
- Create: `src/server/repositories/item.repository.ts`, `src/server/repositories/stock.repository.ts`
- Create: `src/server/services/item.service.ts`, `src/server/services/stock.service.ts`
- Modify: `src/server/services/mappers.ts`, `src/types/index.ts` (add `toItemDto`/`ItemDto`)
- Test: `tests/unit/item.service.test.ts`, `tests/unit/stock.service.test.ts`

**Interfaces:**
- Consumes: `withAudit` (Task 6).
- Produces (Phase 2 Tally masters/inventory import consumes these):

```typescript
itemService.list(organizationId, options?: { search?: string; take?: number; cursor?: string }): Promise<ItemDto[]>
itemService.get(organizationId, id): Promise<ItemDto>
itemService.create(organizationId, input: CreateItemInput, actor?): Promise<ItemDto>
itemService.update(organizationId, id, input: UpdateItemInput, actor?): Promise<ItemDto>
itemService.remove(organizationId, id, actor?): Promise<{ deleted: true }>
stockService.recordMovement(organizationId, input: RecordMovementInput, actor?): Promise<StockMovementDto>
stockService.getItemStock(organizationId, itemId): Promise<{ itemId: string; currentQty: number }>
stockService.listMovements(organizationId, itemId, options?: { take?: number; cursor?: string }): Promise<StockMovementDto[]>
```

- [ ] **Step 1: Write validations.** `src/lib/validations/item.ts`:

```typescript
import { z } from "zod";

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(100).optional(),
  unit: z.string().max(20).default("Nos"),
  hsnCode: z.string().max(20).optional(),
  gstRate: z.coerce.number().min(0).max(100).optional(),
  openingQty: z.coerce.number().default(0),
  reorderLevel: z.coerce.number().nonnegative().optional(),
  purchasePrice: z.coerce.number().nonnegative().optional(),
  salePrice: z.coerce.number().nonnegative().optional(),
});

export const updateItemSchema = createItemSchema.partial();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
```

`src/lib/validations/stock.ts`:

```typescript
import { z } from "zod";

export const stockSourceTypeSchema = z.enum(["INVOICE", "BILL", "ADJUSTMENT", "OPENING"]);

export const recordMovementSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.coerce.number().refine((v) => v !== 0, "qty must be non-zero (positive=in, negative=out)"),
  rate: z.coerce.number().nonnegative().optional(),
  sourceType: stockSourceTypeSchema.default("ADJUSTMENT"),
  sourceId: z.string().optional(),
  godown: z.string().max(100).optional(),
  movementDate: z.coerce.date().optional(),
});

export type RecordMovementInput = z.infer<typeof recordMovementSchema>;
```

- [ ] **Step 2: Write the failing tests.** `tests/unit/item.service.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { itemService } from "@/server/services/item.service";
import { itemRepository } from "@/server/repositories/item.repository";
import { NotFoundError, ValidationError } from "@/lib/api/errors";

vi.mock("@/server/repositories/item.repository", () => ({
  itemRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

vi.mock("@/server/services/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/audit.service")>();
  return { ...actual, withAudit: vi.fn((_a, _b, _c, fn) => fn()) };
});

const ORG = "org-1";

function fakeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    organizationId: ORG,
    name: "Cotton Fabric",
    sku: null,
    unit: "Mtr",
    hsnCode: null,
    gstRate: null,
    openingQty: 100,
    reorderLevel: null,
    purchasePrice: null,
    salePrice: null,
    tallyGuid: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("itemService", () => {
  it("create rejects duplicate names in the same org", async () => {
    vi.mocked(itemRepository.findByName).mockResolvedValue(fakeItem() as never);
    await expect(
      itemService.create(ORG, { name: "Cotton Fabric", unit: "Mtr", openingQty: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("create persists and returns a DTO", async () => {
    vi.mocked(itemRepository.findByName).mockResolvedValue(null);
    vi.mocked(itemRepository.create).mockResolvedValue(fakeItem() as never);
    const dto = await itemService.create(ORG, { name: "Cotton Fabric", unit: "Mtr", openingQty: 100 });
    expect(dto).toMatchObject({ id: "item-1", name: "Cotton Fabric", unit: "Mtr", openingQty: 100 });
  });

  it("get throws NotFoundError when missing", async () => {
    vi.mocked(itemRepository.findById).mockResolvedValue(null);
    await expect(itemService.get(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

`tests/unit/stock.service.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { stockService } from "@/server/services/stock.service";
import { stockRepository } from "@/server/repositories/stock.repository";
import { itemRepository } from "@/server/repositories/item.repository";
import { NotFoundError } from "@/lib/api/errors";

vi.mock("@/server/repositories/stock.repository", () => ({
  stockRepository: {
    createMovement: vi.fn(),
    listMovements: vi.fn(),
    sumQty: vi.fn(),
  },
}));

vi.mock("@/server/repositories/item.repository", () => ({
  itemRepository: { findById: vi.fn() },
}));

vi.mock("@/server/services/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/audit.service")>();
  return { ...actual, withAudit: vi.fn((_a, _b, _c, fn) => fn()) };
});

const ORG = "org-1";

describe("stockService", () => {
  it("recordMovement rejects an unknown item", async () => {
    vi.mocked(itemRepository.findById).mockResolvedValue(null);
    await expect(
      stockService.recordMovement(ORG, { itemId: "missing", qty: 5, sourceType: "ADJUSTMENT" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recordMovement persists and returns the movement DTO", async () => {
    vi.mocked(itemRepository.findById).mockResolvedValue({ id: "item-1", openingQty: 100 } as never);
    vi.mocked(stockRepository.createMovement).mockResolvedValue({
      id: "mv-1",
      organizationId: ORG,
      itemId: "item-1",
      qty: -5,
      rate: null,
      sourceType: "INVOICE",
      sourceId: "inv-1",
      godown: null,
      movementDate: new Date("2026-07-02T00:00:00.000Z"),
      createdAt: new Date("2026-07-02T00:00:00.000Z"),
      deletedAt: null,
    } as never);

    const dto = await stockService.recordMovement(ORG, {
      itemId: "item-1",
      qty: -5,
      sourceType: "INVOICE",
      sourceId: "inv-1",
    });
    expect(dto).toMatchObject({ id: "mv-1", itemId: "item-1", qty: -5, sourceType: "INVOICE" });
  });

  it("getItemStock = openingQty + sum of movements", async () => {
    vi.mocked(itemRepository.findById).mockResolvedValue({ id: "item-1", openingQty: 100 } as never);
    vi.mocked(stockRepository.sumQty).mockResolvedValue(-25.5);
    await expect(stockService.getItemStock(ORG, "item-1")).resolves.toEqual({
      itemId: "item-1",
      currentQty: 74.5,
    });
  });
});
```

- [ ] **Step 3: Run to verify failure.**

Run: `npm test -- tests/unit/item.service.test.ts tests/unit/stock.service.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement** `src/server/repositories/item.repository.ts`:

```typescript
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface ItemListOptions {
  search?: string;
  take?: number;
  cursor?: string;
}

export const itemRepository = {
  findMany(organizationId: string, options: ItemListOptions = {}) {
    return prisma.item.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.search
          ? { name: { contains: options.search, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: Math.min(options.take ?? 100, 500),
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.item.findFirst({ where: { id, organizationId, deletedAt: null } });
  },

  findByName(organizationId: string, name: string) {
    return prisma.item.findFirst({
      where: { organizationId, deletedAt: null, name: { equals: name, mode: "insensitive" } },
    });
  },

  create(data: Prisma.ItemCreateInput) {
    return prisma.item.create({ data });
  },

  update(organizationId: string, id: string, data: Prisma.ItemUpdateInput) {
    return prisma.item.updateMany({ where: { id, organizationId, deletedAt: null }, data });
  },

  softDelete(organizationId: string, id: string) {
    return prisma.item.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },
};
```

`src/server/repositories/stock.repository.ts`:

```typescript
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export const stockRepository = {
  createMovement(data: Prisma.StockMovementCreateInput) {
    return prisma.stockMovement.create({ data });
  },

  listMovements(
    organizationId: string,
    itemId: string,
    options: { take?: number; cursor?: string } = {},
  ) {
    return prisma.stockMovement.findMany({
      where: { organizationId, itemId, deletedAt: null },
      orderBy: [{ movementDate: "desc" }, { id: "desc" }],
      take: Math.min(options.take ?? 100, 500),
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },

  async sumQty(organizationId: string, itemId: string): Promise<number> {
    const result = await prisma.stockMovement.aggregate({
      where: { organizationId, itemId, deletedAt: null },
      _sum: { qty: true },
    });
    return result._sum.qty ? Number(result._sum.qty) : 0;
  },
};
```

- [ ] **Step 5: Add DTOs and mappers.** Append to `src/types/index.ts`:

```typescript
export interface ItemDto {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  hsnCode: string | null;
  gstRate: number | null;
  openingQty: number;
  reorderLevel: number | null;
  purchasePrice: number | null;
  salePrice: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovementDto {
  id: string;
  itemId: string;
  qty: number;
  rate: number | null;
  sourceType: "INVOICE" | "BILL" | "ADJUSTMENT" | "OPENING";
  sourceId: string | null;
  godown: string | null;
  movementDate: string;
  createdAt: string;
}
```

Append to `src/server/services/mappers.ts` (extend the existing generated-client import with `Item, StockMovement`):

```typescript
export function toItemDto(item: Item): ItemDto {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    hsnCode: item.hsnCode,
    gstRate: item.gstRate === null ? null : decimalToNumber(item.gstRate),
    openingQty: decimalToNumber(item.openingQty),
    reorderLevel: item.reorderLevel === null ? null : decimalToNumber(item.reorderLevel),
    purchasePrice: item.purchasePrice === null ? null : decimalToNumber(item.purchasePrice),
    salePrice: item.salePrice === null ? null : decimalToNumber(item.salePrice),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toStockMovementDto(movement: StockMovement): StockMovementDto {
  return {
    id: movement.id,
    itemId: movement.itemId,
    qty: decimalToNumber(movement.qty),
    rate: movement.rate === null ? null : decimalToNumber(movement.rate),
    sourceType: movement.sourceType,
    sourceId: movement.sourceId,
    godown: movement.godown,
    movementDate: movement.movementDate.toISOString(),
    createdAt: movement.createdAt.toISOString(),
  };
}
```

- [ ] **Step 6: Implement** `src/server/services/item.service.ts`:

```typescript
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import type { CreateItemInput, UpdateItemInput } from "@/lib/validations/item";
import { itemRepository, type ItemListOptions } from "@/server/repositories/item.repository";
import { toItemDto } from "@/server/services/mappers";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";

export const itemService = {
  async list(organizationId: string, options: ItemListOptions = {}) {
    const items = await itemRepository.findMany(organizationId, options);
    return items.map(toItemDto);
  },

  async get(organizationId: string, id: string) {
    const item = await itemRepository.findById(organizationId, id);
    if (!item) throw new NotFoundError("Item not found");
    return toItemDto(item);
  },

  async create(organizationId: string, input: CreateItemInput, actor: AuditActor = SYSTEM_ACTOR) {
    const duplicate = await itemRepository.findByName(organizationId, input.name);
    if (duplicate) throw new ValidationError("An item with this name already exists");

    return withAudit(actor, "item.create", { organizationId, entityType: "Item" }, async () => {
      const item = await itemRepository.create({
        organization: { connect: { id: organizationId } },
        name: input.name,
        sku: input.sku ?? null,
        unit: input.unit,
        hsnCode: input.hsnCode ?? null,
        gstRate: input.gstRate ?? null,
        openingQty: input.openingQty,
        reorderLevel: input.reorderLevel ?? null,
        purchasePrice: input.purchasePrice ?? null,
        salePrice: input.salePrice ?? null,
      });
      return toItemDto(item);
    });
  },

  async update(
    organizationId: string,
    id: string,
    input: UpdateItemInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const existing = await itemRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Item not found");

    if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await itemRepository.findByName(organizationId, input.name);
      if (duplicate) throw new ValidationError("An item with this name already exists");
    }

    return withAudit(
      actor,
      "item.update",
      { organizationId, entityType: "Item", entityId: id, before: toItemDto(existing) },
      async () => {
        await itemRepository.update(organizationId, id, {
          name: input.name,
          sku: input.sku,
          unit: input.unit,
          hsnCode: input.hsnCode,
          gstRate: input.gstRate,
          openingQty: input.openingQty,
          reorderLevel: input.reorderLevel,
          purchasePrice: input.purchasePrice,
          salePrice: input.salePrice,
        });
        return this.get(organizationId, id);
      },
    );
  },

  async remove(organizationId: string, id: string, actor: AuditActor = SYSTEM_ACTOR) {
    const existing = await itemRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Item not found");

    return withAudit(
      actor,
      "item.delete",
      { organizationId, entityType: "Item", entityId: id, before: toItemDto(existing) },
      async () => {
        const result = await itemRepository.softDelete(organizationId, id);
        if (result.count === 0) throw new NotFoundError("Item not found");
        return { deleted: true as const };
      },
    );
  },
};
```

`src/server/services/stock.service.ts`:

```typescript
import { NotFoundError } from "@/lib/api/errors";
import type { RecordMovementInput } from "@/lib/validations/stock";
import { itemRepository } from "@/server/repositories/item.repository";
import { stockRepository } from "@/server/repositories/stock.repository";
import { toStockMovementDto } from "@/server/services/mappers";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";
import { decimalToNumber } from "@/lib/utils/currency";

export const stockService = {
  async recordMovement(
    organizationId: string,
    input: RecordMovementInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const item = await itemRepository.findById(organizationId, input.itemId);
    if (!item) throw new NotFoundError("Item not found");

    return withAudit(
      actor,
      "stock.recordMovement",
      { organizationId, entityType: "StockMovement" },
      async () => {
        const movement = await stockRepository.createMovement({
          organization: { connect: { id: organizationId } },
          item: { connect: { id: input.itemId } },
          qty: input.qty,
          rate: input.rate ?? null,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          godown: input.godown ?? null,
          ...(input.movementDate ? { movementDate: input.movementDate } : {}),
        });
        return toStockMovementDto(movement);
      },
    );
  },

  async getItemStock(organizationId: string, itemId: string) {
    const item = await itemRepository.findById(organizationId, itemId);
    if (!item) throw new NotFoundError("Item not found");
    const movementSum = await stockRepository.sumQty(organizationId, itemId);
    return { itemId, currentQty: decimalToNumber(item.openingQty) + movementSum };
  },

  async listMovements(
    organizationId: string,
    itemId: string,
    options: { take?: number; cursor?: string } = {},
  ) {
    const movements = await stockRepository.listMovements(organizationId, itemId, options);
    return movements.map(toStockMovementDto);
  },
};
```

- [ ] **Step 7: Run tests.**

Run: `npm test -- tests/unit/item.service.test.ts tests/unit/stock.service.test.ts && npm run typecheck`
Expected: PASS (6 tests), typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validations/item.ts src/lib/validations/stock.ts src/server/repositories/item.repository.ts src/server/repositories/stock.repository.ts src/server/services/item.service.ts src/server/services/stock.service.ts src/server/services/mappers.ts src/types/index.ts tests/unit/item.service.test.ts tests/unit/stock.service.test.ts
git commit -m "feat: add Item and Stock repositories and services"
```

---

### Task 9: Bill Repository + Service

**Files:**
- Create: `src/lib/validations/bill.ts`
- Create: `src/server/repositories/bill.repository.ts`
- Create: `src/server/services/bill.service.ts`
- Modify: `src/server/services/mappers.ts`, `src/types/index.ts` (add `toBillDto`/`BillDto`)
- Test: `tests/unit/bill.service.test.ts`

**Interfaces:**
- Consumes: `withAudit` (Task 6), `partyRepository.findById` (Task 7), `computeInvoiceStatus`/`parseDueDate` from mappers.
- Produces (Phase 2 purchase-voucher import and Task 10 allocation consume):

```typescript
billService.list(organizationId, options?: { status?: "PENDING" | "OVERDUE" | "PAID"; partyId?: string; take?: number; cursor?: string }): Promise<BillDto[]>
billService.get(organizationId, id): Promise<BillDto>
billService.create(organizationId, input: CreateBillInput, actor?): Promise<BillDto>
billService.update(organizationId, id, input: UpdateBillInput, actor?): Promise<BillDto>
billService.remove(organizationId, id, actor?): Promise<{ deleted: true }>
billRepository.findOpenForParty(organizationId, partyId)  // status != PAID, oldest dueDate first
```

- [ ] **Step 1: Write validations** `src/lib/validations/bill.ts`:

```typescript
import { z } from "zod";
import { invoiceStatusSchema } from "@/lib/validations/invoice";

export const createBillSchema = z.object({
  partyId: z.string().uuid(),
  billNumber: z.string().min(1).max(100),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  amount: z.coerce.number().positive(),
  notes: z.string().max(2000).optional(),
  status: invoiceStatusSchema.optional(),
});

export const updateBillSchema = createBillSchema.partial();

export type CreateBillInput = z.infer<typeof createBillSchema>;
export type UpdateBillInput = z.infer<typeof updateBillSchema>;
```

- [ ] **Step 2: Write the failing test** `tests/unit/bill.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { billService } from "@/server/services/bill.service";
import { billRepository } from "@/server/repositories/bill.repository";
import { partyRepository } from "@/server/repositories/party.repository";
import { NotFoundError } from "@/lib/api/errors";

vi.mock("@/server/repositories/bill.repository", () => ({
  billRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findOpenForParty: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

vi.mock("@/server/repositories/party.repository", () => ({
  partyRepository: { findById: vi.fn() },
}));

vi.mock("@/server/services/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/audit.service")>();
  return { ...actual, withAudit: vi.fn((_a, _b, _c, fn) => fn()) };
});

const ORG = "org-1";

function fakeBill(overrides: Record<string, unknown> = {}) {
  return {
    id: "bill-1",
    organizationId: ORG,
    partyId: "party-1",
    billNumber: "PB-001",
    billDate: null,
    dueDate: new Date("2026-08-01T12:00:00.000Z"),
    amount: 5000,
    amountPaid: 0,
    currency: "INR",
    status: "PENDING",
    notes: null,
    tallyGuid: null,
    paidAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("billService", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-07-03T00:00:00.000Z") }));
  afterEach(() => vi.useRealTimers());

  it("create rejects an unknown party", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue(null);
    await expect(
      billService.create(ORG, {
        partyId: "missing",
        billNumber: "PB-001",
        dueDate: "2026-08-01",
        amount: 5000,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("create computes status from dueDate (future → PENDING) and persists", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue({ id: "party-1" } as never);
    vi.mocked(billRepository.create).mockResolvedValue(fakeBill() as never);

    const dto = await billService.create(ORG, {
      partyId: "party-1",
      billNumber: "PB-001",
      dueDate: "2026-08-01",
      amount: 5000,
    });

    expect(billRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING", billNumber: "PB-001" }),
    );
    expect(dto).toMatchObject({ id: "bill-1", amount: 5000, outstanding: 5000, status: "PENDING" });
  });

  it("get throws NotFoundError when missing", async () => {
    vi.mocked(billRepository.findById).mockResolvedValue(null);
    await expect(billService.get(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("update to PAID sets paidAt", async () => {
    vi.mocked(billRepository.findById).mockResolvedValue(fakeBill() as never);
    vi.mocked(billRepository.update).mockResolvedValue({ count: 1 } as never);

    await billService.update(ORG, "bill-1", { status: "PAID" });

    expect(billRepository.update).toHaveBeenCalledWith(
      ORG,
      "bill-1",
      expect.objectContaining({ status: "PAID", paidAt: expect.any(Date) }),
    );
  });
});
```

- [ ] **Step 3: Run to verify failure.**

Run: `npm test -- tests/unit/bill.service.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the repository** `src/server/repositories/bill.repository.ts`:

```typescript
import type { InvoiceStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface BillListOptions {
  status?: InvoiceStatus;
  partyId?: string;
  take?: number;
  cursor?: string;
}

export const billRepository = {
  findMany(organizationId: string, options: BillListOptions = {}) {
    return prisma.bill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.status ? { status: options.status } : {}),
        ...(options.partyId ? { partyId: options.partyId } : {}),
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: Math.min(options.take ?? 100, 500),
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.bill.findFirst({ where: { id, organizationId, deletedAt: null } });
  },

  /** Open (not fully paid) bills for a party, oldest due date first — allocation order. */
  findOpenForParty(organizationId: string, partyId: string) {
    return prisma.bill.findMany({
      where: { organizationId, partyId, deletedAt: null, status: { not: "PAID" } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
  },

  create(data: Prisma.BillCreateInput) {
    return prisma.bill.create({ data });
  },

  update(organizationId: string, id: string, data: Prisma.BillUpdateInput) {
    return prisma.bill.updateMany({ where: { id, organizationId, deletedAt: null }, data });
  },

  softDelete(organizationId: string, id: string) {
    return prisma.bill.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },
};
```

- [ ] **Step 5: Add DTO + mapper.** Append to `src/types/index.ts`:

```typescript
export interface BillDto {
  id: string;
  partyId: string;
  billNumber: string;
  billDate: string | null;
  dueDate: string;
  amount: number;
  amountPaid: number;
  outstanding: number;
  currency: string;
  status: "PENDING" | "OVERDUE" | "PAID";
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Append to `src/server/services/mappers.ts` (add `Bill` to the generated-client type import):

```typescript
export function toBillDto(bill: Bill): BillDto {
  const amount = decimalToNumber(bill.amount);
  const amountPaid = decimalToNumber(bill.amountPaid);
  return {
    id: bill.id,
    partyId: bill.partyId,
    billNumber: bill.billNumber,
    billDate: bill.billDate?.toISOString() ?? null,
    dueDate: bill.dueDate.toISOString(),
    amount,
    amountPaid,
    outstanding: Math.round((amount - amountPaid) * 100) / 100,
    currency: bill.currency,
    status: bill.status,
    notes: bill.notes,
    paidAt: bill.paidAt?.toISOString() ?? null,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 6: Implement the service** `src/server/services/bill.service.ts`:

```typescript
import { NotFoundError } from "@/lib/api/errors";
import type { CreateBillInput, UpdateBillInput } from "@/lib/validations/bill";
import { billRepository, type BillListOptions } from "@/server/repositories/bill.repository";
import { partyRepository } from "@/server/repositories/party.repository";
import { computeInvoiceStatus, parseDueDate, toBillDto } from "@/server/services/mappers";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";

export const billService = {
  async list(organizationId: string, options: BillListOptions = {}) {
    const bills = await billRepository.findMany(organizationId, options);
    return bills.map(toBillDto);
  },

  async get(organizationId: string, id: string) {
    const bill = await billRepository.findById(organizationId, id);
    if (!bill) throw new NotFoundError("Bill not found");
    return toBillDto(bill);
  },

  async create(organizationId: string, input: CreateBillInput, actor: AuditActor = SYSTEM_ACTOR) {
    const party = await partyRepository.findById(organizationId, input.partyId);
    if (!party) throw new NotFoundError("Party not found");

    const dueDate = parseDueDate(input.dueDate);
    const status = computeInvoiceStatus(dueDate, input.status);

    return withAudit(actor, "bill.create", { organizationId, entityType: "Bill" }, async () => {
      const bill = await billRepository.create({
        organization: { connect: { id: organizationId } },
        party: { connect: { id: input.partyId } },
        billNumber: input.billNumber,
        billDate: input.billDate ? parseDueDate(input.billDate) : null,
        dueDate,
        amount: input.amount,
        notes: input.notes ?? null,
        status,
        ...(status === "PAID" ? { paidAt: new Date() } : {}),
      });
      return toBillDto(bill);
    });
  },

  async update(
    organizationId: string,
    id: string,
    input: UpdateBillInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const existing = await billRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Bill not found");

    const dueDate = input.dueDate ? parseDueDate(input.dueDate) : existing.dueDate;
    const status = input.status ? input.status : computeInvoiceStatus(dueDate, existing.status);

    return withAudit(
      actor,
      "bill.update",
      { organizationId, entityType: "Bill", entityId: id, before: toBillDto(existing) },
      async () => {
        const updateData: Parameters<typeof billRepository.update>[2] = {
          billNumber: input.billNumber,
          billDate: input.billDate ? parseDueDate(input.billDate) : undefined,
          dueDate: input.dueDate ? dueDate : undefined,
          amount: input.amount,
          notes: input.notes,
          status,
        };
        if (status === "PAID") {
          updateData.paidAt = new Date();
        } else if (input.status === "PENDING" || input.status === "OVERDUE") {
          updateData.paidAt = null;
        }
        await billRepository.update(organizationId, id, updateData);
        return this.get(organizationId, id);
      },
    );
  },

  async remove(organizationId: string, id: string, actor: AuditActor = SYSTEM_ACTOR) {
    const existing = await billRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Bill not found");

    return withAudit(
      actor,
      "bill.delete",
      { organizationId, entityType: "Bill", entityId: id, before: toBillDto(existing) },
      async () => {
        const result = await billRepository.softDelete(organizationId, id);
        if (result.count === 0) throw new NotFoundError("Bill not found");
        return { deleted: true as const };
      },
    );
  },
};
```

- [ ] **Step 7: Run tests.**

Run: `npm test -- tests/unit/bill.service.test.ts && npm run typecheck`
Expected: PASS (4 tests), typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validations/bill.ts src/server/repositories/bill.repository.ts src/server/services/bill.service.ts src/server/services/mappers.ts src/types/index.ts tests/unit/bill.service.test.ts
git commit -m "feat: add Bill repository and service"
```

---

### Task 10: Payment Service with Allocation Logic

**Files:**
- Create: `src/server/services/payment-allocation.ts` (pure planner)
- Create: `src/lib/validations/payment.ts`
- Create: `src/server/repositories/payment.repository.ts`
- Create: `src/server/services/payment.service.ts`
- Modify: `src/types/index.ts` (PaymentDto)
- Test: `tests/unit/payment-allocation.test.ts`, `tests/unit/payment.service.test.ts`

**Interfaces:**
- Consumes: `billRepository.findOpenForParty` (Task 9), `partyRepository.findById` (Task 7), `withAudit` (Task 6).
- Produces (Phase 2 receipt-voucher import and Phase 6 `record_payment` tool consume):

```typescript
// payment-allocation.ts — pure, no I/O
export interface OpenDocument { id: string; dueDate: Date; outstanding: number }
export interface PlannedAllocation { documentId: string; amount: number }
export interface AllocationPlan { allocations: PlannedAllocation[]; unallocated: number }
export function planAllocations(amount: number, openDocuments: OpenDocument[]): AllocationPlan

// payment.service.ts
paymentService.list(organizationId, options?: { partyId?: string; direction?: "IN" | "OUT"; take?: number; cursor?: string }): Promise<PaymentDto[]>
paymentService.get(organizationId, id): Promise<PaymentDto>
paymentService.create(organizationId, input: CreatePaymentInput, actor?): Promise<PaymentDto>
// allocatePayment: explicit allocations validate against outstanding; omitted → oldest-due-first auto plan
paymentService.allocatePayment(organizationId, paymentId: string, allocations?: { documentId: string; amount: number }[], actor?): Promise<PaymentDto>
```

Allocation semantics (mirrors Tally bill-wise matching, parent §0.3): direction `IN` allocates against the party's open **Invoices**, direction `OUT` against open **Bills**. Oldest `dueDate` first. Each allocation increments the document's `amountPaid`; when `amountPaid >= amount` the document becomes `PAID` with `paidAt` set. Any remainder stays on `Payment.unallocated` (advance/on-account). All of this happens in one DB transaction.

- [ ] **Step 1: Write the failing planner test** `tests/unit/payment-allocation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { planAllocations } from "@/server/services/payment-allocation";

const doc = (id: string, due: string, outstanding: number) => ({
  id,
  dueDate: new Date(due),
  outstanding,
});

describe("planAllocations", () => {
  it("allocates to the oldest due document first", () => {
    const plan = planAllocations(1000, [
      doc("new", "2026-08-01", 800),
      doc("old", "2026-06-01", 800),
    ]);
    expect(plan.allocations).toEqual([
      { documentId: "old", amount: 800 },
      { documentId: "new", amount: 200 },
    ]);
    expect(plan.unallocated).toBe(0);
  });

  it("leaves a remainder unallocated when payment exceeds all outstanding", () => {
    const plan = planAllocations(1000, [doc("a", "2026-06-01", 300)]);
    expect(plan.allocations).toEqual([{ documentId: "a", amount: 300 }]);
    expect(plan.unallocated).toBe(700);
  });

  it("partially pays a single document", () => {
    const plan = planAllocations(250, [doc("a", "2026-06-01", 1000)]);
    expect(plan.allocations).toEqual([{ documentId: "a", amount: 250 }]);
    expect(plan.unallocated).toBe(0);
  });

  it("skips documents with zero or negative outstanding", () => {
    const plan = planAllocations(100, [doc("paid", "2026-05-01", 0), doc("b", "2026-06-01", 50)]);
    expect(plan.allocations).toEqual([{ documentId: "b", amount: 50 }]);
    expect(plan.unallocated).toBe(50);
  });

  it("handles rupee-paise rounding to 2dp", () => {
    const plan = planAllocations(100.1, [
      doc("a", "2026-06-01", 33.33),
      doc("b", "2026-07-01", 66.77),
    ]);
    expect(plan.allocations).toEqual([
      { documentId: "a", amount: 33.33 },
      { documentId: "b", amount: 66.77 },
    ]);
    expect(plan.unallocated).toBe(0);
  });

  it("returns everything unallocated when there are no open documents", () => {
    expect(planAllocations(500, [])).toEqual({ allocations: [], unallocated: 500 });
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- tests/unit/payment-allocation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the planner** `src/server/services/payment-allocation.ts`:

```typescript
export interface OpenDocument {
  id: string;
  dueDate: Date;
  outstanding: number;
}

export interface PlannedAllocation {
  documentId: string;
  amount: number;
}

export interface AllocationPlan {
  allocations: PlannedAllocation[];
  unallocated: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Plans how a payment amount spreads across open documents:
 * oldest due date first (FIFO), partial on the last one, remainder unallocated.
 * Pure function — mirrors Tally's default bill-wise "On Account → FIFO" behavior.
 */
export function planAllocations(amount: number, openDocuments: OpenDocument[]): AllocationPlan {
  const sorted = [...openDocuments]
    .filter((d) => d.outstanding > 0)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.id.localeCompare(b.id));

  const allocations: PlannedAllocation[] = [];
  let remaining = round2(amount);

  for (const document of sorted) {
    if (remaining <= 0) break;
    const allocated = round2(Math.min(remaining, document.outstanding));
    allocations.push({ documentId: document.id, amount: allocated });
    remaining = round2(remaining - allocated);
  }

  return { allocations, unallocated: remaining };
}
```

- [ ] **Step 4: Run planner tests.**

Run: `npm test -- tests/unit/payment-allocation.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write validations** `src/lib/validations/payment.ts`:

```typescript
import { z } from "zod";

export const paymentDirectionSchema = z.enum(["IN", "OUT"]);
export const paymentModeSchema = z.enum(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "CARD", "OTHER"]);

export const explicitAllocationSchema = z.object({
  documentId: z.string().uuid(), // invoiceId when direction=IN, billId when direction=OUT
  amount: z.coerce.number().positive(),
});

export const createPaymentSchema = z.object({
  partyId: z.string().uuid(),
  direction: paymentDirectionSchema,
  amount: z.coerce.number().positive(),
  mode: paymentModeSchema.default("BANK_TRANSFER"),
  paymentDate: z.coerce.date().optional(),
  reference: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  allocations: z.array(explicitAllocationSchema).optional(), // omitted → auto FIFO
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ExplicitAllocation = z.infer<typeof explicitAllocationSchema>;
```

- [ ] **Step 6: Implement the repository** `src/server/repositories/payment.repository.ts`:

```typescript
import type { PaymentDirection, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface PaymentListOptions {
  partyId?: string;
  direction?: PaymentDirection;
  take?: number;
  cursor?: string;
}

export interface CreatePaymentData {
  organizationId: string;
  partyId: string;
  direction: PaymentDirection;
  amount: number;
  unallocated: number;
  mode: Prisma.PaymentCreateInput["mode"];
  paymentDate?: Date;
  reference?: string | null;
  notes?: string | null;
}

export interface AllocationWrite {
  documentId: string; // invoice id (IN) or bill id (OUT)
  amount: number;
}

const paymentInclude = { allocations: { where: { deletedAt: null } } } as const;

export const paymentRepository = {
  findMany(organizationId: string, options: PaymentListOptions = {}) {
    return prisma.payment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.partyId ? { partyId: options.partyId } : {}),
        ...(options.direction ? { direction: options.direction } : {}),
      },
      include: paymentInclude,
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      take: Math.min(options.take ?? 100, 500),
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.payment.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: paymentInclude,
    });
  },

  /** Open (not fully paid) receivable invoices for a party, oldest due first. */
  findOpenInvoicesForParty(organizationId: string, partyId: string) {
    return prisma.invoice.findMany({
      where: {
        organizationId,
        partyId,
        deletedAt: null,
        type: "RECEIVABLE",
        status: { not: "PAID" },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
  },

  /**
   * Creates the payment + allocation rows and applies amountPaid/status to the
   * target documents — one atomic transaction.
   */
  createWithAllocations(
    data: CreatePaymentData,
    allocations: AllocationWrite[],
  ) {
    const target = data.direction === "IN" ? ("invoice" as const) : ("bill" as const);

    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          organizationId: data.organizationId,
          partyId: data.partyId,
          direction: data.direction,
          amount: data.amount,
          unallocated: data.unallocated,
          mode: data.mode,
          ...(data.paymentDate ? { paymentDate: data.paymentDate } : {}),
          reference: data.reference ?? null,
          notes: data.notes ?? null,
        },
      });

      for (const allocation of allocations) {
        await tx.paymentAllocation.create({
          data: {
            organizationId: data.organizationId,
            paymentId: payment.id,
            ...(target === "invoice"
              ? { invoiceId: allocation.documentId }
              : { billId: allocation.documentId }),
            amount: allocation.amount,
          },
        });

        if (target === "invoice") {
          const updated = await tx.invoice.update({
            where: { id: allocation.documentId },
            data: { amountPaid: { increment: allocation.amount } },
          });
          const total = Number(updated.totalAmount ?? updated.amount);
          if (Number(updated.amountPaid) >= total) {
            await tx.invoice.update({
              where: { id: allocation.documentId },
              data: { status: "PAID", paidAt: new Date() },
            });
          }
        } else {
          const updated = await tx.bill.update({
            where: { id: allocation.documentId },
            data: { amountPaid: { increment: allocation.amount } },
          });
          if (Number(updated.amountPaid) >= Number(updated.amount)) {
            await tx.bill.update({
              where: { id: allocation.documentId },
              data: { status: "PAID", paidAt: new Date() },
            });
          }
        }
      }

      return tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: paymentInclude,
      });
    });
  },

  /** Adds allocations to an existing payment and reduces its unallocated balance. */
  addAllocations(
    organizationId: string,
    paymentId: string,
    direction: PaymentDirection,
    allocations: AllocationWrite[],
    newUnallocated: number,
  ) {
    const target = direction === "IN" ? ("invoice" as const) : ("bill" as const);

    return prisma.$transaction(async (tx) => {
      for (const allocation of allocations) {
        await tx.paymentAllocation.create({
          data: {
            organizationId,
            paymentId,
            ...(target === "invoice"
              ? { invoiceId: allocation.documentId }
              : { billId: allocation.documentId }),
            amount: allocation.amount,
          },
        });

        if (target === "invoice") {
          const updated = await tx.invoice.update({
            where: { id: allocation.documentId },
            data: { amountPaid: { increment: allocation.amount } },
          });
          const total = Number(updated.totalAmount ?? updated.amount);
          if (Number(updated.amountPaid) >= total) {
            await tx.invoice.update({
              where: { id: allocation.documentId },
              data: { status: "PAID", paidAt: new Date() },
            });
          }
        } else {
          const updated = await tx.bill.update({
            where: { id: allocation.documentId },
            data: { amountPaid: { increment: allocation.amount } },
          });
          if (Number(updated.amountPaid) >= Number(updated.amount)) {
            await tx.bill.update({
              where: { id: allocation.documentId },
              data: { status: "PAID", paidAt: new Date() },
            });
          }
        }
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: { unallocated: newUnallocated },
      });

      return tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: paymentInclude,
      });
    });
  },
};
```

- [ ] **Step 7: Write the failing service test** `tests/unit/payment.service.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { paymentService } from "@/server/services/payment.service";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { partyRepository } from "@/server/repositories/party.repository";
import { billRepository } from "@/server/repositories/bill.repository";
import { NotFoundError, ValidationError } from "@/lib/api/errors";

vi.mock("@/server/repositories/payment.repository", () => ({
  paymentRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findOpenInvoicesForParty: vi.fn(),
    createWithAllocations: vi.fn(),
    addAllocations: vi.fn(),
  },
}));

vi.mock("@/server/repositories/party.repository", () => ({
  partyRepository: { findById: vi.fn() },
}));

vi.mock("@/server/repositories/bill.repository", () => ({
  billRepository: { findOpenForParty: vi.fn() },
}));

vi.mock("@/server/services/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/audit.service")>();
  return { ...actual, withAudit: vi.fn((_a, _b, _c, fn) => fn()) };
});

const ORG = "org-1";

function openInvoice(id: string, due: string, amount: number, amountPaid = 0) {
  return {
    id,
    organizationId: ORG,
    dueDate: new Date(due),
    amount,
    totalAmount: null,
    amountPaid,
    status: "PENDING",
  };
}

function fakePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    organizationId: ORG,
    partyId: "party-1",
    direction: "IN",
    amount: 1000,
    unallocated: 0,
    mode: "UPI",
    paymentDate: new Date("2026-07-03T00:00:00.000Z"),
    reference: null,
    notes: null,
    currency: "INR",
    tallyGuid: null,
    createdAt: new Date("2026-07-03T00:00:00.000Z"),
    updatedAt: new Date("2026-07-03T00:00:00.000Z"),
    deletedAt: null,
    allocations: [
      {
        id: "alloc-1",
        organizationId: ORG,
        paymentId: "pay-1",
        invoiceId: "inv-old",
        billId: null,
        amount: 800,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
        deletedAt: null,
      },
    ],
    ...overrides,
  };
}

describe("paymentService.create", () => {
  it("rejects an unknown party", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue(null);
    await expect(
      paymentService.create(ORG, { partyId: "x", direction: "IN", amount: 100, mode: "CASH" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("auto-allocates IN payments to the party's oldest open invoices", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue({ id: "party-1" } as never);
    vi.mocked(paymentRepository.findOpenInvoicesForParty).mockResolvedValue([
      openInvoice("inv-new", "2026-08-01", 500),
      openInvoice("inv-old", "2026-06-01", 800),
    ] as never);
    vi.mocked(paymentRepository.createWithAllocations).mockResolvedValue(fakePayment() as never);

    await paymentService.create(ORG, {
      partyId: "party-1",
      direction: "IN",
      amount: 1000,
      mode: "UPI",
    });

    expect(paymentRepository.createWithAllocations).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, amount: 1000, unallocated: 0 }),
      [
        { documentId: "inv-old", amount: 800 },
        { documentId: "inv-new", amount: 200 },
      ],
    );
  });

  it("uses bill outstanding for OUT payments", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue({ id: "party-1" } as never);
    vi.mocked(billRepository.findOpenForParty).mockResolvedValue([
      { id: "bill-1", dueDate: new Date("2026-06-15"), amount: 400, amountPaid: 100 },
    ] as never);
    vi.mocked(paymentRepository.createWithAllocations).mockResolvedValue(
      fakePayment({ direction: "OUT", amount: 500, unallocated: 200 }) as never,
    );

    await paymentService.create(ORG, {
      partyId: "party-1",
      direction: "OUT",
      amount: 500,
      mode: "BANK_TRANSFER",
    });

    expect(paymentRepository.createWithAllocations).toHaveBeenCalledWith(
      expect.objectContaining({ unallocated: 200 }),
      [{ documentId: "bill-1", amount: 300 }],
    );
  });

  it("validates explicit allocations against document outstanding", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue({ id: "party-1" } as never);
    vi.mocked(paymentRepository.findOpenInvoicesForParty).mockResolvedValue([
      openInvoice("inv-1", "2026-06-01", 300),
    ] as never);

    await expect(
      paymentService.create(ORG, {
        partyId: "party-1",
        direction: "IN",
        amount: 500,
        mode: "CASH",
        allocations: [{ documentId: "inv-1", amount: 400 }], // > 300 outstanding
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects explicit allocations that exceed the payment amount", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue({ id: "party-1" } as never);
    vi.mocked(paymentRepository.findOpenInvoicesForParty).mockResolvedValue([
      openInvoice("inv-1", "2026-06-01", 900),
    ] as never);

    await expect(
      paymentService.create(ORG, {
        partyId: "party-1",
        direction: "IN",
        amount: 500,
        mode: "CASH",
        allocations: [{ documentId: "inv-1", amount: 600 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("paymentService.allocatePayment", () => {
  it("allocates the remaining unallocated balance FIFO", async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue(
      fakePayment({ unallocated: 700, allocations: [] }) as never,
    );
    vi.mocked(paymentRepository.findOpenInvoicesForParty).mockResolvedValue([
      openInvoice("inv-2", "2026-07-01", 400),
    ] as never);
    vi.mocked(paymentRepository.addAllocations).mockResolvedValue(
      fakePayment({ unallocated: 300 }) as never,
    );

    await paymentService.allocatePayment(ORG, "pay-1");

    expect(paymentRepository.addAllocations).toHaveBeenCalledWith(
      ORG,
      "pay-1",
      "IN",
      [{ documentId: "inv-2", amount: 400 }],
      300,
    );
  });

  it("throws when the payment has no unallocated balance", async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue(
      fakePayment({ unallocated: 0 }) as never,
    );
    await expect(paymentService.allocatePayment(ORG, "pay-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
```

- [ ] **Step 8: Run to verify failure.**

Run: `npm test -- tests/unit/payment.service.test.ts`
Expected: FAIL — `@/server/services/payment.service` not found.

- [ ] **Step 9: Add `PaymentDto`** to `src/types/index.ts`:

```typescript
export interface PaymentAllocationDto {
  id: string;
  invoiceId: string | null;
  billId: string | null;
  amount: number;
}

export interface PaymentDto {
  id: string;
  partyId: string;
  direction: "IN" | "OUT";
  amount: number;
  unallocated: number;
  mode: "CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "CARD" | "OTHER";
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  currency: string;
  allocations: PaymentAllocationDto[];
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 10: Implement the service** `src/server/services/payment.service.ts`:

```typescript
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import type { CreatePaymentInput, ExplicitAllocation } from "@/lib/validations/payment";
import type { PaymentDto } from "@/types";
import { decimalToNumber } from "@/lib/utils/currency";
import {
  paymentRepository,
  type PaymentListOptions,
} from "@/server/repositories/payment.repository";
import { partyRepository } from "@/server/repositories/party.repository";
import { billRepository } from "@/server/repositories/bill.repository";
import {
  planAllocations,
  type OpenDocument,
  type PlannedAllocation,
} from "@/server/services/payment-allocation";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";

const round2 = (n: number) => Math.round(n * 100) / 100;

type PaymentWithAllocations = Awaited<ReturnType<typeof paymentRepository.findMany>>[number];

function toPaymentDto(payment: PaymentWithAllocations): PaymentDto {
  return {
    id: payment.id,
    partyId: payment.partyId,
    direction: payment.direction,
    amount: decimalToNumber(payment.amount),
    unallocated: decimalToNumber(payment.unallocated),
    mode: payment.mode,
    paymentDate: payment.paymentDate.toISOString(),
    reference: payment.reference,
    notes: payment.notes,
    currency: payment.currency,
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      invoiceId: allocation.invoiceId,
      billId: allocation.billId,
      amount: decimalToNumber(allocation.amount),
    })),
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

/** Open invoices (IN) or bills (OUT) for the party, as plain OpenDocuments. */
async function loadOpenDocuments(
  organizationId: string,
  partyId: string,
  direction: "IN" | "OUT",
): Promise<OpenDocument[]> {
  if (direction === "IN") {
    const invoices = await paymentRepository.findOpenInvoicesForParty(organizationId, partyId);
    return invoices.map((invoice) => ({
      id: invoice.id,
      dueDate: invoice.dueDate,
      outstanding: round2(
        decimalToNumber(invoice.totalAmount ?? invoice.amount) -
          decimalToNumber(invoice.amountPaid),
      ),
    }));
  }
  const bills = await billRepository.findOpenForParty(organizationId, partyId);
  return bills.map((bill) => ({
    id: bill.id,
    dueDate: bill.dueDate,
    outstanding: round2(decimalToNumber(bill.amount) - decimalToNumber(bill.amountPaid)),
  }));
}

/** Validates explicit bill-wise refs against open documents; returns the plan. */
function validateExplicitAllocations(
  amount: number,
  explicit: ExplicitAllocation[],
  openDocuments: OpenDocument[],
): { allocations: PlannedAllocation[]; unallocated: number } {
  const openById = new Map(openDocuments.map((d) => [d.id, d]));
  let total = 0;

  for (const allocation of explicit) {
    const document = openById.get(allocation.documentId);
    if (!document) {
      throw new ValidationError(
        `Allocation target ${allocation.documentId} is not an open document for this party`,
      );
    }
    if (allocation.amount > document.outstanding) {
      throw new ValidationError(
        `Allocation ${round2(allocation.amount)} exceeds outstanding ${document.outstanding} on ${allocation.documentId}`,
      );
    }
    total = round2(total + allocation.amount);
  }

  if (total > amount) {
    throw new ValidationError("Allocations exceed the payment amount");
  }

  return {
    allocations: explicit.map((a) => ({ documentId: a.documentId, amount: round2(a.amount) })),
    unallocated: round2(amount - total),
  };
}

export const paymentService = {
  async list(organizationId: string, options: PaymentListOptions = {}) {
    const payments = await paymentRepository.findMany(organizationId, options);
    return payments.map(toPaymentDto);
  },

  async get(organizationId: string, id: string) {
    const payment = await paymentRepository.findById(organizationId, id);
    if (!payment) throw new NotFoundError("Payment not found");
    return toPaymentDto(payment);
  },

  async create(
    organizationId: string,
    input: CreatePaymentInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const party = await partyRepository.findById(organizationId, input.partyId);
    if (!party) throw new NotFoundError("Party not found");

    const openDocuments = await loadOpenDocuments(organizationId, input.partyId, input.direction);

    const plan = input.allocations?.length
      ? validateExplicitAllocations(input.amount, input.allocations, openDocuments)
      : planAllocations(input.amount, openDocuments);

    return withAudit(
      actor,
      "payment.create",
      { organizationId, entityType: "Payment" },
      async () => {
        const payment = await paymentRepository.createWithAllocations(
          {
            organizationId,
            partyId: input.partyId,
            direction: input.direction,
            amount: input.amount,
            unallocated: plan.unallocated,
            mode: input.mode,
            paymentDate: input.paymentDate,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
          },
          plan.allocations,
        );
        return toPaymentDto(payment);
      },
    );
  },

  async allocatePayment(
    organizationId: string,
    paymentId: string,
    allocations?: ExplicitAllocation[],
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const payment = await paymentRepository.findById(organizationId, paymentId);
    if (!payment) throw new NotFoundError("Payment not found");

    const unallocated = decimalToNumber(payment.unallocated);
    if (unallocated <= 0) {
      throw new ValidationError("Payment has no unallocated balance");
    }

    const openDocuments = await loadOpenDocuments(
      organizationId,
      payment.partyId,
      payment.direction,
    );

    const plan = allocations?.length
      ? validateExplicitAllocations(unallocated, allocations, openDocuments)
      : planAllocations(unallocated, openDocuments);

    if (plan.allocations.length === 0) {
      throw new ValidationError("No open documents to allocate against");
    }

    return withAudit(
      actor,
      "payment.allocate",
      { organizationId, entityType: "Payment", entityId: paymentId, before: toPaymentDto(payment) },
      async () => {
        const updated = await paymentRepository.addAllocations(
          organizationId,
          paymentId,
          payment.direction,
          plan.allocations,
          plan.unallocated,
        );
        return toPaymentDto(updated);
      },
    );
  },
};
```

- [ ] **Step 11: Run all payment tests.**

Run: `npm test -- tests/unit/payment-allocation.test.ts tests/unit/payment.service.test.ts && npm run typecheck`
Expected: PASS (13 tests), typecheck clean.

- [ ] **Step 12: Commit**

```bash
git add src/server/services/payment-allocation.ts src/lib/validations/payment.ts src/server/repositories/payment.repository.ts src/server/services/payment.service.ts src/types/index.ts tests/unit/payment-allocation.test.ts tests/unit/payment.service.test.ts
git commit -m "feat: add Payment service with FIFO and bill-wise allocation logic"
```

---

### Task 11: RBAC — Role Enforcement in `lib/api/handler`

**Files:**
- Create: `src/lib/auth/roles.ts`
- Modify: `src/server/services/organization.service.ts` (return membership role)
- Modify: `src/lib/api/handler.ts` (role in `ApiContext`, `requiredRole` option)
- Modify: `src/app/api/invoices/route.ts`, `src/app/api/invoices/[id]/route.ts`, `src/app/api/invoices/bulk/route.ts`, `src/app/api/reminders/settings/route.ts`, `src/app/api/reminders/trigger/route.ts`, `src/app/api/ai/generate-email/route.ts`, `src/app/api/ai/send-email/route.ts`
- Test: `tests/unit/roles.test.ts`, `tests/unit/api-handler.test.ts`

**Interfaces:**
- Produces (Phase 6 uses `hasRole` for tool RBAC; all later route work uses `requiredRole`):

```typescript
// src/lib/auth/roles.ts
export type Role = "owner" | "admin" | "member" | "viewer";
export function hasRole(actual: Role, required: Role): boolean; // rank: viewer < member < admin < owner
export function parseRole(value: string): Role; // unknown strings → "viewer" (fail closed)

// handler
interface ApiContext { userId; clerkId; organizationId; role: Role }
withApiHandler(handler, { requiredRole: "member" }) // throws ForbiddenError (403) below rank
```

- [ ] **Step 1: Write the failing role test** `tests/unit/roles.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { hasRole, parseRole } from "@/lib/auth/roles";

describe("hasRole", () => {
  it("owner can do everything", () => {
    expect(hasRole("owner", "owner")).toBe(true);
    expect(hasRole("owner", "viewer")).toBe(true);
  });
  it("ranks viewer < member < admin < owner", () => {
    expect(hasRole("viewer", "member")).toBe(false);
    expect(hasRole("member", "member")).toBe(true);
    expect(hasRole("member", "admin")).toBe(false);
    expect(hasRole("admin", "owner")).toBe(false);
    expect(hasRole("admin", "member")).toBe(true);
  });
});

describe("parseRole", () => {
  it("passes through known roles", () => {
    expect(parseRole("admin")).toBe("admin");
  });
  it("fails closed to viewer on unknown values", () => {
    expect(parseRole("superuser")).toBe("viewer");
    expect(parseRole("")).toBe("viewer");
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- tests/unit/roles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `src/lib/auth/roles.ts`:

```typescript
export type Role = "owner" | "admin" | "member" | "viewer";

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function hasRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** OrganizationMember.role is a free string column; unknown values fail closed. */
export function parseRole(value: string): Role {
  return value in ROLE_RANK ? (value as Role) : "viewer";
}
```

Run: `npm test -- tests/unit/roles.test.ts` — Expected: PASS.

- [ ] **Step 4: Surface the role from the organization service.** In `src/server/services/organization.service.ts`, `findFirstForUser` already returns the `OrganizationMember` row. Change the two return sites of `resolveUserOrganization` and the created-org path to include the role:

```typescript
// add import at top:
import { parseRole, type Role } from "@/lib/auth/roles";

// existing-membership return becomes:
  if (existing) {
    return {
      userId: user.id,
      organizationId: existing.organizationId,
      organization: existing.organization,
      role: parseRole(existing.role),
    };
  }

// created-org return becomes:
    return { userId: user.id, organizationId: org.id, organization: org, role: "owner" as Role };

// race-recovery return becomes:
        return {
          userId: user.id,
          organizationId: membership.organizationId,
          organization: membership.organization,
          role: parseRole(membership.role),
        };
```

Check `organizationRepository.findFirstForUser` — its `findFirst` on `organizationMember` returns the full row including `role` (it does; no repo change needed).

- [ ] **Step 5: Enforce in the handler.** In `src/lib/api/handler.ts`:

```typescript
// add imports:
import { ForbiddenError } from "@/lib/api/errors"; // extend the existing errors import
import { hasRole, type Role } from "@/lib/auth/roles";

// ApiContext gains role:
export interface ApiContext {
  userId: string;
  clerkId: string;
  organizationId: string;
  role: Role;
}

// HandlerOptions gains requiredRole:
interface HandlerOptions {
  requireAuth?: boolean;
  rateLimit?: { limit: number; windowMs: number };
  /** Minimum org role for this route. Defaults to "viewer" (any member). */
  requiredRole?: Role;
}

// inside the requireAuth block, after ensureUserOrganization:
        const org = await organizationService.ensureUserOrganization(clerkId);
        apiContext = {
          clerkId,
          userId: org.userId,
          organizationId: org.organizationId,
          role: org.role,
        };

        if (options.requiredRole && !hasRole(org.role, options.requiredRole)) {
          throw new ForbiddenError(
            `This action requires the ${options.requiredRole} role or higher`,
          );
        }
```

- [ ] **Step 6: Apply `requiredRole: "member"` to every mutating route.** Pattern (shown for `src/app/api/invoices/route.ts` POST — apply identically to the others):

```typescript
export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const input = createInvoiceSchema.parse(body);
    const invoice = await invoiceService.create(ctx.organizationId, input);
    return successResponse(invoice, 201);
  },
  { rateLimit: { limit: 60, windowMs: 60_000 }, requiredRole: "member" },
);
```

Add `requiredRole: "member"` to the options object (creating the options object where the call currently has none) for: `invoices/route.ts` POST; `invoices/[id]/route.ts` PATCH and DELETE; `invoices/bulk/route.ts` POST; `reminders/settings/route.ts` PUT; `reminders/trigger/route.ts` POST; `ai/generate-email/route.ts` POST; `ai/send-email/route.ts` POST. GET handlers stay default (any authenticated member incl. viewer).

- [ ] **Step 7: Write the handler test** `tests/unit/api-handler.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { withApiHandler } from "@/lib/api/handler";
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

function membership(role: string) {
  return { userId: "user-1", organizationId: "org-1", organization: { id: "org-1" }, role };
}

const routeContext = { params: Promise.resolve({}) };

describe("withApiHandler requiredRole", () => {
  it("returns 403 when the member's role is below requiredRole", async () => {
    vi.mocked(organizationService.ensureUserOrganization).mockResolvedValue(
      membership("viewer") as never,
    );
    const handler = withApiHandler(async () => new Response("ok"), { requiredRole: "member" });
    const response = await handler(new Request("http://test/api/x"), routeContext);
    expect(response.status).toBe(403);
  });

  it("passes and exposes ctx.role when the role is sufficient", async () => {
    vi.mocked(organizationService.ensureUserOrganization).mockResolvedValue(
      membership("admin") as never,
    );
    const handler = withApiHandler(
      async (_request, ctx) => new Response(ctx.role),
      { requiredRole: "member" },
    );
    const response = await handler(new Request("http://test/api/x"), routeContext);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("admin");
  });
});
```

Note: `ensureUserOrganization` is mocked, so the mock must return `role` already parsed — pass `membership("viewer")` etc. as above; the handler reads `org.role` directly. If the real service returns `Role`-typed values, the `as never` casts absorb the fixture looseness.

- [ ] **Step 8: Run everything.**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests PASS (including the two new files), typecheck and build clean. Manual smoke: `npm run dev`, confirm invoice create still works signed in as the owner account.

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth/roles.ts src/lib/api/handler.ts src/server/services/organization.service.ts src/app/api tests/unit/roles.test.ts tests/unit/api-handler.test.ts
git commit -m "feat: enforce OrganizationMember role (RBAC) in the API handler"
```

---

### Task 12: CI — Tests + Migration Check + `prisma migrate deploy` on Deploy

**Files:**
- Modify: `.github/workflows/ci.yml` (created in Phase 0 Task 3; if it does not exist, create it with the full content below)
- Modify: `package.json` (add `pages-build`)

**Interfaces:**
- Produces: CI gates `lint`, `typecheck`, `test`, `migrate-check`, `build` on every PR; Cloudflare Pages deploys run `prisma migrate deploy` before the OpenNext Cloudflare build.

- [ ] **Step 1: Replace `.github/workflows/ci.yml` with:**

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
jobs:
  checks:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: ci
          POSTGRES_PASSWORD: ci
          POSTGRES_DB: ci
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U ci" --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci"
      DIRECT_URL: "postgresql://ci:ci@localhost:5432/ci"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      # Prove all migrations apply cleanly to an empty database.
      - name: migrate-check
        run: npx prisma migrate deploy
      - run: npm run build
        env:
          # Dummy values — build only needs syntactically valid envs.
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CI_CLERK_PUBLISHABLE_KEY }}
          CLERK_SECRET_KEY: ${{ secrets.CI_CLERK_SECRET_KEY }}
```

- [ ] **Step 2: Add the deploy-pipeline migration step.** Cloudflare Pages has no `vercel-build`-style auto-detected script name — the build command is set explicitly in Cloudflare dashboard → Workers & Pages → Project → Settings → Builds. Add a dedicated script in `package.json` scripts and set it as that project's Build command (chaining the migration ahead of the OpenNext Cloudflare adapter's build step, per `@opennextjs/cloudflare` docs):

```json
"pages-build": "prisma generate && prisma migrate deploy && npx opennextjs-cloudflare build"
```

Set Cloudflare Pages → Settings → Builds → Build command to `npm run pages-build` (verify the exact OpenNext CLI invocation against the adapter's current docs at implementation time — the command name above is illustrative); local `npm run build` stays migration-free (`next build`, unchanged). **Prerequisite recorded for Task 13:** production must be baselined (`prisma migrate resolve --applied 0_init` run once against prod) before the first deploy with this script, otherwise `migrate deploy` will refuse the non-empty schema.

- [ ] **Step 3: Verify locally what CI will run.**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all pass.

- [ ] **Step 4: Push a branch, open a draft PR, confirm all CI steps green** — especially `migrate-check` applying `0_init` + `phase1_core_data_model` to the empty service DB.

- [ ] **Step 5: Commit/merge**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: run vitest and prisma migrate checks; migrate deploy on Cloudflare Pages builds"
```

---

### Task 13: Phase Gate — Prod-Copy Migration Rehearsal & Sign-off

**Files:**
- Create: `docs/setup/PHASE-1-GATE.md`
- Modify: `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (mark Phase 1 gate result)

Parent-plan gate: *"all existing features still work (invoices list/create/remind); new models covered by unit tests; migration runs clean against a copy of prod data."*

- [ ] **Step 1: Rehearse the migration on a copy of prod data.** Create a scratch database (Supabase/Neon branch from prod, or `pg_dump` prod → `psql` restore into a local DB). Then, pointing `DATABASE_URL`/`DIRECT_URL` at the copy:

```bash
npx prisma migrate resolve --applied 0_init   # baseline the copy (schema predates migrate)
npx prisma migrate deploy                      # applies phase1_core_data_model
npm run db:backfill-parties
npm run db:backfill-parties                    # second run must report 0 created / 0 linked
```

Expected: both migrate commands exit 0; backfill run 2 is a no-op. Verify with SQL on the copy:

```sql
SELECT count(*) FROM invoices WHERE deleted_at IS NULL AND party_id IS NULL AND client_name <> '';
-- expected: 0
SELECT count(*) FROM parties;  -- expected: = number of distinct (org, lower(trim(client_name)))
```

Record the actual counts. **USER ACTION** if the agent has no prod credentials: user runs the block above and reports output.

- [ ] **Step 2: Full automated check on `main`:**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all green; test summary shows all suites passing (mappers, invoice.service, tally-parser, party-backfill, audit.service, party.service, item.service, stock.service, bill.service, payment-allocation, payment.service, roles, api-handler).

- [ ] **Step 3: Manual regression of existing features** against `npm run dev`: sign in → dashboard loads with correct stats → invoices list → create invoice → edit to PAID → CSV/Tally import page still parses a file → trigger a reminder (or verify the reminders settings save). Expected: all work; no console/server errors.

- [ ] **Step 4: Write `docs/setup/PHASE-1-GATE.md`:** status table of Tasks 1–12 (each: done/deviation + evidence — commit SHA, CI run URL, rehearsal counts from Step 1), open risks (e.g. WhatsApp template approval status carried from Phase 0), and go/no-go recommendation for Phase 2.

- [ ] **Step 5: USER ACTION — user signs off** (name + date in the gate doc). Tick the Phase 1 items in the parent plan.

- [ ] **Step 6: Commit**

```bash
git add docs/setup/PHASE-1-GATE.md docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md
git commit -m "docs: Phase 1 gate review and sign-off"
```

---

## Self-Review Notes

- **Spec coverage (parent Phase 1 items):** 0 framework upgrade → Tasks 1–2 (Prisma split out because generator/baseline work is independently revertable); 1 Vitest + characterization → Task 3; 2 migrations + backfill → Tasks 4–5; 3 repositories/services (Party, Item/Stock, Payment w/ allocation, Bill) → Tasks 7, 8, 10, 9; 4 AuditLog helper → Task 6 (placed *before* the services so every mutating method is wrapped from birth — same deliverable, safer order than the parent's listing); 5 RBAC in `lib/api/handler` → Task 11; 6 CI + `migrate deploy` → Task 12; gate → Task 13 (matches the parent gate verbatim: existing features, unit-tested models, clean prod-copy migration).
- **Interface contract check:** all 14 §0.3 model names appear verbatim in Task 4; the six service files and mirrored repositories match the contract paths; `withAudit(actor, action, entity, fn)` matches the contract signature; every service method takes `organizationId: string` first.
- **Type consistency pass:** `AuditActor`/`SYSTEM_ACTOR` (Task 6) used identically in Tasks 7–10; `OpenDocument`/`PlannedAllocation`/`AllocationPlan` consistent between planner, repository (`AllocationWrite` mirrors `PlannedAllocation` shape), and service; `Role`/`hasRole`/`parseRole` consistent between roles.ts, organization.service, handler, and tests; DTO field names in mappers match the `src/types/index.ts` interfaces; `billRepository.findOpenForParty` defined in Task 9 and consumed in Task 10.
- **Placeholder scan:** no TBDs; every code step contains complete code; commands include expected output. One deliberate conditional: Task 2 Step 2 documents the `prisma-client` vs `prisma-client-js` generator fork with an explicit decision rule, because Prisma 7's exact deprecation state must be observed at execution time.
- **Known deviations from the parent plan:** (a) audit helper built before the domain services (ordering only); (b) `Invoice.amountPaid` is a real column updated transactionally by allocations rather than a purely derived value — "derived" is preserved in the sense that allocations are the source of truth and the column is recomputable from `payment_allocations`; (c) CSV/Tally import routes are *not* rewired to `Party` in this phase — invoices keep legacy client fields (parent plan explicitly keeps them during migration), and Phase 2's import engine is where `partyId` becomes the write path.
