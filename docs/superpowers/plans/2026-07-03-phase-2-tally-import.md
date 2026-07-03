# Phase 2: Tally Prime Import (Full Schema Match) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent plan:** `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (read its Phase 2 section and §0.3 data-model blueprint before starting).
>
> **Cross-phase interface contract:** Phase 1 (planned in parallel) delivers the models `Party`, `Item`, `StockMovement`, `InvoiceLineItem`, `Bill`, `Payment`, `PaymentAllocation`, `ImportBatch`, `ImportRecord`, `AuditLog` and the services `src/server/services/party.service.ts`, `item.service.ts`, `stock.service.ts`, `payment.service.ts` (`allocatePayment`), `bill.service.ts`, `audit.service.ts` (`withAudit(actor, action, entity, fn)`). Every service method's first parameter is `organizationId: string`. **Interface checkpoint (Task 0):** before writing any code, diff the assumed signatures in this plan's "Consumes" blocks against Phase 1's actual "Produces" blocks and reconcile names — the model/service *names* above are contractual; the parameter shapes assumed here must be verified.

**Goal:** A user exports Masters + Day Book XML from Tally Prime and gets parties, stock items, and sales/purchase/receipt/payment/credit-note/debit-note vouchers imported — with line items, stock movements, and bill-wise payment allocations — idempotently, through a guided wizard, with per-batch undo.

**Architecture:** Pure-function XML parsers (`src/lib/import/tally/`, isomorphic — usable in browser preview and server) feed a server-side import service (`src/server/services/import/tally-import.service.ts`) that upserts domain entities keyed by Tally `GUID` + `ALTERID` through the existing layering (route → `lib/api/handler` → service → repository → Prisma). Import runs inside an Inngest job writing progress counters to `ImportBatch`; the wizard polls. Every touched entity gets an `ImportRecord` (with a before-snapshot) enabling batch undo.

**Tech Stack:** Next.js App Router, Prisma + Postgres, Inngest, Vitest (from Phase 1), `fast-xml-parser` (new — the legacy parser's `DOMParser` does not exist in Node), Zod, shadcn/Tailwind, Stitch (design), Playwright (smoke).

## Global Constraints

- Version floors (parent plan): Node >= 26 LTS, Next.js >= 16.2, React >= 19.2, TypeScript >= 6.0, Prisma >= 7.8, Tailwind >= 4.3 (all landed in Phase 1 Step 0 — do not downgrade).
- Multi-tenant: every table carries `organization_id`; every query is org-scoped at the repository layer. No cross-org data access, ever.
- Money columns `Decimal(12,2)`; quantities `Decimal(12,3)`; store a `currency` code (INR default).
- Soft deletes (`deleted_at`) on all business entities.
- Layering preserved: `app/api` route → `lib/api/handler` → `server/services` → `server/repositories` → Prisma. Parsers in `src/lib/import/tally/` are pure functions with zero I/O and zero Prisma imports.
- TDD for all parser/service code; Playwright smoke test for the new Imports page.
- Secrets only in env vars; never in code, prompts, or logs.
- Tally parsing philosophy (parent plan risk register): **warnings, not failures** — a malformed record produces a per-record warning/error entry and the import continues.
- Upload size: request bodies to Cloudflare Pages Functions (Workers runtime, via the OpenNext adapter) have a much higher platform ceiling than Vercel's old ~4.5 MB function limit, but this phase keeps the same conservative application-level cap regardless of platform: it accepts XML up to 4 MB inline and documents "split the export by period" in `docs/TALLY.md` for bigger books. Blob-storage streaming is a later enhancement — YAGNI now. (⚠️ Workers-runtime verification: confirm at implementation time whether the OpenNext adapter buffers the full request body in memory before the route handler sees it, since Workers have a separate memory limit that matters more than the body-size ceiling.)
- Fixtures: `tests/fixtures/tally/masters-ledgers.xml`, `masters-stockitems.xml`, `vouchers-daybook.xml` exist from Phase 0 Task 9 (real, sanitized user data). **Tests are written against whatever actually landed in those files** — structural-invariant assertions are given verbatim below; exact-count assertions are pinned by grep-counting the fixture (commands provided) at execution time.
- After code changes, follow CLAUDE.md's current guidance on `graphify` (Phase 0 removed `graphify-out/`; skip if the CLI/section is gone).

---

### Task 0: Interface Checkpoint & Dependencies

**Files:**
- Modify: `package.json` (add `fast-xml-parser`)
- Read-only: `docs/superpowers/plans/2026-07-03-phase-1-*.md`, `prisma/schema.prisma`, `src/server/services/payment.service.ts`, `src/server/services/audit.service.ts`

**Interfaces:**
- Consumes (assumed Phase 1 shapes — verify each in this task):
  - `paymentService.allocatePayment(organizationId: string, input: { paymentId: string; allocations: Array<{ invoiceId?: string; billId?: string; amount: number }> }): Promise<void>` — also recomputes `Invoice.amountPaid`/status and `Bill` equivalents.
  - `auditService.withAudit<T>(actor: { type: "USER" | "SYSTEM"; id: string | null }, action: string, entity: { type: string; id: string }, fn: () => Promise<T>): Promise<T>`
  - `ImportBatch` fields (blueprint §0.3): `id, organizationId, source, fileName, fileHash, status, totalCount, processedCount, createdCount, updatedCount, skippedCount, erroredCount, error, createdAt, startedAt, finishedAt, deletedAt`.
  - `ImportRecord` fields: `id, organizationId, batchId, entityType, entityId, tallyGuid, alterId, action, message, createdAt`.
  - Enums: `ImportBatchStatus { PENDING RUNNING COMPLETED FAILED REVERTED }`, `ImportRecordAction { CREATED UPDATED SKIPPED ERRORED }`.
  - `Party.tallyGuid`, `Party.tallyAlterId`, `Item.tallyGuid`, `Item.tallyAlterId`, `Invoice.tallyGuid`, `Invoice.tallyAlterId`, `Bill.tallyGuid`, `Payment.tallyGuid` (+ `@@unique([organizationId, tallyGuid])` on each).
- Produces: a reconciliation note appended to this plan file (or an empty "all matched" note) so later tasks use the *real* names.

- [ ] **Step 1: Diff assumptions against Phase 1's plan.** Open the Phase 1 plan's "Produces" blocks and `prisma/schema.prisma` as migrated. For each Consumes line above, tick "matches" or write the actual signature. If a name differs, update every later task in this plan file (search/replace) before starting Task 1.

- [ ] **Step 2: If `ImportBatch` lacks `rawContent` or `ImportRecord` lacks `beforeJson`, add them** (Phase 2 owns import internals; blueprint listed only key fields). Append to `prisma/schema.prisma` on the respective models:

```prisma
  // ImportBatch — raw uploaded XML so the Inngest job can (re)process without file storage
  rawContent String? @map("raw_content") @db.Text

  // ImportRecord — pre-update snapshot (entity scalars + children) enabling batch undo
  beforeJson Json? @map("before_json")
```

Run: `npx prisma migrate dev --name phase2_import_columns`
Expected: migration created and applied; `npx prisma generate` succeeds.

- [ ] **Step 3: Install parser dependency.**

Run: `npm install fast-xml-parser`
Expected: appears in `package.json` dependencies; `npm run typecheck` still passes.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json prisma/
git commit -m "chore(import): phase 2 interface checkpoint, import columns, fast-xml-parser"
```

---

### Task 1: Tally XML Primitives (`xml.ts` + `types.ts`)

**Files:**
- Create: `src/lib/import/tally/types.ts`
- Create: `src/lib/import/tally/xml.ts`
- Test: `tests/unit/import/tally/xml.test.ts`

**Interfaces:**
- Produces (used by every later parser task):
  - `types.ts`: `ParseWarning`, `ParseResult<T>`, `TallyLedger`, `TallyStockItem`, `TallyVoucherKind`, `TallyBillAllocation`, `TallyLedgerEntry`, `TallyInventoryEntry`, `TallyVoucher` (exact shapes in Step 1).
  - `xml.ts`: `parseTallyEnvelope(xml: string): Record<string, unknown>[]` (returns `TALLYMESSAGE` nodes), `asArray<T>(v: T | T[] | undefined | null): T[]`, `text(v: unknown): string`, `num(v: unknown): number`, `parseTallyDate(raw: string): string | null` (→ `YYYY-MM-DD`), `parseTallyQuantity(raw: string): number` (`"5 nos"` → 5), `parseTallyRate(raw: string): number` (`"100.00/nos"` → 100).

- [ ] **Step 1: Write `src/lib/import/tally/types.ts`** (types only, no test needed):

```typescript
/** Shared shapes for the pure Tally Prime XML parsers. No I/O, no Prisma. */

export interface ParseWarning {
  /** Human-locatable position, e.g. "VOUCHER[12] INV-042" */
  path: string;
  message: string;
}

export interface ParseResult<T> {
  records: T[];
  warnings: ParseWarning[];
}

export interface TallyLedger {
  guid: string;
  alterId: number;
  name: string;
  /** Tally group, e.g. "Sundry Debtors" / "Sundry Creditors" */
  parent: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  /** From BILLCREDITPERIOD, days */
  creditPeriodDays?: number;
  /** Tally sign convention preserved: positive = credit balance */
  openingBalance: number;
  isBillWiseOn: boolean;
}

export interface TallyStockItem {
  guid: string;
  alterId: number;
  name: string;
  /** BASEUNITS, e.g. "nos" */
  unit: string;
  hsnCode?: string;
  /** Percent, e.g. 18 */
  gstRate?: number;
  openingQty: number;
  openingRate: number;
}

export type TallyVoucherKind =
  | "SALES"
  | "PURCHASE"
  | "RECEIPT"
  | "PAYMENT"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "UNSUPPORTED";

export interface TallyBillAllocation {
  /** Bill reference name — for Agst Ref this is the invoice/bill number it settles */
  name: string;
  /** "New Ref" | "Agst Ref" | "Advance" | "On Account" */
  billType: string;
  amount: number;
}

export interface TallyLedgerEntry {
  ledgerName: string;
  /** Raw Tally sign: negative = debit, positive = credit */
  amount: number;
  isPartyLedger: boolean;
  billAllocations: TallyBillAllocation[];
}

export interface TallyInventoryEntry {
  stockItemName: string;
  quantity: number;
  rate: number;
  amount: number;
  unit?: string;
}

export interface TallyVoucher {
  guid: string;
  alterId: number;
  voucherNumber: string;
  /** Raw VOUCHERTYPENAME as exported */
  voucherTypeName: string;
  kind: TallyVoucherKind;
  /** ISO date YYYY-MM-DD */
  date: string;
  partyLedgerName: string;
  narration?: string;
  ledgerEntries: TallyLedgerEntry[];
  inventoryEntries: TallyInventoryEntry[];
}
```

- [ ] **Step 2: Write the failing tests** in `tests/unit/import/tally/xml.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseTallyEnvelope,
  asArray,
  text,
  num,
  parseTallyDate,
  parseTallyQuantity,
  parseTallyRate,
} from "@/lib/import/tally/xml";

const ENVELOPE = `<?xml version="1.0"?>
<ENVELOPE>
 <BODY>
  <IMPORTDATA>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Acme Traders" ACTION="Create">
      <GUID>abc-123-0001</GUID>
      <PARENT>Sundry Debtors</PARENT>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Beta Supplies" ACTION="Create">
      <GUID>abc-123-0002</GUID>
      <PARENT>Sundry Creditors</PARENT>
     </LEDGER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;

describe("parseTallyEnvelope", () => {
  it("returns one node per TALLYMESSAGE for IMPORTDATA envelopes", () => {
    const messages = parseTallyEnvelope(ENVELOPE);
    expect(messages).toHaveLength(2);
    expect(text((messages[0].LEDGER as Record<string, unknown>).GUID)).toBe("abc-123-0001");
  });

  it("also handles EXPORTDATA envelopes", () => {
    const exported = ENVELOPE.replace(/IMPORTDATA/g, "EXPORTDATA");
    expect(parseTallyEnvelope(exported)).toHaveLength(2);
  });

  it("throws a descriptive error on non-XML input", () => {
    expect(() => parseTallyEnvelope("not xml at all")).toThrow(/Tally XML/);
  });

  it("throws when the envelope has no TALLYMESSAGE nodes", () => {
    expect(() => parseTallyEnvelope("<ENVELOPE><BODY/></ENVELOPE>")).toThrow(/TALLYMESSAGE/);
  });
});

describe("scalar helpers", () => {
  it("asArray wraps scalars, passes arrays, drops nullish", () => {
    expect(asArray("a")).toEqual(["a"]);
    expect(asArray(["a", "b"])).toEqual(["a", "b"]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(null)).toEqual([]);
  });

  it("text trims and stringifies; num strips commas and parses sign", () => {
    expect(text("  hello ")).toBe("hello");
    expect(text(undefined)).toBe("");
    expect(text(42)).toBe("42");
    expect(num("-18500.00")).toBe(-18500);
    expect(num("1,18,500.50")).toBe(118500.5);
    expect(num("")).toBe(0);
    expect(num("garbage")).toBe(0);
  });

  it("parseTallyDate converts YYYYMMDD and rejects junk", () => {
    expect(parseTallyDate("20260401")).toBe("2026-04-01");
    expect(parseTallyDate("2026-04-01")).toBe("2026-04-01");
    expect(parseTallyDate("1-Apr")).toBeNull();
    expect(parseTallyDate("")).toBeNull();
  });

  it("parseTallyQuantity and parseTallyRate strip units", () => {
    expect(parseTallyQuantity(" 5 nos")).toBe(5);
    expect(parseTallyQuantity("-2.500 kg")).toBe(-2.5);
    expect(parseTallyQuantity("")).toBe(0);
    expect(parseTallyRate("1,200.00/nos")).toBe(1200);
    expect(parseTallyRate("")).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/import/tally/xml.test.ts`
Expected: FAIL — cannot resolve `@/lib/import/tally/xml`.

- [ ] **Step 4: Write `src/lib/import/tally/xml.ts`:**

```typescript
import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * Low-level helpers shared by all Tally parsers. Pure functions — safe in
 * browser (wizard preview) and Node (Inngest import job).
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep every value as a string; Tally numbers carry signs/commas/units
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

/** Parse a Tally ENVELOPE and return the TALLYMESSAGE nodes (objects). */
export function parseTallyEnvelope(xml: string): Record<string, unknown>[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    throw new Error(`Invalid Tally XML: ${valid.err.msg} (line ${valid.err.line})`);
  }
  const doc = parser.parse(xml) as Record<string, unknown>;
  const body = (doc.ENVELOPE as Record<string, unknown> | undefined)?.BODY as
    | Record<string, unknown>
    | undefined;
  const data = (body?.IMPORTDATA ?? body?.EXPORTDATA) as Record<string, unknown> | undefined;
  const requestData = data?.REQUESTDATA as Record<string, unknown> | undefined;
  const messages = asArray<Record<string, unknown>>(
    requestData?.TALLYMESSAGE as Record<string, unknown> | Record<string, unknown>[] | undefined,
  );
  if (messages.length === 0) {
    throw new Error(
      "No TALLYMESSAGE nodes found — is this a Tally Prime XML export? Expected ENVELOPE > BODY > IMPORTDATA/EXPORTDATA > REQUESTDATA > TALLYMESSAGE.",
    );
  }
  return messages;
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** fast-xml-parser may yield strings, numbers, or objects with #text. */
export function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") {
    const t = (v as Record<string, unknown>)["#text"];
    return t === undefined || t === null ? "" : String(t).trim();
  }
  return String(v).trim();
}

/** Parse a Tally amount string, stripping Indian-format commas. Junk → 0. */
export function num(v: unknown): number {
  const s = text(v).replace(/,/g, "");
  if (!s) return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Tally dates are YYYYMMDD (sometimes already ISO). Returns YYYY-MM-DD or null. */
export function parseTallyDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const clean = trimmed.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

/** "5 nos" → 5; "-2.500 kg" → -2.5. Leading number, unit suffix ignored. */
export function parseTallyQuantity(raw: string): number {
  const match = raw.trim().match(/^-?[\d,]*\.?\d+/);
  if (!match) return 0;
  const n = Number.parseFloat(match[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** "1,200.00/nos" → 1200. Number before the slash. */
export function parseTallyRate(raw: string): number {
  return parseTallyQuantity(raw.split("/")[0] ?? "");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/import/tally/xml.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/tally/types.ts src/lib/import/tally/xml.ts tests/unit/import/tally/xml.test.ts
git commit -m "feat(import): tally XML primitives and shared parser types"
```

---

### Task 2: Masters Parser — Ledgers (`LEDGER` → `TallyLedger`)

**Files:**
- Create: `src/lib/import/tally/parse-masters.ts`
- Test: `tests/unit/import/tally/parse-masters.test.ts`

**Interfaces:**
- Consumes: Task 1 (`parseTallyEnvelope`, `asArray`, `text`, `num`, `types`).
- Produces: `parseLedgers(xml: string): ParseResult<TallyLedger>` — consumed by Task 6 (masters import) and the wizard preview (Task 10).

- [ ] **Step 1: Write the failing tests** in `tests/unit/import/tally/parse-masters.test.ts` (stock-item tests are added in Task 3 — same file):

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLedgers } from "@/lib/import/tally/parse-masters";

const FIXTURES = join(__dirname, "../../../fixtures/tally");

const LEDGERS_XML = `<?xml version="1.0"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
 <TALLYMESSAGE>
  <LEDGER NAME="Acme Traders" ACTION="Create">
   <GUID>guid-led-0001</GUID>
   <ALTERID>15</ALTERID>
   <PARENT>Sundry Debtors</PARENT>
   <EMAIL>accounts@acme.example</EMAIL>
   <LEDGERPHONE>+91 98765 43210</LEDGERPHONE>
   <PARTYGSTIN>27AAPFU0939F1ZV</PARTYGSTIN>
   <ADDRESS.LIST TYPE="String">
    <ADDRESS>12 MG Road</ADDRESS>
    <ADDRESS>Pune 411001</ADDRESS>
   </ADDRESS.LIST>
   <BILLCREDITPERIOD>30 Days</BILLCREDITPERIOD>
   <ISBILLWISEON>Yes</ISBILLWISEON>
   <OPENINGBALANCE>-18500.00</OPENINGBALANCE>
  </LEDGER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <LEDGER NAME="Sales Account" ACTION="Create">
   <GUID>guid-led-0002</GUID>
   <ALTERID>3</ALTERID>
   <PARENT>Sales Accounts</PARENT>
  </LEDGER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <LEDGER NAME="Nameless">
   <PARENT>Sundry Debtors</PARENT>
  </LEDGER>
 </TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

describe("parseLedgers (synthetic)", () => {
  it("maps every LEDGER field", () => {
    const { records, warnings } = parseLedgers(LEDGERS_XML);
    const acme = records.find((l) => l.name === "Acme Traders");
    expect(acme).toMatchObject({
      guid: "guid-led-0001",
      alterId: 15,
      parent: "Sundry Debtors",
      email: "accounts@acme.example",
      phone: "+91 98765 43210",
      gstin: "27AAPFU0939F1ZV",
      address: "12 MG Road, Pune 411001",
      creditPeriodDays: 30,
      isBillWiseOn: true,
      openingBalance: -18500,
    });
    // GUID-less ledger is skipped with a warning, not a crash
    expect(records).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/GUID/i);
  });

  it("keeps non-party ledgers (routing to Party happens in the service, not the parser)", () => {
    const { records } = parseLedgers(LEDGERS_XML);
    expect(records.map((l) => l.parent)).toContain("Sales Accounts");
  });
});

describe("parseLedgers (real fixture)", () => {
  const xml = readFileSync(join(FIXTURES, "masters-ledgers.xml"), "utf8");

  it("parses every LEDGER with a GUID, uniquely", () => {
    const { records } = parseLedgers(xml);
    expect(records.length).toBeGreaterThan(0);
    const guids = records.map((l) => l.guid);
    expect(new Set(guids).size).toBe(guids.length);
    for (const l of records) {
      expect(l.guid).not.toBe("");
      expect(l.name).not.toBe("");
      expect(l.parent).not.toBe("");
      expect(Number.isFinite(l.alterId)).toBe(true);
    }
  });

  it("record count matches the raw LEDGER tag count", () => {
    // Pin the exact number: run `grep -c "<LEDGER " tests/fixtures/tally/masters-ledgers.xml`
    // and replace EXPECTED below with (that count minus any GUID-less records reported
    // in `warnings`). Assert both so fixture drift is caught.
    const { records, warnings } = parseLedgers(xml);
    const EXPECTED_TOTAL = (xml.match(/<LEDGER[ >]/g) ?? []).length;
    expect(records.length + warnings.length).toBe(EXPECTED_TOTAL);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/import/tally/parse-masters.test.ts`
Expected: FAIL — cannot resolve `@/lib/import/tally/parse-masters`.

- [ ] **Step 3: Write `parseLedgers` in `src/lib/import/tally/parse-masters.ts`:**

```typescript
import { parseTallyEnvelope, asArray, text, num } from "@/lib/import/tally/xml";
import type { ParseResult, ParseWarning, TallyLedger } from "@/lib/import/tally/types";

/** Extract "30" from "30 Days"; Tally may also export plain "30". */
function parseCreditPeriodDays(raw: string): number | undefined {
  const match = raw.trim().match(/^\d+/);
  return match ? Number.parseInt(match[0], 10) : undefined;
}

export function parseLedgers(xml: string): ParseResult<TallyLedger> {
  const messages = parseTallyEnvelope(xml);
  const records: TallyLedger[] = [];
  const warnings: ParseWarning[] = [];

  let index = -1;
  for (const message of messages) {
    for (const node of asArray<Record<string, unknown>>(
      message.LEDGER as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )) {
      index += 1;
      const name = text(node["@_NAME"]) || text(node.NAME);
      const guid = text(node.GUID);
      const path = `LEDGER[${index}] ${name || "(unnamed)"}`;

      if (!guid) {
        warnings.push({ path, message: "Skipped: no GUID (re-export with default XML settings)" });
        continue;
      }
      if (!name) {
        warnings.push({ path, message: "Skipped: no NAME attribute" });
        continue;
      }

      const addressList = node["ADDRESS.LIST"] as Record<string, unknown> | undefined;
      const addressLines = asArray(addressList?.ADDRESS).map(text).filter(Boolean);

      records.push({
        guid,
        alterId: num(node.ALTERID),
        name,
        parent: text(node.PARENT),
        email: text(node.EMAIL) || undefined,
        phone: text(node.LEDGERPHONE) || text(node.LEDGERMOBILE) || undefined,
        gstin: text(node.PARTYGSTIN) || text(node.GSTIN) || undefined,
        address: addressLines.length > 0 ? addressLines.join(", ") : undefined,
        creditPeriodDays: parseCreditPeriodDays(text(node.BILLCREDITPERIOD)),
        openingBalance: num(node.OPENINGBALANCE),
        isBillWiseOn: text(node.ISBILLWISEON).toLowerCase() === "yes",
      });
    }
  }

  return { records, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/import/tally/parse-masters.test.ts`
Expected: PASS. If the real-fixture test fails, inspect the fixture's actual tag spellings (`grep -o "<[A-Z.]*>" tests/fixtures/tally/masters-ledgers.xml | sort -u`) and extend the field fallbacks (e.g. an alternate GSTIN tag) — the synthetic test must keep passing unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/tally/parse-masters.ts tests/unit/import/tally/parse-masters.test.ts
git commit -m "feat(import): parse Tally LEDGER masters"
```

---

### Task 3: Masters Parser — Stock Items (`STOCKITEM` → `TallyStockItem`)

**Files:**
- Modify: `src/lib/import/tally/parse-masters.ts`
- Test: `tests/unit/import/tally/parse-masters.test.ts` (append)

**Interfaces:**
- Produces: `parseStockItems(xml: string): ParseResult<TallyStockItem>` — consumed by Task 6 and wizard preview.

- [ ] **Step 1: Append failing tests** to `tests/unit/import/tally/parse-masters.test.ts`:

```typescript
import { parseStockItems } from "@/lib/import/tally/parse-masters";

const STOCK_XML = `<?xml version="1.0"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
 <TALLYMESSAGE>
  <STOCKITEM NAME="Widget A" ACTION="Create">
   <GUID>guid-stk-0001</GUID>
   <ALTERID>7</ALTERID>
   <BASEUNITS>nos</BASEUNITS>
   <HSNCODE>84advance71</HSNCODE>
   <GSTDETAILS.LIST>
    <HSNCODE>847130</HSNCODE>
    <STATEWISEDETAILS.LIST>
     <RATEDETAILS.LIST>
      <GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD>
      <GSTRATE>18</GSTRATE>
     </RATEDETAILS.LIST>
    </STATEWISEDETAILS.LIST>
   </GSTDETAILS.LIST>
   <OPENINGBALANCE>10 nos</OPENINGBALANCE>
   <OPENINGRATE>1,200.00/nos</OPENINGRATE>
  </STOCKITEM>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <STOCKITEM NAME="No Guid Item"><BASEUNITS>kg</BASEUNITS></STOCKITEM>
 </TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

describe("parseStockItems (synthetic)", () => {
  it("maps STOCKITEM fields including nested GST rate", () => {
    const { records, warnings } = parseStockItems(STOCK_XML);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      guid: "guid-stk-0001",
      alterId: 7,
      name: "Widget A",
      unit: "nos",
      hsnCode: "847130",
      gstRate: 18,
      openingQty: 10,
      openingRate: 1200,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/GUID/i);
  });
});

describe("parseStockItems (real fixture)", () => {
  const stockXml = readFileSync(join(FIXTURES, "masters-stockitems.xml"), "utf8");

  it("parses every STOCKITEM with unique GUIDs and a unit", () => {
    const { records, warnings } = parseStockItems(stockXml);
    expect(records.length).toBeGreaterThan(0);
    expect(new Set(records.map((r) => r.guid)).size).toBe(records.length);
    for (const r of records) {
      expect(r.name).not.toBe("");
      expect(r.unit).not.toBe("");
    }
    const EXPECTED_TOTAL = (stockXml.match(/<STOCKITEM[ >]/g) ?? []).length;
    expect(records.length + warnings.length).toBe(EXPECTED_TOTAL);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/import/tally/parse-masters.test.ts`
Expected: FAIL — `parseStockItems` is not exported.

- [ ] **Step 3: Append `parseStockItems` to `src/lib/import/tally/parse-masters.ts`:**

```typescript
import type { TallyStockItem } from "@/lib/import/tally/types";
import { parseTallyQuantity, parseTallyRate } from "@/lib/import/tally/xml";

/** GST rate lives deep in GSTDETAILS.LIST; prefer the IGST duty head (full rate). */
function extractGstDetails(node: Record<string, unknown>): { hsnCode?: string; gstRate?: number } {
  let hsnCode = text(node.HSNCODE) || undefined;
  let gstRate: number | undefined;

  for (const gst of asArray<Record<string, unknown>>(
    node["GSTDETAILS.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
  )) {
    hsnCode = text(gst.HSNCODE) || hsnCode;
    for (const state of asArray<Record<string, unknown>>(
      gst["STATEWISEDETAILS.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )) {
      for (const rate of asArray<Record<string, unknown>>(
        state["RATEDETAILS.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
      )) {
        const head = text(rate.GSTRATEDUTYHEAD).toUpperCase();
        const value = num(rate.GSTRATE);
        if (value > 0 && (head.includes("IGST") || gstRate === undefined)) {
          gstRate = value;
        }
      }
    }
  }
  return { hsnCode, gstRate };
}

export function parseStockItems(xml: string): ParseResult<TallyStockItem> {
  const messages = parseTallyEnvelope(xml);
  const records: TallyStockItem[] = [];
  const warnings: ParseWarning[] = [];

  let index = -1;
  for (const message of messages) {
    for (const node of asArray<Record<string, unknown>>(
      message.STOCKITEM as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )) {
      index += 1;
      const name = text(node["@_NAME"]) || text(node.NAME);
      const guid = text(node.GUID);
      const path = `STOCKITEM[${index}] ${name || "(unnamed)"}`;

      if (!guid) {
        warnings.push({ path, message: "Skipped: no GUID" });
        continue;
      }
      if (!name) {
        warnings.push({ path, message: "Skipped: no NAME attribute" });
        continue;
      }

      const { hsnCode, gstRate } = extractGstDetails(node);
      records.push({
        guid,
        alterId: num(node.ALTERID),
        name,
        unit: text(node.BASEUNITS) || "nos",
        hsnCode,
        gstRate,
        openingQty: parseTallyQuantity(text(node.OPENINGBALANCE)),
        openingRate: parseTallyRate(text(node.OPENINGRATE)),
      });
    }
  }
  return { records, warnings };
}
```

(Consolidate the imports at the top of the file — `text`, `num`, `asArray`, `parseTallyEnvelope`, `parseTallyQuantity`, `parseTallyRate`, and both types — rather than duplicating import statements.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/import/tally/parse-masters.test.ts`
Expected: PASS. Same fixture-drift rule as Task 2 Step 4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/tally/parse-masters.ts tests/unit/import/tally/parse-masters.test.ts
git commit -m "feat(import): parse Tally STOCKITEM masters"
```

---

### Task 4: Voucher Parser (`VOUCHER` → `TallyVoucher`, all VCHTYPEs)

**Files:**
- Create: `src/lib/import/tally/parse-vouchers.ts`
- Test: `tests/unit/import/tally/parse-vouchers.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers/types.
- Produces:
  - `classifyVoucherKind(voucherTypeName: string): TallyVoucherKind`
  - `parseVouchers(xml: string): ParseResult<TallyVoucher>`
  Consumed by Tasks 7–8 (voucher engine) and wizard preview.

- [ ] **Step 1: Write the failing tests** in `tests/unit/import/tally/parse-vouchers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyVoucherKind, parseVouchers } from "@/lib/import/tally/parse-vouchers";

const FIXTURES = join(__dirname, "../../../fixtures/tally");

describe("classifyVoucherKind", () => {
  it("routes the six standard VCHTYPEs case-insensitively", () => {
    expect(classifyVoucherKind("Sales")).toBe("SALES");
    expect(classifyVoucherKind("Tax Invoice")).toBe("SALES");
    expect(classifyVoucherKind("purchase")).toBe("PURCHASE");
    expect(classifyVoucherKind("Receipt")).toBe("RECEIPT");
    expect(classifyVoucherKind("Payment")).toBe("PAYMENT");
    expect(classifyVoucherKind("Credit Note")).toBe("CREDIT_NOTE");
    expect(classifyVoucherKind("Debit Note")).toBe("DEBIT_NOTE");
    expect(classifyVoucherKind("Journal")).toBe("UNSUPPORTED");
    expect(classifyVoucherKind("")).toBe("UNSUPPORTED");
  });
});

const SALES_VOUCHER = `<?xml version="1.0"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Sales" ACTION="Create">
   <GUID>guid-vch-0001</GUID>
   <ALTERID>101</ALTERID>
   <DATE>20260401</DATE>
   <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
   <VOUCHERNUMBER>INV-042</VOUCHERNUMBER>
   <PARTYLEDGERNAME>Acme Traders</PARTYLEDGERNAME>
   <NARRATION>April supply</NARRATION>
   <ALLINVENTORYENTRIES.LIST>
    <STOCKITEMNAME>Widget A</STOCKITEMNAME>
    <RATE>1,200.00/nos</RATE>
    <ACTUALQTY> 5 nos</ACTUALQTY>
    <AMOUNT>6000.00</AMOUNT>
   </ALLINVENTORYENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Acme Traders</LEDGERNAME>
    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
    <AMOUNT>-7080.00</AMOUNT>
    <BILLALLOCATIONS.LIST>
     <NAME>INV-042</NAME>
     <BILLTYPE>New Ref</BILLTYPE>
     <AMOUNT>-7080.00</AMOUNT>
    </BILLALLOCATIONS.LIST>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Sales Account</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>6000.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Output IGST</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>1080.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Receipt" ACTION="Create">
   <GUID>guid-vch-0002</GUID>
   <ALTERID>102</ALTERID>
   <DATE>20260410</DATE>
   <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
   <VOUCHERNUMBER>RCP-007</VOUCHERNUMBER>
   <PARTYLEDGERNAME>Acme Traders</PARTYLEDGERNAME>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Acme Traders</LEDGERNAME>
    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
    <AMOUNT>7080.00</AMOUNT>
    <BILLALLOCATIONS.LIST>
     <NAME>INV-042</NAME>
     <BILLTYPE>Agst Ref</BILLTYPE>
     <AMOUNT>7080.00</AMOUNT>
    </BILLALLOCATIONS.LIST>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>HDFC Bank</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>-7080.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Sales"><VOUCHERNUMBER>NO-GUID</VOUCHERNUMBER><DATE>20260401</DATE></VOUCHER>
 </TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

describe("parseVouchers (synthetic)", () => {
  it("parses a Sales voucher with inventory, ledger entries, and bill allocations", () => {
    const { records, warnings } = parseVouchers(SALES_VOUCHER);
    expect(records).toHaveLength(2);
    expect(warnings).toHaveLength(1); // the GUID-less voucher

    const sales = records[0];
    expect(sales).toMatchObject({
      guid: "guid-vch-0001",
      alterId: 101,
      voucherNumber: "INV-042",
      kind: "SALES",
      date: "2026-04-01",
      partyLedgerName: "Acme Traders",
      narration: "April supply",
    });
    expect(sales.inventoryEntries).toEqual([
      { stockItemName: "Widget A", quantity: 5, rate: 1200, amount: 6000, unit: "nos" },
    ]);
    expect(sales.ledgerEntries).toHaveLength(3);
    const party = sales.ledgerEntries.find((e) => e.isPartyLedger);
    expect(party?.amount).toBe(-7080);
    expect(party?.billAllocations).toEqual([
      { name: "INV-042", billType: "New Ref", amount: -7080 },
    ]);
  });

  it("parses a Receipt voucher with Agst Ref allocations", () => {
    const receipt = parseVouchers(SALES_VOUCHER).records[1];
    expect(receipt.kind).toBe("RECEIPT");
    const party = receipt.ledgerEntries.find((e) => e.isPartyLedger);
    expect(party?.billAllocations[0]).toEqual({
      name: "INV-042",
      billType: "Agst Ref",
      amount: 7080,
    });
  });

  it("falls back to VCHTYPE attribute when VOUCHERTYPENAME is absent", () => {
    const noTypeName = SALES_VOUCHER.replace(/<VOUCHERTYPENAME>Sales<\/VOUCHERTYPENAME>/, "");
    expect(parseVouchers(noTypeName).records[0].kind).toBe("SALES");
  });
});

describe("parseVouchers (real fixture)", () => {
  const xml = readFileSync(join(FIXTURES, "vouchers-daybook.xml"), "utf8");

  it("parses every voucher; GUIDs unique; dates valid ISO", () => {
    const { records, warnings } = parseVouchers(xml);
    expect(records.length).toBeGreaterThan(0);
    expect(new Set(records.map((v) => v.guid)).size).toBe(records.length);
    for (const v of records) {
      expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.voucherNumber).not.toBe("");
    }
    const EXPECTED_TOTAL = (xml.match(/<VOUCHER[ >]/g) ?? []).length;
    expect(records.length + warnings.length).toBe(EXPECTED_TOTAL);
  });

  it("covers the voucher kinds guaranteed by the Phase 0 fixture inventory", () => {
    // Phase 0 Task 9 requires at least one Sales, Purchase, Receipt, Payment voucher
    // with bill-wise allocations present.
    const kinds = new Set(parseVouchers(xml).records.map((v) => v.kind));
    expect(kinds.has("SALES")).toBe(true);
    expect(kinds.has("PURCHASE")).toBe(true);
    expect(kinds.has("RECEIPT")).toBe(true);
    expect(kinds.has("PAYMENT")).toBe(true);
    const hasAllocations = parseVouchers(xml).records.some((v) =>
      v.ledgerEntries.some((e) => e.billAllocations.length > 0),
    );
    expect(hasAllocations).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/import/tally/parse-vouchers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/import/tally/parse-vouchers.ts`:**

```typescript
import { parseTallyEnvelope, asArray, text, num, parseTallyDate, parseTallyQuantity, parseTallyRate } from "@/lib/import/tally/xml";
import type {
  ParseResult,
  ParseWarning,
  TallyBillAllocation,
  TallyInventoryEntry,
  TallyLedgerEntry,
  TallyVoucher,
  TallyVoucherKind,
} from "@/lib/import/tally/types";

const KIND_MAP: Array<[RegExp, TallyVoucherKind]> = [
  [/credit\s*note/i, "CREDIT_NOTE"],
  [/debit\s*note/i, "DEBIT_NOTE"],
  [/sales|tax\s*invoice|^invoice$/i, "SALES"],
  [/purchase/i, "PURCHASE"],
  [/receipt/i, "RECEIPT"],
  [/payment/i, "PAYMENT"],
];

export function classifyVoucherKind(voucherTypeName: string): TallyVoucherKind {
  const name = voucherTypeName.trim();
  if (!name) return "UNSUPPORTED";
  for (const [pattern, kind] of KIND_MAP) {
    if (pattern.test(name)) return kind;
  }
  return "UNSUPPORTED";
}

function parseBillAllocations(entry: Record<string, unknown>): TallyBillAllocation[] {
  return asArray<Record<string, unknown>>(
    entry["BILLALLOCATIONS.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
  )
    .map((b) => ({
      name: text(b.NAME),
      billType: text(b.BILLTYPE),
      amount: num(b.AMOUNT),
    }))
    .filter((b) => b.name !== "");
}

function parseLedgerEntries(node: Record<string, unknown>, partyLedgerName: string): TallyLedgerEntry[] {
  const raw = [
    ...asArray<Record<string, unknown>>(node["ALLLEDGERENTRIES.LIST"] as never),
    ...asArray<Record<string, unknown>>(node["LEDGERENTRIES.LIST"] as never),
  ];
  return raw.map((entry) => {
    const ledgerName = text(entry.LEDGERNAME);
    const isPartyFlag = text(entry.ISPARTYLEDGER).toLowerCase() === "yes";
    return {
      ledgerName,
      amount: num(entry.AMOUNT),
      isPartyLedger: isPartyFlag || (partyLedgerName !== "" && ledgerName === partyLedgerName),
      billAllocations: parseBillAllocations(entry),
    };
  });
}

function parseInventoryEntries(node: Record<string, unknown>): TallyInventoryEntry[] {
  const raw = [
    ...asArray<Record<string, unknown>>(node["ALLINVENTORYENTRIES.LIST"] as never),
    ...asArray<Record<string, unknown>>(node["INVENTORYENTRIES.LIST"] as never),
  ];
  return raw
    .map((entry) => {
      const qtyRaw = text(entry.ACTUALQTY) || text(entry.BILLEDQTY);
      const unitMatch = qtyRaw.match(/[a-zA-Z]+\s*$/);
      return {
        stockItemName: text(entry.STOCKITEMNAME),
        quantity: Math.abs(parseTallyQuantity(qtyRaw)),
        rate: parseTallyRate(text(entry.RATE)),
        amount: Math.abs(num(entry.AMOUNT)),
        unit: unitMatch ? unitMatch[0].trim() : undefined,
      };
    })
    .filter((e) => e.stockItemName !== "");
}

export function parseVouchers(xml: string): ParseResult<TallyVoucher> {
  const messages = parseTallyEnvelope(xml);
  const records: TallyVoucher[] = [];
  const warnings: ParseWarning[] = [];

  let index = -1;
  for (const message of messages) {
    for (const node of asArray<Record<string, unknown>>(
      message.VOUCHER as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )) {
      index += 1;
      const voucherNumber = text(node.VOUCHERNUMBER);
      const path = `VOUCHER[${index}] ${voucherNumber || "(no number)"}`;

      const guid = text(node.GUID);
      if (!guid) {
        warnings.push({ path, message: "Skipped: no GUID" });
        continue;
      }

      const date = parseTallyDate(text(node.DATE));
      if (!date) {
        warnings.push({ path, message: `Skipped: unparseable DATE "${text(node.DATE)}"` });
        continue;
      }

      const voucherTypeName = text(node.VOUCHERTYPENAME) || text(node["@_VCHTYPE"]);
      const kind = classifyVoucherKind(voucherTypeName);
      const partyLedgerName = text(node.PARTYLEDGERNAME) || text(node.PARTYNAME);

      records.push({
        guid,
        alterId: num(node.ALTERID),
        voucherNumber: voucherNumber || guid.slice(-12),
        voucherTypeName,
        kind,
        date,
        partyLedgerName,
        narration: text(node.NARRATION) || undefined,
        ledgerEntries: parseLedgerEntries(node, partyLedgerName),
        inventoryEntries: parseInventoryEntries(node),
      });
    }
  }
  return { records, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/import/tally/parse-vouchers.test.ts`
Expected: PASS. Same fixture-drift rule: fix by extending fallbacks, never by weakening the synthetic assertions.

- [ ] **Step 5: Run the full parser suite + typecheck**

Run: `npx vitest run tests/unit/import/tally && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/tally/parse-vouchers.ts tests/unit/import/tally/parse-vouchers.test.ts
git commit -m "feat(import): full Tally voucher parser with VCHTYPE routing"
```

---

### Task 5: Import Repository (`ImportBatch`/`ImportRecord` + GUID upserts)

**Files:**
- Create: `src/server/repositories/tally-import.repository.ts`
- Test: `tests/unit/repositories/tally-import.repository.test.ts` (thin — repository is mostly Prisma pass-through; deep behavior is tested at the service layer in Tasks 6–8 with a mocked repository)

**Interfaces:**
- Consumes: Prisma client `@/lib/db/prisma`; Phase 1 models.
- Produces (consumed by Tasks 6–9):

```typescript
export const tallyImportRepository = {
  createBatch(data: { organizationId: string; source: string; fileName: string; fileHash: string; rawContent: string }): Promise<ImportBatch>;
  findBatchById(organizationId: string, id: string): Promise<ImportBatch | null>;
  listBatches(organizationId: string, take?: number): Promise<ImportBatch[]>;
  updateBatch(organizationId: string, id: string, data: Prisma.ImportBatchUpdateInput): Promise<ImportBatch>;
  createRecord(data: { organizationId: string; batchId: string; entityType: string; entityId: string | null; tallyGuid: string; alterId: number; action: ImportRecordAction; message?: string; beforeJson?: Prisma.InputJsonValue }): Promise<ImportRecord>;
  listRecords(organizationId: string, batchId: string): Promise<ImportRecord[]>;
  findPartyByGuid(organizationId: string, tallyGuid: string): Promise<Party | null>;
  findPartyByName(organizationId: string, name: string): Promise<Party | null>;
  findItemByGuid(organizationId: string, tallyGuid: string): Promise<Item | null>;
  findItemByName(organizationId: string, name: string): Promise<Item | null>;
  findInvoiceByGuid(organizationId: string, tallyGuid: string): Promise<Invoice | null>;
  findInvoiceByNumber(organizationId: string, invoiceNumber: string): Promise<Invoice | null>;
  findBillByGuid(organizationId: string, tallyGuid: string): Promise<Bill | null>;
  findBillByNumber(organizationId: string, billNumber: string): Promise<Bill | null>;
  findPaymentByGuid(organizationId: string, tallyGuid: string): Promise<Payment | null>;
};
```

- [ ] **Step 1: Write the repository.** Mirror the style of `src/server/repositories/invoice.repository.ts` (object literal of async methods, every `where` includes `organizationId` and `deletedAt: null`). Full implementation:

```typescript
import { prisma } from "@/lib/db/prisma";
import type { Prisma, ImportBatch, ImportRecord, ImportRecordAction, Party, Item, Invoice, Bill, Payment } from "@prisma/client";

export const tallyImportRepository = {
  createBatch(data: {
    organizationId: string;
    source: string;
    fileName: string;
    fileHash: string;
    rawContent: string;
  }): Promise<ImportBatch> {
    return prisma.importBatch.create({
      data: { ...data, status: "PENDING" },
    });
  },

  findBatchById(organizationId: string, id: string): Promise<ImportBatch | null> {
    return prisma.importBatch.findFirst({ where: { id, organizationId, deletedAt: null } });
  },

  listBatches(organizationId: string, take = 50): Promise<ImportBatch[]> {
    return prisma.importBatch.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take,
    });
  },

  updateBatch(
    organizationId: string,
    id: string,
    data: Prisma.ImportBatchUpdateInput,
  ): Promise<ImportBatch> {
    return prisma.importBatch.update({
      where: { id, organizationId },
      data,
    });
  },

  createRecord(data: {
    organizationId: string;
    batchId: string;
    entityType: string;
    entityId: string | null;
    tallyGuid: string;
    alterId: number;
    action: ImportRecordAction;
    message?: string;
    beforeJson?: Prisma.InputJsonValue;
  }): Promise<ImportRecord> {
    return prisma.importRecord.create({ data });
  },

  listRecords(organizationId: string, batchId: string): Promise<ImportRecord[]> {
    return prisma.importRecord.findMany({
      where: { organizationId, batchId },
      orderBy: { createdAt: "asc" },
    });
  },

  findPartyByGuid(organizationId: string, tallyGuid: string): Promise<Party | null> {
    return prisma.party.findFirst({ where: { organizationId, tallyGuid, deletedAt: null } });
  },
  findPartyByName(organizationId: string, name: string): Promise<Party | null> {
    return prisma.party.findFirst({ where: { organizationId, name, deletedAt: null } });
  },
  findItemByGuid(organizationId: string, tallyGuid: string): Promise<Item | null> {
    return prisma.item.findFirst({ where: { organizationId, tallyGuid, deletedAt: null } });
  },
  findItemByName(organizationId: string, name: string): Promise<Item | null> {
    return prisma.item.findFirst({ where: { organizationId, name, deletedAt: null } });
  },
  findInvoiceByGuid(organizationId: string, tallyGuid: string): Promise<Invoice | null> {
    return prisma.invoice.findFirst({ where: { organizationId, tallyGuid, deletedAt: null } });
  },
  findInvoiceByNumber(organizationId: string, invoiceNumber: string): Promise<Invoice | null> {
    return prisma.invoice.findFirst({ where: { organizationId, invoiceNumber, deletedAt: null } });
  },
  findBillByGuid(organizationId: string, tallyGuid: string): Promise<Bill | null> {
    return prisma.bill.findFirst({ where: { organizationId, tallyGuid, deletedAt: null } });
  },
  findBillByNumber(organizationId: string, billNumber: string): Promise<Bill | null> {
    return prisma.bill.findFirst({ where: { organizationId, billNumber, deletedAt: null } });
  },
  findPaymentByGuid(organizationId: string, tallyGuid: string): Promise<Payment | null> {
    return prisma.payment.findFirst({ where: { organizationId, tallyGuid, deletedAt: null } });
  },
};
```

(If Task 0 revealed different field names — e.g. `Bill.number` instead of `Bill.billNumber` — use the real names and update the later tasks' references.)

- [ ] **Step 2: Write a smoke test** in `tests/unit/repositories/tally-import.repository.test.ts` asserting org-scoping is present on every finder (guards against the classic multi-tenant leak):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    importBatch: { findFirst, findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    importRecord: { create: vi.fn(), findMany: vi.fn() },
    party: { findFirst },
    item: { findFirst },
    invoice: { findFirst },
    bill: { findFirst },
    payment: { findFirst },
  },
}));

import { tallyImportRepository } from "@/server/repositories/tally-import.repository";

describe("tallyImportRepository org scoping", () => {
  beforeEach(() => findFirst.mockClear());

  it.each([
    ["findBatchById", () => tallyImportRepository.findBatchById("org-1", "x")],
    ["findPartyByGuid", () => tallyImportRepository.findPartyByGuid("org-1", "g")],
    ["findPartyByName", () => tallyImportRepository.findPartyByName("org-1", "n")],
    ["findItemByGuid", () => tallyImportRepository.findItemByGuid("org-1", "g")],
    ["findInvoiceByGuid", () => tallyImportRepository.findInvoiceByGuid("org-1", "g")],
    ["findInvoiceByNumber", () => tallyImportRepository.findInvoiceByNumber("org-1", "INV-1")],
    ["findBillByGuid", () => tallyImportRepository.findBillByGuid("org-1", "g")],
    ["findPaymentByGuid", () => tallyImportRepository.findPaymentByGuid("org-1", "g")],
  ])("%s scopes by organizationId", async (_name, call) => {
    await call();
    const where = findFirst.mock.calls.at(-1)?.[0]?.where;
    expect(where.organizationId).toBe("org-1");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/repositories/tally-import.repository.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/repositories/tally-import.repository.ts tests/unit/repositories/
git commit -m "feat(import): tally import repository with org-scoped GUID lookups"
```

---

### Task 6: Import Service — Batch Lifecycle + Masters Import (LEDGER→Party, STOCKITEM→Item)

**Files:**
- Create: `src/server/services/import/tally-import.service.ts`
- Create: `src/lib/validations/import.ts`
- Test: `tests/unit/services/tally-import.service.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5; Phase 1 `auditService.withAudit`.
- Produces (the service surface every later task and route uses — exact signatures):

```typescript
export type TallyImportSource = "TALLY_MASTERS_LEDGERS" | "TALLY_MASTERS_STOCKITEMS" | "TALLY_VOUCHERS";

export interface ImportBatchDto {
  id: string;
  source: TallyImportSource;
  fileName: string;
  fileHash: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "REVERTED";
  totalCount: number;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  erroredCount: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export const tallyImportService = {
  createBatch(organizationId: string, input: { source: TallyImportSource; fileName: string; xml: string }): Promise<ImportBatchDto>;
  getBatch(organizationId: string, batchId: string): Promise<ImportBatchDto>;
  listBatches(organizationId: string): Promise<ImportBatchDto[]>;
  listRecords(organizationId: string, batchId: string): Promise<ImportRecordDto[]>;
  runBatch(organizationId: string, batchId: string): Promise<ImportBatchDto>;      // Task 6 (masters) + Tasks 7-8 (vouchers)
  undoBatch(organizationId: string, actorUserId: string, batchId: string): Promise<ImportBatchDto>; // Task 9
  getRecordsCsv(organizationId: string, batchId: string): Promise<string>;         // Task 10 (mapping report)
};
```

- [ ] **Step 1: Write `src/lib/validations/import.ts`:**

```typescript
import { z } from "zod";

export const MAX_TALLY_XML_BYTES = 4 * 1024 * 1024; // conservative application-level cap, independent of the Cloudflare Pages/Workers platform body-size ceiling

export const createTallyImportSchema = z.object({
  source: z.enum(["TALLY_MASTERS_LEDGERS", "TALLY_MASTERS_STOCKITEMS", "TALLY_VOUCHERS"]),
  fileName: z.string().min(1).max(255),
  xml: z
    .string()
    .min(1, "Empty file")
    .max(MAX_TALLY_XML_BYTES, "File exceeds 4 MB — split the Tally export by period (see docs/TALLY.md)"),
});

export type CreateTallyImportInput = z.infer<typeof createTallyImportSchema>;
```

- [ ] **Step 2: Write the failing service tests** (mock the repository and Phase 1 services with `vi.mock`; test *decisions*, not Prisma):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const repo = {
  createBatch: vi.fn(),
  findBatchById: vi.fn(),
  listBatches: vi.fn(),
  updateBatch: vi.fn(async (_o: string, id: string, data: object) => ({ id, ...data })),
  createRecord: vi.fn(async (d: object) => ({ id: "rec-1", ...d })),
  listRecords: vi.fn(),
  findPartyByGuid: vi.fn(),
  findPartyByName: vi.fn(),
  findItemByGuid: vi.fn(),
  findItemByName: vi.fn(),
  findInvoiceByGuid: vi.fn(),
  findInvoiceByNumber: vi.fn(),
  findBillByGuid: vi.fn(),
  findBillByNumber: vi.fn(),
  findPaymentByGuid: vi.fn(),
};
vi.mock("@/server/repositories/tally-import.repository", () => ({ tallyImportRepository: repo }));

const partyService = { create: vi.fn(async () => ({ id: "party-1" })), update: vi.fn(async () => ({ id: "party-1" })) };
const itemService = { create: vi.fn(async () => ({ id: "item-1" })), update: vi.fn(async () => ({ id: "item-1" })) };
vi.mock("@/server/services/party.service", () => ({ partyService }));
vi.mock("@/server/services/item.service", () => ({ itemService }));
vi.mock("@/server/services/audit.service", () => ({
  auditService: { withAudit: vi.fn((_a, _b, _c, fn) => fn()) },
}));

import { tallyImportService } from "@/server/services/import/tally-import.service";

const LEDGER_XML = `<?xml version="1.0"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
 <TALLYMESSAGE>
  <LEDGER NAME="Acme Traders"><GUID>g1</GUID><ALTERID>5</ALTERID><PARENT>Sundry Debtors</PARENT></LEDGER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <LEDGER NAME="Steel Corp"><GUID>g2</GUID><ALTERID>9</ALTERID><PARENT>Sundry Creditors</PARENT></LEDGER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <LEDGER NAME="Sales Account"><GUID>g3</GUID><ALTERID>2</ALTERID><PARENT>Sales Accounts</PARENT></LEDGER>
 </TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    organizationId: "org-1",
    source: "TALLY_MASTERS_LEDGERS",
    fileName: "ledgers.xml",
    fileHash: "hash",
    status: "PENDING",
    rawContent: LEDGER_XML,
    totalCount: 0, processedCount: 0, createdCount: 0, updatedCount: 0,
    skippedCount: 0, erroredCount: 0, error: null,
    createdAt: new Date(), startedAt: null, finishedAt: null, deletedAt: null,
    ...overrides,
  };
}

describe("tallyImportService.createBatch", () => {
  it("hashes the file and stores raw XML", async () => {
    repo.createBatch.mockResolvedValue(batchRow());
    await tallyImportService.createBatch("org-1", {
      source: "TALLY_MASTERS_LEDGERS",
      fileName: "ledgers.xml",
      xml: LEDGER_XML,
    });
    const arg = repo.createBatch.mock.calls[0][0];
    expect(arg.organizationId).toBe("org-1");
    expect(arg.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(arg.rawContent).toBe(LEDGER_XML);
  });

  it("rejects XML that does not parse as a Tally envelope", async () => {
    await expect(
      tallyImportService.createBatch("org-1", {
        source: "TALLY_MASTERS_LEDGERS",
        fileName: "junk.xml",
        xml: "<html>nope</html>",
      }),
    ).rejects.toThrow(/TALLYMESSAGE|Tally XML/);
  });
});

describe("tallyImportService.runBatch — masters/ledgers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findBatchById.mockResolvedValue(batchRow());
    repo.findPartyByGuid.mockResolvedValue(null);
  });

  it("creates Parties only for Sundry Debtors/Creditors groups, typed by group", async () => {
    await tallyImportService.runBatch("org-1", "batch-1");
    expect(partyService.create).toHaveBeenCalledTimes(2);
    const types = partyService.create.mock.calls.map((c) => c[1].type);
    expect(types).toContain("CUSTOMER");
    expect(types).toContain("SUPPLIER");
    // non-party ledger recorded as SKIPPED, not errored
    const skipped = repo.createRecord.mock.calls.filter((c) => c[0].action === "SKIPPED");
    expect(skipped).toHaveLength(1);
  });

  it("is idempotent: same alterId → SKIPPED, higher alterId → UPDATED", async () => {
    repo.findPartyByGuid.mockImplementation(async (_org: string, guid: string) =>
      guid === "g1"
        ? { id: "party-1", tallyGuid: "g1", tallyAlterId: 5, name: "Acme Traders" } // unchanged
        : guid === "g2"
          ? { id: "party-2", tallyGuid: "g2", tallyAlterId: 4, name: "Steel Corp" } // stale
          : null,
    );
    await tallyImportService.runBatch("org-1", "batch-1");
    expect(partyService.create).not.toHaveBeenCalled();
    expect(partyService.update).toHaveBeenCalledTimes(1);
    const actions = repo.createRecord.mock.calls.map((c) => c[0].action);
    expect(actions.filter((a) => a === "SKIPPED")).toHaveLength(2); // g1 + Sales Account
    expect(actions.filter((a) => a === "UPDATED")).toHaveLength(1);
  });

  it("finishes the batch with correct counters and COMPLETED status", async () => {
    await tallyImportService.runBatch("org-1", "batch-1");
    const finalUpdate = repo.updateBatch.mock.calls.at(-1)?.[2];
    expect(finalUpdate.status).toBe("COMPLETED");
    expect(finalUpdate.createdCount).toBe(2);
    expect(finalUpdate.skippedCount).toBe(1);
    expect(finalUpdate.erroredCount).toBe(0);
  });

  it("a throwing record becomes ERRORED and the batch still completes", async () => {
    partyService.create.mockRejectedValueOnce(new Error("boom"));
    await tallyImportService.runBatch("org-1", "batch-1");
    const actions = repo.createRecord.mock.calls.map((c) => c[0].action);
    expect(actions).toContain("ERRORED");
    expect(repo.updateBatch.mock.calls.at(-1)?.[2].status).toBe("COMPLETED");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/services/tally-import.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the service** — `src/server/services/import/tally-import.service.ts`. Batch lifecycle + masters processing (voucher processing lands in Tasks 7–8 in the same file):

```typescript
import { createHash } from "node:crypto";
import { NotFoundError, AppError } from "@/lib/api/errors";
import { parseTallyEnvelope } from "@/lib/import/tally/xml";
import { parseLedgers, parseStockItems } from "@/lib/import/tally/parse-masters";
import { parseVouchers } from "@/lib/import/tally/parse-vouchers";
import type { TallyLedger, TallyStockItem } from "@/lib/import/tally/types";
import { tallyImportRepository } from "@/server/repositories/tally-import.repository";
import { partyService } from "@/server/services/party.service";
import { itemService } from "@/server/services/item.service";
import { auditService } from "@/server/services/audit.service";
import { createLogger } from "@/lib/logger";
import type { ImportBatch, ImportRecord } from "@prisma/client";

const log = createLogger("tally-import");

export type TallyImportSource =
  | "TALLY_MASTERS_LEDGERS"
  | "TALLY_MASTERS_STOCKITEMS"
  | "TALLY_VOUCHERS";

export interface ImportBatchDto {
  id: string;
  source: TallyImportSource;
  fileName: string;
  fileHash: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "REVERTED";
  totalCount: number;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  erroredCount: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ImportRecordDto {
  id: string;
  entityType: string;
  entityId: string | null;
  tallyGuid: string;
  alterId: number;
  action: "CREATED" | "UPDATED" | "SKIPPED" | "ERRORED";
  message: string | null;
}

interface Counters {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
}

function toBatchDto(batch: ImportBatch): ImportBatchDto {
  return {
    id: batch.id,
    source: batch.source as TallyImportSource,
    fileName: batch.fileName,
    fileHash: batch.fileHash,
    status: batch.status as ImportBatchDto["status"],
    totalCount: batch.totalCount,
    processedCount: batch.processedCount,
    createdCount: batch.createdCount,
    updatedCount: batch.updatedCount,
    skippedCount: batch.skippedCount,
    erroredCount: batch.erroredCount,
    error: batch.error,
    createdAt: batch.createdAt.toISOString(),
    finishedAt: batch.finishedAt?.toISOString() ?? null,
  };
}

function toRecordDto(record: ImportRecord): ImportRecordDto {
  return {
    id: record.id,
    entityType: record.entityType,
    entityId: record.entityId,
    tallyGuid: record.tallyGuid,
    alterId: record.alterId,
    action: record.action as ImportRecordDto["action"],
    message: record.message,
  };
}

const PARTY_GROUPS: Record<string, "CUSTOMER" | "SUPPLIER"> = {
  "sundry debtors": "CUSTOMER",
  "sundry creditors": "SUPPLIER",
};

export const tallyImportService = {
  async createBatch(
    organizationId: string,
    input: { source: TallyImportSource; fileName: string; xml: string },
  ): Promise<ImportBatchDto> {
    // Fail fast on non-Tally XML before persisting anything
    parseTallyEnvelope(input.xml);

    const batch = await tallyImportRepository.createBatch({
      organizationId,
      source: input.source,
      fileName: input.fileName,
      fileHash: createHash("sha256").update(input.xml).digest("hex"),
      rawContent: input.xml,
    });
    return toBatchDto(batch);
  },

  async getBatch(organizationId: string, batchId: string): Promise<ImportBatchDto> {
    const batch = await tallyImportRepository.findBatchById(organizationId, batchId);
    if (!batch) throw new NotFoundError("Import batch not found");
    return toBatchDto(batch);
  },

  async listBatches(organizationId: string): Promise<ImportBatchDto[]> {
    const batches = await tallyImportRepository.listBatches(organizationId);
    return batches.map(toBatchDto);
  },

  async listRecords(organizationId: string, batchId: string): Promise<ImportRecordDto[]> {
    await this.getBatch(organizationId, batchId); // 404 + org check
    const records = await tallyImportRepository.listRecords(organizationId, batchId);
    return records.map(toRecordDto);
  },

  async getRecordsCsv(organizationId: string, batchId: string): Promise<string> {
    const records = await this.listRecords(organizationId, batchId);
    const escape = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = "entityType,entityId,tallyGuid,alterId,action,message";
    const rows = records.map((r) =>
      [r.entityType, r.entityId ?? "", r.tallyGuid, String(r.alterId), r.action, escape(r.message)].join(","),
    );
    return [header, ...rows].join("\n");
  },

  async runBatch(organizationId: string, batchId: string): Promise<ImportBatchDto> {
    const batch = await tallyImportRepository.findBatchById(organizationId, batchId);
    if (!batch) throw new NotFoundError("Import batch not found");
    if (batch.status === "RUNNING") {
      throw new AppError("IMPORT_ALREADY_RUNNING", "Batch is already running", 409);
    }
    if (!batch.rawContent) {
      throw new AppError("IMPORT_NO_CONTENT", "Batch has no stored file content", 422);
    }

    const counters: Counters = { processed: 0, created: 0, updated: 0, skipped: 0, errored: 0 };
    const flush = (extra: Record<string, unknown> = {}) =>
      tallyImportRepository.updateBatch(organizationId, batchId, {
        processedCount: counters.processed,
        createdCount: counters.created,
        updatedCount: counters.updated,
        skippedCount: counters.skipped,
        erroredCount: counters.errored,
        ...extra,
      });

    try {
      const source = batch.source as TallyImportSource;
      if (source === "TALLY_MASTERS_LEDGERS") {
        const { records, warnings } = parseLedgers(batch.rawContent);
        await flush({ status: "RUNNING", startedAt: new Date(), totalCount: records.length });
        await recordParseWarnings(organizationId, batchId, "Party", warnings, counters);
        await importLedgers(organizationId, batchId, records, counters, flush);
      } else if (source === "TALLY_MASTERS_STOCKITEMS") {
        const { records, warnings } = parseStockItems(batch.rawContent);
        await flush({ status: "RUNNING", startedAt: new Date(), totalCount: records.length });
        await recordParseWarnings(organizationId, batchId, "Item", warnings, counters);
        await importStockItems(organizationId, batchId, records, counters, flush);
      } else {
        const { records, warnings } = parseVouchers(batch.rawContent);
        await flush({ status: "RUNNING", startedAt: new Date(), totalCount: records.length });
        await recordParseWarnings(organizationId, batchId, "Voucher", warnings, counters);
        await importVouchers(organizationId, batchId, records, counters, flush); // Tasks 7-8
      }

      const finished = await flush({ status: "COMPLETED", finishedAt: new Date() });
      return toBatchDto(finished);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";
      log.error("Import batch failed", { batchId, message });
      const failed = await flush({ status: "FAILED", error: message, finishedAt: new Date() });
      return toBatchDto(failed);
    }
  },

  async undoBatch(
    organizationId: string,
    actorUserId: string,
    batchId: string,
  ): Promise<ImportBatchDto> {
    // Implemented in Task 9
    throw new AppError("NOT_IMPLEMENTED", "undoBatch lands in Task 9", 501);
  },
};

/** Parser warnings become ERRORED ImportRecords so nothing is silently dropped. */
async function recordParseWarnings(
  organizationId: string,
  batchId: string,
  entityType: string,
  warnings: { path: string; message: string }[],
  counters: Counters,
) {
  for (const warning of warnings) {
    counters.errored += 1;
    await tallyImportRepository.createRecord({
      organizationId,
      batchId,
      entityType,
      entityId: null,
      tallyGuid: "",
      alterId: 0,
      action: "ERRORED",
      message: `${warning.path}: ${warning.message}`,
    });
  }
}

const FLUSH_EVERY = 25;

async function importLedgers(
  organizationId: string,
  batchId: string,
  ledgers: TallyLedger[],
  counters: Counters,
  flush: () => Promise<unknown>,
) {
  for (const ledger of ledgers) {
    counters.processed += 1;
    const partyType = PARTY_GROUPS[ledger.parent.trim().toLowerCase()];
    try {
      if (!partyType) {
        counters.skipped += 1;
        await tallyImportRepository.createRecord({
          organizationId, batchId, entityType: "Party", entityId: null,
          tallyGuid: ledger.guid, alterId: ledger.alterId,
          action: "SKIPPED", message: `Ledger group "${ledger.parent}" is not a party group`,
        });
        continue;
      }

      const existing = await tallyImportRepository.findPartyByGuid(organizationId, ledger.guid);
      const input = {
        name: ledger.name,
        type: partyType,
        email: ledger.email,
        phone: ledger.phone,
        gstin: ledger.gstin,
        billingAddress: ledger.address,
        creditDays: ledger.creditPeriodDays,
        tallyGuid: ledger.guid,
        tallyAlterId: ledger.alterId,
      };

      if (!existing) {
        const created = await partyService.create(organizationId, input);
        counters.created += 1;
        await tallyImportRepository.createRecord({
          organizationId, batchId, entityType: "Party", entityId: created.id,
          tallyGuid: ledger.guid, alterId: ledger.alterId, action: "CREATED",
        });
      } else if ((existing.tallyAlterId ?? 0) >= ledger.alterId) {
        counters.skipped += 1;
        await tallyImportRepository.createRecord({
          organizationId, batchId, entityType: "Party", entityId: existing.id,
          tallyGuid: ledger.guid, alterId: ledger.alterId,
          action: "SKIPPED", message: "Unchanged (ALTERID not newer)",
        });
      } else {
        await partyService.update(organizationId, existing.id, input);
        counters.updated += 1;
        await tallyImportRepository.createRecord({
          organizationId, batchId, entityType: "Party", entityId: existing.id,
          tallyGuid: ledger.guid, alterId: ledger.alterId, action: "UPDATED",
          beforeJson: JSON.parse(JSON.stringify(existing)),
        });
      }
    } catch (error) {
      counters.errored += 1;
      await tallyImportRepository.createRecord({
        organizationId, batchId, entityType: "Party", entityId: null,
        tallyGuid: ledger.guid, alterId: ledger.alterId, action: "ERRORED",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    if (counters.processed % FLUSH_EVERY === 0) await flush();
  }
}

async function importStockItems(
  organizationId: string,
  batchId: string,
  items: TallyStockItem[],
  counters: Counters,
  flush: () => Promise<unknown>,
) {
  for (const item of items) {
    counters.processed += 1;
    try {
      const existing = await tallyImportRepository.findItemByGuid(organizationId, item.guid);
      const input = {
        name: item.name,
        unit: item.unit,
        hsnCode: item.hsnCode,
        gstRate: item.gstRate,
        openingQty: item.openingQty,
        purchasePrice: item.openingRate,
        tallyGuid: item.guid,
        tallyAlterId: item.alterId,
      };

      if (!existing) {
        const created = await itemService.create(organizationId, input);
        counters.created += 1;
        await tallyImportRepository.createRecord({
          organizationId, batchId, entityType: "Item", entityId: created.id,
          tallyGuid: item.guid, alterId: item.alterId, action: "CREATED",
        });
      } else if ((existing.tallyAlterId ?? 0) >= item.alterId) {
        counters.skipped += 1;
        await tallyImportRepository.createRecord({
          organizationId, batchId, entityType: "Item", entityId: existing.id,
          tallyGuid: item.guid, alterId: item.alterId,
          action: "SKIPPED", message: "Unchanged (ALTERID not newer)",
        });
      } else {
        await itemService.update(organizationId, existing.id, input);
        counters.updated += 1;
        await tallyImportRepository.createRecord({
          organizationId, batchId, entityType: "Item", entityId: existing.id,
          tallyGuid: item.guid, alterId: item.alterId, action: "UPDATED",
          beforeJson: JSON.parse(JSON.stringify(existing)),
        });
      }
    } catch (error) {
      counters.errored += 1;
      await tallyImportRepository.createRecord({
        organizationId, batchId, entityType: "Item", entityId: null,
        tallyGuid: item.guid, alterId: item.alterId, action: "ERRORED",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    if (counters.processed % FLUSH_EVERY === 0) await flush();
  }
}

// importVouchers is added in Task 7; declared here so runBatch compiles:
async function importVouchers(
  organizationId: string,
  batchId: string,
  vouchers: import("@/lib/import/tally/types").TallyVoucher[],
  counters: Counters,
  flush: () => Promise<unknown>,
): Promise<void> {
  throw new AppError("NOT_IMPLEMENTED", "Voucher import lands in Task 7", 501);
}
```

(Adjust `partyService.create`/`itemService.create` input field names to Phase 1's actual zod schemas per the Task 0 reconciliation note. `auditService` import stays — Task 9 uses `withAudit`; if the linter flags it unused before then, add the import in Task 9 instead.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/services/tally-import.service.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Add stock-item tests** (same file, same mocking pattern as ledgers — copy the `describe("runBatch — masters/ledgers")` block, switch the fixture to a two-item `STOCKITEM` envelope with GUIDs `s1`/`s2`, source `TALLY_MASTERS_STOCKITEMS`, mock `repo.findItemByGuid`, and assert `itemService.create` calls, SKIPPED-on-same-alterId, UPDATED-on-newer-alterId). Run to green.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/import/ src/lib/validations/import.ts tests/unit/services/
git commit -m "feat(import): tally import service — batch lifecycle and masters import"
```

---

### Task 7: Voucher Engine — Sales → Invoice (+ line items, stock OUT) and Purchase → Bill (+ stock IN)

**Files:**
- Modify: `src/server/services/import/tally-import.service.ts` (replace the `importVouchers` stub)
- Test: `tests/unit/services/tally-import-vouchers.test.ts`

**Interfaces:**
- Consumes:
  - Phase 1 `billService.create(organizationId, input)` / `billService.update(organizationId, id, input)`
  - Phase 1 `stockService.recordMovement(organizationId, input: { itemId: string; quantity: number; rate: number; sourceType: "INVOICE" | "BILL" | "ADJUSTMENT" | "OPENING"; sourceId: string })` (assumed name — reconcile via Task 0)
  - Existing `invoiceService` extended by Phase 1 with `partyId`, `type`, `lineItems`, `tallyGuid` on create/update inputs (reconcile via Task 0).
- Produces: working `importVouchers` for kinds `SALES` and `PURCHASE`; helper `resolveParty` and `replaceStockMovements` reused by Task 8.

**Mapping rules (the spec for this task's tests):**

| Tally | Invoice Chaser |
|---|---|
| `VOUCHER` kind SALES | `Invoice` (`type: "RECEIVABLE"`), upsert by `tallyGuid` |
| `VOUCHERNUMBER` | `invoiceNumber` |
| party ledger entry amount (negative = debit) | `Invoice.amount` = `abs(amount)` (total incl. tax) |
| `DATE` + party `creditDays` (fallback 0) | `dueDate` |
| `ALLINVENTORYENTRIES.LIST` | `InvoiceLineItem[]` (qty, rate, amount; `itemId` matched by stock-item name, null + warning if unknown) |
| each inventory entry | `StockMovement` qty **negative** (OUT), `sourceType: "INVOICE"` |
| `NARRATION` | `notes` |
| `PARTYLEDGERNAME` | `partyId` via name lookup; **missing party → create stub CUSTOMER/SUPPLIER Party and note it on the ImportRecord message** (warnings-not-failures) |
| kind PURCHASE | `Bill` mirror of the above; stock movements **positive** (IN), `sourceType: "BILL"` |
| re-import, `ALTERID` unchanged | SKIPPED (no writes) |
| re-import, `ALTERID` newer | UPDATED: scalars updated, line items and this voucher's stock movements **replaced**; `beforeJson` snapshot stored |
| kind UNSUPPORTED | SKIPPED with message `Unsupported voucher type "<name>"` |

- [ ] **Step 1: Write the failing tests** in `tests/unit/services/tally-import-vouchers.test.ts`. Use the Task 6 mock scaffold plus mocks for `invoiceService`, `billService`, `stockService`, `paymentService` (payment mocks used in Task 8 — set them up now). Feed `runBatch` a `TALLY_VOUCHERS` batch whose `rawContent` is the Task 4 `SALES_VOUCHER` envelope extended with one Purchase voucher (`VCHTYPE="Purchase"`, GUID `guid-vch-0003`, party `Steel Corp`, one inventory entry `Widget A`, qty 10, amount 12000). Assert:
  - `invoiceService.create` called once with `{ type: "RECEIVABLE", invoiceNumber: "INV-042", partyId: "party-1", amount: 7080, tallyGuid: "guid-vch-0001", lineItems: [{ description: "Widget A", quantity: 5, rate: 1200, amount: 6000, itemId: "item-1" }] }` (match with `expect.objectContaining`);
  - `stockService.recordMovement` called with `quantity: -5, sourceType: "INVOICE"` for the sale and `quantity: 10, sourceType: "BILL"` for the purchase;
  - `billService.create` called once with `partyId` of the supplier and `amount: 12000`;
  - unknown party name → `partyService.create` called with `{ name: "<party>", type: "CUSTOMER" }` and the ImportRecord message mentions `stub`;
  - re-run with `findInvoiceByGuid` returning `{ id, tallyAlterId: 101 }` → action SKIPPED, `invoiceService.update` not called;
  - `findInvoiceByGuid` returning `tallyAlterId: 100` → `invoiceService.update` called, ImportRecord `action: "UPDATED"` with a `beforeJson`;
  - a Journal voucher (kind UNSUPPORTED) → SKIPPED record.
  Write each of these as its own `it(...)` with the mock setup shown in Task 6 — the test file is a sibling of Task 6's and may not import from it.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/services/tally-import-vouchers.test.ts`
Expected: FAIL — `NOT_IMPLEMENTED` from the stub.

- [ ] **Step 3: Implement.** Replace the `importVouchers` stub in `tally-import.service.ts`:

```typescript
import { invoiceService } from "@/server/services/invoice.service";
import { billService } from "@/server/services/bill.service";
import { stockService } from "@/server/services/stock.service";
import type { TallyVoucher, TallyInventoryEntry } from "@/lib/import/tally/types";

/** Find (or stub-create) the Party for a voucher. Returns id + note for the record message. */
async function resolveParty(
  organizationId: string,
  name: string,
  fallbackType: "CUSTOMER" | "SUPPLIER",
): Promise<{ partyId: string; note?: string }> {
  const existing = await tallyImportRepository.findPartyByName(organizationId, name);
  if (existing) return { partyId: existing.id };
  const created = await partyService.create(organizationId, { name, type: fallbackType });
  return { partyId: created.id, note: `Created stub ${fallbackType.toLowerCase()} party "${name}" — fill in email/phone before chasing` };
}

/** The party ledger entry carries the document total (Tally sign: debit negative). */
function voucherTotal(voucher: TallyVoucher): number {
  const party = voucher.ledgerEntries.find((e) => e.isPartyLedger);
  if (party) return Math.abs(party.amount);
  return voucher.inventoryEntries.reduce((sum, e) => sum + e.amount, 0);
}

async function buildLineItems(
  organizationId: string,
  entries: TallyInventoryEntry[],
  notes: string[],
) {
  const lineItems = [];
  for (const entry of entries) {
    const item = await tallyImportRepository.findItemByName(organizationId, entry.stockItemName);
    if (!item) notes.push(`Unknown stock item "${entry.stockItemName}" — line kept without item link`);
    lineItems.push({
      itemId: item?.id ?? undefined,
      description: entry.stockItemName,
      quantity: entry.quantity,
      rate: entry.rate,
      amount: entry.amount,
    });
  }
  return lineItems;
}

async function recordVoucherStock(
  organizationId: string,
  entries: TallyInventoryEntry[],
  direction: 1 | -1,
  sourceType: "INVOICE" | "BILL",
  sourceId: string,
  notes: string[],
) {
  for (const entry of entries) {
    const item = await tallyImportRepository.findItemByName(organizationId, entry.stockItemName);
    if (!item) continue; // already noted by buildLineItems
    await stockService.recordMovement(organizationId, {
      itemId: item.id,
      quantity: direction * entry.quantity,
      rate: entry.rate,
      sourceType,
      sourceId,
    });
  }
}

async function importVouchers(
  organizationId: string,
  batchId: string,
  vouchers: TallyVoucher[],
  counters: Counters,
  flush: () => Promise<unknown>,
): Promise<void> {
  for (const voucher of vouchers) {
    counters.processed += 1;
    try {
      switch (voucher.kind) {
        case "SALES":
          await importSalesVoucher(organizationId, batchId, voucher, counters);
          break;
        case "PURCHASE":
          await importPurchaseVoucher(organizationId, batchId, voucher, counters);
          break;
        case "RECEIPT":
        case "PAYMENT":
        case "CREDIT_NOTE":
        case "DEBIT_NOTE":
          await importMoneyVoucher(organizationId, batchId, voucher, counters); // Task 8
          break;
        default: {
          counters.skipped += 1;
          await tallyImportRepository.createRecord({
            organizationId, batchId, entityType: "Voucher", entityId: null,
            tallyGuid: voucher.guid, alterId: voucher.alterId, action: "SKIPPED",
            message: `Unsupported voucher type "${voucher.voucherTypeName}"`,
          });
        }
      }
    } catch (error) {
      counters.errored += 1;
      await tallyImportRepository.createRecord({
        organizationId, batchId, entityType: "Voucher", entityId: null,
        tallyGuid: voucher.guid, alterId: voucher.alterId, action: "ERRORED",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    if (counters.processed % FLUSH_EVERY === 0) await flush();
  }
}

async function importSalesVoucher(
  organizationId: string,
  batchId: string,
  voucher: TallyVoucher,
  counters: Counters,
) {
  const notes: string[] = [];
  const existing = await tallyImportRepository.findInvoiceByGuid(organizationId, voucher.guid);
  if (existing && (existing.tallyAlterId ?? 0) >= voucher.alterId) {
    counters.skipped += 1;
    await tallyImportRepository.createRecord({
      organizationId, batchId, entityType: "Invoice", entityId: existing.id,
      tallyGuid: voucher.guid, alterId: voucher.alterId,
      action: "SKIPPED", message: "Unchanged (ALTERID not newer)",
    });
    return;
  }

  const { partyId, note } = await resolveParty(organizationId, voucher.partyLedgerName, "CUSTOMER");
  if (note) notes.push(note);
  const party = await tallyImportRepository.findPartyByName(organizationId, voucher.partyLedgerName);
  const dueDate = addDays(voucher.date, party?.creditDays ?? 0);
  const lineItems = await buildLineItems(organizationId, voucher.inventoryEntries, notes);

  const input = {
    type: "RECEIVABLE" as const,
    partyId,
    invoiceNumber: voucher.voucherNumber,
    amount: voucherTotal(voucher),
    dueDate,
    notes: voucher.narration,
    tallyGuid: voucher.guid,
    tallyAlterId: voucher.alterId,
    lineItems,
  };

  if (!existing) {
    const created = await invoiceService.create(organizationId, input);
    await recordVoucherStock(organizationId, voucher.inventoryEntries, -1, "INVOICE", created.id, notes);
    counters.created += 1;
    await tallyImportRepository.createRecord({
      organizationId, batchId, entityType: "Invoice", entityId: created.id,
      tallyGuid: voucher.guid, alterId: voucher.alterId, action: "CREATED",
      message: notes.length ? notes.join("; ") : undefined,
    });
  } else {
    await invoiceService.update(organizationId, existing.id, input); // Phase 1's update replaces lineItems
    await stockService.replaceMovementsForSource(organizationId, "INVOICE", existing.id, []); // clear old
    await recordVoucherStock(organizationId, voucher.inventoryEntries, -1, "INVOICE", existing.id, notes);
    counters.updated += 1;
    await tallyImportRepository.createRecord({
      organizationId, batchId, entityType: "Invoice", entityId: existing.id,
      tallyGuid: voucher.guid, alterId: voucher.alterId, action: "UPDATED",
      message: notes.length ? notes.join("; ") : undefined,
      beforeJson: JSON.parse(JSON.stringify(existing)),
    });
  }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
```

Write `importPurchaseVoucher` as the exact mirror: `findBillByGuid`, `resolveParty(..., "SUPPLIER")`, `billService.create/update` with `{ partyId, billNumber: voucher.voucherNumber, amount, dueDate, tallyGuid, tallyAlterId, lineItems }`, stock direction `+1`, `sourceType: "BILL"`, entityType `"Bill"`. If Phase 1's `stockService` has no `replaceMovementsForSource(organizationId, sourceType, sourceId, movements)` method, add the movement-clearing to `tallyImportRepository` instead (`prisma.stockMovement.deleteMany({ where: { organizationId, sourceType, sourceId } })`) and note it in the Task 0 reconciliation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/services/tally-import-vouchers.test.ts && npm run typecheck`
Expected: Sales + Purchase tests PASS. (Task 8's money-voucher tests are not written yet; `importMoneyVoucher` can be a `NOT_IMPLEMENTED` stub for now.)

- [ ] **Step 5: Commit**

```bash
git add src/server/services/import/tally-import.service.ts tests/unit/services/tally-import-vouchers.test.ts
git commit -m "feat(import): voucher engine — sales to invoices, purchases to bills, stock movements"
```

---

### Task 8: Voucher Engine — Receipt/Payment (+ BILLALLOCATIONS → allocations) and Credit/Debit Notes

**Files:**
- Modify: `src/server/services/import/tally-import.service.ts`
- Test: `tests/unit/services/tally-import-vouchers.test.ts` (append)

**Interfaces:**
- Consumes:
  - Phase 1 `paymentService.create(organizationId, input: { partyId: string; direction: "IN" | "OUT"; amount: number; mode?: string; date: string; tallyGuid?: string; tallyAlterId?: number }): Promise<{ id: string }>` (assumed — reconcile via Task 0)
  - Phase 1 `paymentService.allocatePayment(organizationId, { paymentId, allocations })` — the contractually named method; it updates `Invoice.amountPaid`/status (Phase 1 item 3 owns allocation math).
- Produces: `importMoneyVoucher` handling `RECEIPT`, `PAYMENT`, `CREDIT_NOTE`, `DEBIT_NOTE`.

**Mapping rules:**

| Kind | Payment `direction` | `mode` | Allocations target | Stock effect |
|---|---|---|---|---|
| RECEIPT | IN | non-party ledger name (e.g. "HDFC Bank", "Cash") | Invoices, via `BILLALLOCATIONS.LIST` with `billType` containing "Agst Ref" — `name` = invoice number | none |
| PAYMENT | OUT | non-party ledger name | Bills, same matching by bill number | none |
| CREDIT_NOTE | IN | `"CREDIT_NOTE"` | Invoices (reduces receivable) | inventory entries → stock **IN** (goods returned), `sourceType: "ADJUSTMENT"` |
| DEBIT_NOTE | OUT | `"DEBIT_NOTE"` | Bills (reduces payable) | inventory entries → stock **OUT**, `sourceType: "ADJUSTMENT"` |

Unmatched allocation references ("New Ref"/"Advance"/"On Account", or an "Agst Ref" whose document isn't found) are **not errors**: the Payment is created unallocated for that portion, and the ImportRecord message lists each unmatched ref (e.g. `Unmatched bill ref "INV-099" (Agst Ref)`).

- [ ] **Step 1: Append failing tests** to `tests/unit/services/tally-import-vouchers.test.ts`:
  - Receipt voucher (the Task 4 `RCP-007` XML): `paymentService.create` called with `{ direction: "IN", amount: 7080, mode: "HDFC Bank", partyId: "party-1", tallyGuid: "guid-vch-0002" }`; with `repo.findInvoiceByNumber` returning `{ id: "inv-42" }`, `paymentService.allocatePayment` called with `{ paymentId: "pay-1", allocations: [{ invoiceId: "inv-42", amount: 7080 }] }`.
  - Receipt with unknown invoice ref: `allocatePayment` **not** called; ImportRecord message matches `/Unmatched bill ref "INV-042"/`.
  - Payment voucher (direction OUT) allocating to a Bill by number → `allocations: [{ billId: "bill-9", amount: 5000 }]`.
  - Credit Note with one inventory entry → `paymentService.create` with `mode: "CREDIT_NOTE", direction: "IN"` and `stockService.recordMovement` with positive quantity and `sourceType: "ADJUSTMENT"`.
  - Idempotency: `findPaymentByGuid` returns existing with same alterId → SKIPPED, `paymentService.create` not called.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/services/tally-import-vouchers.test.ts`
Expected: new tests FAIL with `NOT_IMPLEMENTED`.

- [ ] **Step 3: Implement `importMoneyVoucher`** in `tally-import.service.ts`:

```typescript
import { paymentService } from "@/server/services/payment.service";

const MONEY_KIND_CONFIG = {
  RECEIPT: { direction: "IN", target: "invoice", partyType: "CUSTOMER", stock: null },
  PAYMENT: { direction: "OUT", target: "bill", partyType: "SUPPLIER", stock: null },
  CREDIT_NOTE: { direction: "IN", target: "invoice", partyType: "CUSTOMER", stock: 1, mode: "CREDIT_NOTE" },
  DEBIT_NOTE: { direction: "OUT", target: "bill", partyType: "SUPPLIER", stock: -1, mode: "DEBIT_NOTE" },
} as const;

async function importMoneyVoucher(
  organizationId: string,
  batchId: string,
  voucher: TallyVoucher,
  counters: Counters,
) {
  const config = MONEY_KIND_CONFIG[voucher.kind as keyof typeof MONEY_KIND_CONFIG];
  const notes: string[] = [];

  const existing = await tallyImportRepository.findPaymentByGuid(organizationId, voucher.guid);
  if (existing && (existing.tallyAlterId ?? 0) >= voucher.alterId) {
    counters.skipped += 1;
    await tallyImportRepository.createRecord({
      organizationId, batchId, entityType: "Payment", entityId: existing.id,
      tallyGuid: voucher.guid, alterId: voucher.alterId,
      action: "SKIPPED", message: "Unchanged (ALTERID not newer)",
    });
    return;
  }
  if (existing) {
    // Money vouchers rarely change; replacing allocations safely needs Phase 1's
    // deallocation API. Record and skip rather than corrupt balances.
    counters.skipped += 1;
    await tallyImportRepository.createRecord({
      organizationId, batchId, entityType: "Payment", entityId: existing.id,
      tallyGuid: voucher.guid, alterId: voucher.alterId,
      action: "SKIPPED",
      message: `Voucher changed in Tally (ALTERID ${existing.tallyAlterId} → ${voucher.alterId}) but payment updates are not supported — undo the original batch and re-import`,
    });
    return;
  }

  const partyEntry = voucher.ledgerEntries.find((e) => e.isPartyLedger);
  if (!partyEntry) {
    throw new Error(`No party ledger entry on ${voucher.voucherNumber}`);
  }
  const { partyId, note } = await resolveParty(organizationId, voucher.partyLedgerName, config.partyType);
  if (note) notes.push(note);

  const mode =
    "mode" in config
      ? config.mode
      : voucher.ledgerEntries.find((e) => !e.isPartyLedger)?.ledgerName ?? "UNKNOWN";

  const payment = await paymentService.create(organizationId, {
    partyId,
    direction: config.direction,
    amount: Math.abs(partyEntry.amount),
    mode,
    date: voucher.date,
    tallyGuid: voucher.guid,
    tallyAlterId: voucher.alterId,
  });

  // BILLALLOCATIONS.LIST → PaymentAllocation (bill-wise matching)
  const allocations: Array<{ invoiceId?: string; billId?: string; amount: number }> = [];
  for (const ref of partyEntry.billAllocations) {
    if (!/agst/i.test(ref.billType)) {
      notes.push(`Ref "${ref.name}" (${ref.billType}) left unallocated`);
      continue;
    }
    if (config.target === "invoice") {
      const invoice = await tallyImportRepository.findInvoiceByNumber(organizationId, ref.name);
      if (invoice) allocations.push({ invoiceId: invoice.id, amount: Math.abs(ref.amount) });
      else notes.push(`Unmatched bill ref "${ref.name}" (${ref.billType})`);
    } else {
      const bill = await tallyImportRepository.findBillByNumber(organizationId, ref.name);
      if (bill) allocations.push({ billId: bill.id, amount: Math.abs(ref.amount) });
      else notes.push(`Unmatched bill ref "${ref.name}" (${ref.billType})`);
    }
  }
  if (allocations.length > 0) {
    await paymentService.allocatePayment(organizationId, { paymentId: payment.id, allocations });
  }

  // Credit/debit notes move returned goods
  if (config.stock !== null) {
    for (const entry of voucher.inventoryEntries) {
      const item = await tallyImportRepository.findItemByName(organizationId, entry.stockItemName);
      if (!item) { notes.push(`Unknown stock item "${entry.stockItemName}"`); continue; }
      await stockService.recordMovement(organizationId, {
        itemId: item.id,
        quantity: config.stock * entry.quantity,
        rate: entry.rate,
        sourceType: "ADJUSTMENT",
        sourceId: payment.id,
      });
    }
  }

  counters.created += 1;
  await tallyImportRepository.createRecord({
    organizationId, batchId, entityType: "Payment", entityId: payment.id,
    tallyGuid: voucher.guid, alterId: voucher.alterId, action: "CREATED",
    message: notes.length ? notes.join("; ") : undefined,
  });
}
```

**Ordering note (bake into the wizard copy in Task 10 and docs in Task 11):** allocations match by document number, so vouchers must be imported *after* masters, and the Day Book export naturally contains Sales before Receipts chronologically; `parseVouchers` preserves document order, and within one batch Sales create the invoices that the same batch's Receipts then allocate against. Receipts referencing invoices from *before* the export window will report unmatched refs — expected, documented.

- [ ] **Step 4: Run all voucher tests**

Run: `npx vitest run tests/unit/services/tally-import-vouchers.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/import/tally-import.service.ts tests/unit/services/tally-import-vouchers.test.ts
git commit -m "feat(import): receipts/payments with bill-wise allocations, credit/debit notes"
```

---

### Task 9: Batch Undo (Revert)

**Files:**
- Modify: `src/server/services/import/tally-import.service.ts` (replace `undoBatch` stub)
- Modify: `src/server/repositories/tally-import.repository.ts` (add undo helpers)
- Test: `tests/unit/services/tally-import-undo.test.ts`

**Interfaces:**
- Consumes: `auditService.withAudit(actor, action, entity, fn)` (Phase 1, contractual).
- Produces: `undoBatch(organizationId, actorUserId, batchId)` — wired to the API in Task 10. Repository gains:
  - `softDeleteEntity(organizationId: string, entityType: string, entityId: string): Promise<void>` — sets `deletedAt` on the named entity **and its children** (Invoice → its InvoiceLineItems + StockMovements + PaymentAllocations; Bill likewise; Payment → its PaymentAllocations + adjustment StockMovements) inside one `prisma.$transaction`, then triggers `paymentService`-consistent recomputation by deleting allocations first.
  - `restoreEntitySnapshot(organizationId: string, entityType: string, entityId: string, snapshot: Record<string, unknown>): Promise<void>` — writes the `beforeJson` scalars back (ignoring `id`, `organizationId`, relation arrays, timestamps).

**Undo semantics (the spec):**
- Only batches with status `COMPLETED` (or `FAILED`) can be undone; a batch is undone at most once (→ status `REVERTED`).
- Records are processed in **reverse creation order** (payments before the invoices they allocate to, vouchers before masters).
- `CREATED` → soft-delete the entity + children. `UPDATED` → restore `beforeJson`. `SKIPPED`/`ERRORED` → no-op.
- The whole undo is wrapped in `auditService.withAudit({ type: "USER", id: actorUserId }, "import.batch.undo", { type: "ImportBatch", id: batchId }, fn)`.
- Undo of a masters batch whose parties/items are referenced by *later* batches' documents: soft-delete is still safe (FKs remain), but append a warning to the batch `error` field: `"N entities referenced by later imports were soft-deleted"` — count via a repository helper `countReferences(organizationId, entityType, entityId)`.

- [ ] **Step 1: Write failing tests** in `tests/unit/services/tally-import-undo.test.ts` (same mock scaffold; mock repo `listRecords` to return, in creation order: Party CREATED, Invoice CREATED, Payment CREATED, Party UPDATED-with-beforeJson):
  - asserts `softDeleteEntity` call order is Payment → Invoice → Party (reverse);
  - asserts `restoreEntitySnapshot` called for the UPDATED record with its `beforeJson`;
  - asserts final `updateBatch` sets `status: "REVERTED"`;
  - asserts a second `undoBatch` on a `REVERTED` batch throws `AppError` with code `IMPORT_NOT_UNDOABLE`;
  - asserts `withAudit` wrapped the operation (mock records the `action` argument `"import.batch.undo"`).

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/services/tally-import-undo.test.ts` → FAIL (`NOT_IMPLEMENTED`).

- [ ] **Step 3: Implement.** Service side:

```typescript
async undoBatch(
  organizationId: string,
  actorUserId: string,
  batchId: string,
): Promise<ImportBatchDto> {
  const batch = await tallyImportRepository.findBatchById(organizationId, batchId);
  if (!batch) throw new NotFoundError("Import batch not found");
  if (batch.status !== "COMPLETED" && batch.status !== "FAILED") {
    throw new AppError("IMPORT_NOT_UNDOABLE", `Cannot undo a batch in status ${batch.status}`, 409);
  }

  return auditService.withAudit(
    { type: "USER", id: actorUserId },
    "import.batch.undo",
    { type: "ImportBatch", id: batchId },
    async () => {
      const records = await tallyImportRepository.listRecords(organizationId, batchId);
      let referencedCount = 0;

      for (const record of [...records].reverse()) {
        if (!record.entityId) continue;
        if (record.action === "CREATED") {
          referencedCount += await tallyImportRepository.countReferences(
            organizationId, record.entityType, record.entityId,
          );
          await tallyImportRepository.softDeleteEntity(
            organizationId, record.entityType, record.entityId,
          );
        } else if (record.action === "UPDATED" && record.beforeJson) {
          await tallyImportRepository.restoreEntitySnapshot(
            organizationId, record.entityType, record.entityId,
            record.beforeJson as Record<string, unknown>,
          );
        }
      }

      const updated = await tallyImportRepository.updateBatch(organizationId, batchId, {
        status: "REVERTED",
        finishedAt: new Date(),
        error:
          referencedCount > 0
            ? `${referencedCount} entities referenced by later imports were soft-deleted`
            : null,
      });
      return toBatchDto(updated);
    },
  );
},
```

Repository side — implement the three helpers with a `switch (entityType)` over `"Party" | "Item" | "Invoice" | "Bill" | "Payment"`; each case runs one `prisma.$transaction` that (a) for Payments: `paymentAllocation.deleteMany({ where: { paymentId } })` then soft-delete the payment and delete its ADJUSTMENT stock movements; (b) for Invoices/Bills: delete line items + stock movements for the source, soft-delete the document; (c) for Party/Item: soft-delete only. `countReferences` counts non-deleted invoices+bills+payments pointing at a Party, and line-items+movements pointing at an Item; returns 0 for document types. If Phase 1's `paymentService.allocatePayment` maintains `Invoice.amountPaid`, deleting a payment's allocations must recompute it — call the Phase 1 recompute helper if one exists (Task 0 reconciliation), otherwise `prisma.invoice.update` with `amountPaid: { decrement: allocation.amount }` per deleted allocation, inside the same transaction.

- [ ] **Step 4: Run tests** — `npx vitest run tests/unit/services/tally-import-undo.test.ts && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/import/ src/server/repositories/tally-import.repository.ts tests/unit/services/tally-import-undo.test.ts
git commit -m "feat(import): batch undo with reverse-order revert and audit trail"
```

---

### Task 10: Inngest Job + API Routes

**Files:**
- Modify: `src/lib/jobs/types.ts` (new event + scheduler method)
- Modify: `src/lib/jobs/inngest/scheduler.ts`
- Modify: `src/server/workflows/inngest/functions.ts`
- Create: `src/app/api/import/tally/route.ts`
- Create: `src/app/api/import/batches/route.ts`
- Create: `src/app/api/import/batches/[id]/route.ts`
- Create: `src/app/api/import/batches/[id]/undo/route.ts`
- Create: `src/app/api/import/batches/[id]/report/route.ts`
- Test: `tests/unit/workflows/tally-import-workflow.test.ts`

**Interfaces:**
- Consumes: `tallyImportService` (Task 6–9 surface), `withApiHandler` from `src/lib/api/handler.ts` (`handler(request, context: ApiContext, params)`), `successResponse`/`errorResponse` from `src/lib/api/response.ts` (match existing routes' usage — read `src/app/api/invoices/route.ts` first and mirror it).
- Produces: HTTP surface used by the wizard (Task 12):
  - `POST /api/import/tally` body `{ source, fileName, xml }` → 202 `{ batch }` (created + job enqueued)
  - `GET /api/import/batches` → `{ batches }`
  - `GET /api/import/batches/:id` → `{ batch, records }` (poll target)
  - `POST /api/import/batches/:id/undo` → `{ batch }`
  - `GET /api/import/batches/:id/report` → `text/csv` download
- Event: `JOB_EVENTS.TALLY_IMPORT_RUN = "invoicepilot/import.tally.run"`, data `{ organizationId, batchId }`.

- [ ] **Step 1: Extend job plumbing.** In `src/lib/jobs/types.ts` add to the interface and constant:

```typescript
  enqueueTallyImport(organizationId: string, batchId: string): Promise<void>;
```

```typescript
  TALLY_IMPORT_RUN: "invoicepilot/import.tally.run",
```

In `src/lib/jobs/inngest/scheduler.ts` add to `InngestJobScheduler`:

```typescript
  async enqueueTallyImport(organizationId: string, batchId: string): Promise<void> {
    await inngest.send({
      name: JOB_EVENTS.TALLY_IMPORT_RUN,
      data: { organizationId, batchId },
    });
  }
```

- [ ] **Step 2: Write the failing workflow test** in `tests/unit/workflows/tally-import-workflow.test.ts` — mock `tallyImportService.runBatch` and assert the Inngest function handler (invoke the exported function's handler directly with a fake `{ event: { data: { organizationId: "org-1", batchId: "b-1" } }, step: { run: (_n: string, fn: () => unknown) => fn() } }`) calls `runBatch("org-1", "b-1")` and returns its result. Run → FAIL.

- [ ] **Step 3: Add the workflow** to `src/server/workflows/inngest/functions.ts`:

```typescript
import { tallyImportService } from "@/server/services/import/tally-import.service";

export const tallyImportWorkflow = inngest.createFunction(
  // Idempotent by GUID+ALTERID, so a retry after a mid-batch crash safely
  // re-skips already-imported records. Progress is visible via batch counters.
  { id: "tally-import-run", name: "Tally Import Batch", retries: 2 },
  { event: JOB_EVENTS.TALLY_IMPORT_RUN },
  async ({ event, step }) => {
    const { organizationId, batchId } = event.data as { organizationId: string; batchId: string };
    return step.run("run-batch", () => tallyImportService.runBatch(organizationId, batchId));
  },
);
```

Append `tallyImportWorkflow` to the exported `inngestFunctions` array. Run the workflow test → PASS.

- [ ] **Step 4: Write the routes.** Each follows the existing pattern exactly (`withApiHandler`, zod parse, service call, `successResponse`). `POST /api/import/tally` (`src/app/api/import/tally/route.ts`):

```typescript
import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { createTallyImportSchema } from "@/lib/validations/import";
import { tallyImportService } from "@/server/services/import/tally-import.service";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";

export const POST = withApiHandler(
  async (request, context) => {
    const body = createTallyImportSchema.parse(await request.json());
    const batch = await tallyImportService.createBatch(context.organizationId, body);
    await getJobScheduler().enqueueTallyImport(context.organizationId, batch.id);
    return successResponse({ batch }, 202);
  },
  { rateLimit: { limit: 10, windowMs: 60_000 } },
);
```

The other four routes are one-liners over `listBatches` / `getBatch`+`listRecords` / `undoBatch(context.organizationId, context.userId, params.id)` / `getRecordsCsv` (the report route returns `new Response(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="import-${params.id}.csv"` } })`). If `successResponse` has a different signature than `(data, status?)`, mirror whatever `src/app/api/invoices/route.ts` actually does.

- [ ] **Step 5: Verify** — `npm run typecheck && npm run lint && npx vitest run` → all green. Manually exercise once: `npm run dev`, then

```bash
curl -s -X POST localhost:3000/api/import/tally -H "content-type: application/json" \
  -d '{"source":"TALLY_MASTERS_LEDGERS","fileName":"x.xml","xml":"<ENVELOPE>…"}'
```

Expected: 401 (unauthenticated) — proves the handler + auth wiring is live; authenticated end-to-end happens in Task 13's gate.

- [ ] **Step 6: Commit**

```bash
git add src/lib/jobs/ src/server/workflows/ src/app/api/import/ tests/unit/workflows/
git commit -m "feat(import): tally import API routes and Inngest job with progress counters"
```

---

### Task 11: `docs/TALLY.md` — Import Guide & HTTP-XML Note

**Files:**
- Modify: `docs/TALLY.md` (created in Phase 0 Task 9; append two sections)

- [ ] **Step 1: Append an "Importing into Invoice Chaser" section** covering, concretely: the required order (1. ledgers masters, 2. stock-item masters, 3. vouchers), the wizard path (`Dashboard → Imports → New import`), the 4 MB per-file limit with the workaround (export Day Book period-by-period, oldest first — receipts must follow the sales they settle), what each result status means (created/updated/skipped/errored), how re-imports behave (GUID+ALTERID idempotency — re-importing the same file is always safe), unmatched bill refs (receipts referencing invoices from before your first export window stay unallocated — either extend the export window or allocate manually on the Payments screen), and batch undo (reverts creations, restores updates; payments are undone before their invoices).

- [ ] **Step 2: Append an "Optional: LAN auto-sync via Tally HTTP-XML (future enhancement)" section**: Tally Prime ships an HTTP-XML server (`F1 → Settings → Connectivity → Client/Server configuration`, default port 9000); a small helper on the LAN can POST export requests (`<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>…`) on a schedule and forward the XML to `POST /api/import/tally` with an API token. State explicitly: **not built in Phase 2**; the file-upload path is canonical; this section exists so the enhancement has a recorded design sketch.

- [ ] **Step 3: Commit**

```bash
git add docs/TALLY.md
git commit -m "docs: tally import guide and HTTP-XML auto-sync sketch"
```

---

### Task 12: Import Wizard UI (Stitch-designed)

**Files:**
- Create: `src/app/dashboard/imports/page.tsx`
- Create: `src/modules/imports/components/import-wizard.tsx`
- Create: `src/modules/imports/components/batch-list.tsx`
- Create: `src/modules/imports/components/batch-detail.tsx`
- Modify: `src/components/layout/*` navigation (add "Imports" link — find the nav component via `grep -rn "Invoices" src/components/layout`)
- Modify: `docs/design/SCREEN_INVENTORY.md` (mark Imports wizard designed/implemented)
- Delete: `src/modules/invoices/components/import-dialog.tsx` Tally tab **only after** Step 6 (CSV import stays)
- Delete: `src/lib/import/tally-parser.ts` (legacy, superseded)
- Test: `tests/e2e/imports.spec.ts` (Playwright smoke)

**Interfaces:**
- Consumes: Task 10 HTTP surface; Tasks 2–4 parsers (client-side preview — they are isomorphic); Stitch project + design system IDs from `docs/design/DESIGN_SYSTEM.md` (Phase 0 Task 8).

- [ ] **Step 1: Design in Stitch first** (parent plan decision 6; consult the `stitch-first-design` skill before Stitch calls). In the existing "InvoicePilot" Stitch project, generate an "Imports wizard" screen: stepper (1 Upload masters → 2 Upload vouchers → 3 Preview & warnings → 4 Import progress → 5 Results), file dropzone, preview table with warning badges (missing email/phone on parties), progress bar with live counts, results summary with created/updated/skipped/errored chips, "Download mapping report" and "Undo this import" actions. Record the screen ID in `docs/design/SCREEN_INVENTORY.md`.

- [ ] **Step 2: USER ACTION — user reviews the Stitch screen** and approves or iterates (parent Phase 3 gate rule applies to this screen now since Phase 2 ships it). Record approval in `SCREEN_INVENTORY.md`.

- [ ] **Step 3: Implement the page** with shadcn components matching the approved design. Behavior spec:
  - `page.tsx`: renders `<BatchList />` (TanStack Query on `GET /api/import/batches`, 5s `refetchInterval` while any batch is RUNNING) and a "New import" button opening `<ImportWizard />`.
  - `ImportWizard`: three upload steps in the fixed order ledgers → stock items → vouchers, each optional-but-recommended (skip buttons); on file select, read text, guard `file.size <= MAX_TALLY_XML_BYTES` (import the constant from `@/lib/validations/import`), run the matching parser (`parseLedgers`/`parseStockItems`/`parseVouchers`) client-side and show: record count, per-kind breakdown for vouchers, and the `warnings` list; parties missing email/phone get a warning row "no email — reminders can't be sent; fill it on the Party page after import".
  - "Start import" per step: `POST /api/import/tally`, then advance to a progress view polling `GET /api/import/batches/:id` every 2s until status is COMPLETED/FAILED, rendering `processedCount/totalCount` as a progress bar and then the four counters.
  - `BatchDetail`: records table (entityType, action chip, message), "Download report" → `/api/import/batches/:id/report`, "Undo" button (confirm dialog: "This reverts N created and M updated records") → `POST .../undo`, then invalidate queries. Toasts via `sonner` like existing screens.

- [ ] **Step 4: Playwright smoke test** `tests/e2e/imports.spec.ts` (reuse Phase 1's Playwright auth setup): navigate to `/dashboard/imports`, expect the "New import" button and the batches table heading to be visible. Run: `npx playwright test tests/e2e/imports.spec.ts` → PASS.

- [ ] **Step 5: Verify responsive + dark mode** manually (`npm run dev`, toggle theme, narrow viewport) — table scrolls horizontally inside its container, stepper stacks vertically on mobile.

- [ ] **Step 6: Remove the legacy Tally path.** Delete `src/lib/import/tally-parser.ts`; in `src/modules/invoices/components/import-dialog.tsx` remove the Tally tab/branch (keep CSV) and add a link "Importing from Tally? Use the new import wizard →" pointing at `/dashboard/imports`. Delete any Phase 1 characterization tests that targeted the old parser (they locked behavior we have now intentionally replaced — note this in the commit message).

Run: `npm run typecheck && npm run lint && npx vitest run` → green (proves nothing else imported the legacy parser).

- [ ] **Step 7: Commit**

```bash
git add -A src/app/dashboard/imports src/modules/imports src/components/layout src/modules/invoices docs/design tests/e2e/imports.spec.ts
git rm src/lib/import/tally-parser.ts 2>/dev/null; git add -A
git commit -m "feat(import): stitch-designed import wizard, batch UI with undo; retire legacy tally parser"
```

---

### Task 13: Phase Gate — Round-Trip Verification

**Files:**
- Create: `tests/integration/tally-roundtrip.test.ts`
- Create: `docs/setup/PHASE-2-GATE.md`
- Modify: `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (tick Phase 2 gate line)

The parent plan's gate: **user's real Tally export imports with 0 unexplained errors; re-import produces 0 duplicates; receivables total matches Tally's outstanding report.**

- [ ] **Step 1: Write the integration round-trip test** `tests/integration/tally-roundtrip.test.ts` against a real test database (reuse Phase 1's integration-test DB setup; if Phase 1 established a `TEST_DATABASE_URL` + `beforeEach` truncation helper, use it — check `tests/integration/` for the existing pattern). The test, end to end with **no mocks**:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { tallyImportService } from "@/server/services/import/tally-import.service";
import { createTestOrganization, resetDatabase } from "../helpers/db"; // Phase 1 helper — reconcile path

const FIXTURES = join(__dirname, "../fixtures/tally");
const read = (f: string) => readFileSync(join(FIXTURES, f), "utf8");

describe("tally round-trip on real fixtures", () => {
  let organizationId: string;

  beforeAll(async () => {
    await resetDatabase();
    organizationId = (await createTestOrganization()).id;
  });

  async function runAll() {
    const results = [];
    for (const [source, file] of [
      ["TALLY_MASTERS_LEDGERS", "masters-ledgers.xml"],
      ["TALLY_MASTERS_STOCKITEMS", "masters-stockitems.xml"],
      ["TALLY_VOUCHERS", "vouchers-daybook.xml"],
    ] as const) {
      const batch = await tallyImportService.createBatch(organizationId, {
        source, fileName: file, xml: read(file),
      });
      results.push(await tallyImportService.runBatch(organizationId, batch.id));
    }
    return results;
  }

  it("first import: creates records, zero unexplained errors", async () => {
    const results = await runAll();
    for (const r of results) {
      expect(r.status).toBe("COMPLETED");
      // Every errored record must carry a message (explained); unexplained = bug
      const records = await tallyImportService.listRecords(organizationId, r.id);
      for (const rec of records.filter((x) => x.action === "ERRORED")) {
        expect(rec.message, `unexplained error on ${rec.tallyGuid}`).toBeTruthy();
      }
      expect(r.createdCount).toBeGreaterThan(0);
    }
  });

  it("re-import: zero duplicates, everything skipped", async () => {
    const before = {
      parties: await prisma.party.count({ where: { organizationId, deletedAt: null } }),
      items: await prisma.item.count({ where: { organizationId, deletedAt: null } }),
      invoices: await prisma.invoice.count({ where: { organizationId, deletedAt: null } }),
      bills: await prisma.bill.count({ where: { organizationId, deletedAt: null } }),
      payments: await prisma.payment.count({ where: { organizationId, deletedAt: null } }),
    };
    const results = await runAll();
    for (const r of results) {
      expect(r.createdCount).toBe(0);
      expect(r.updatedCount).toBe(0);
    }
    const after = {
      parties: await prisma.party.count({ where: { organizationId, deletedAt: null } }),
      items: await prisma.item.count({ where: { organizationId, deletedAt: null } }),
      invoices: await prisma.invoice.count({ where: { organizationId, deletedAt: null } }),
      bills: await prisma.bill.count({ where: { organizationId, deletedAt: null } }),
      payments: await prisma.payment.count({ where: { organizationId, deletedAt: null } }),
    };
    expect(after).toEqual(before);
  });

  it("undo then re-import restores identical counts", async () => {
    const batches = await tallyImportService.listBatches(organizationId);
    const voucherBatch = batches.find((b) => b.source === "TALLY_VOUCHERS" && b.status === "COMPLETED");
    expect(voucherBatch).toBeDefined();
    const user = await prisma.user.findFirstOrThrow();
    await tallyImportService.undoBatch(organizationId, user.id, voucherBatch!.id);
    expect(await prisma.invoice.count({ where: { organizationId, deletedAt: null, tallyGuid: { not: null } } })).toBe(0);

    const batch = await tallyImportService.createBatch(organizationId, {
      source: "TALLY_VOUCHERS", fileName: "vouchers-daybook.xml", xml: read("vouchers-daybook.xml"),
    });
    const rerun = await tallyImportService.runBatch(organizationId, batch.id);
    expect(rerun.status).toBe("COMPLETED");
    expect(rerun.erroredCount).toBe(0);
  });

  it("receivables total matches Tally outstanding (user-verified figure)", async () => {
    // USER ACTION: read Tally Prime → Display → Statements of Accounts →
    // Outstandings → Receivables for the fixture period, and set the env var:
    //   TALLY_EXPECTED_RECEIVABLES=123456.78 npx vitest run tests/integration/tally-roundtrip.test.ts
    const expected = process.env.TALLY_EXPECTED_RECEIVABLES;
    if (!expected) {
      console.warn("TALLY_EXPECTED_RECEIVABLES not set — gate figure must be checked manually");
      return;
    }
    const invoices = await prisma.invoice.findMany({
      where: { organizationId, deletedAt: null, type: "RECEIVABLE" },
      select: { amount: true, amountPaid: true },
    });
    const outstanding = invoices.reduce(
      (sum, i) => sum + Number(i.amount) - Number(i.amountPaid ?? 0),
      0,
    );
    expect(outstanding).toBeCloseTo(Number.parseFloat(expected), 2);
  });
});
```

- [ ] **Step 2: Run the round-trip suite** — `npx vitest run tests/integration/tally-roundtrip.test.ts` (with the integration DB up). Every failure here is a real Phase 2 defect: fix in the owning task's files (with a regression unit test) until green.

- [ ] **Step 3: USER ACTION — live gate run.** User uploads their real exports through the wizard on a deployed preview, then reads Tally's Outstandings → Receivables figure and confirms it matches the dashboard. Re-runs the same upload and confirms all-skipped. Record both figures, the batch IDs, and sign-off (name + date) in `docs/setup/PHASE-2-GATE.md` along with a status table for Tasks 0–12 and open risks (e.g. unmatched historical receipts).

- [ ] **Step 4: Tick the Phase 2 gate** in the master plan file and commit:

```bash
git add tests/integration/tally-roundtrip.test.ts docs/setup/PHASE-2-GATE.md docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md
git commit -m "test: phase 2 gate — tally round-trip, idempotency, receivables reconciliation"
```

Phase 5 (analytics) may now be planned; Phases 3–4 unblock per the master sequencing diagram.

---

## Self-Review Notes

- **Spec coverage** (master plan Phase 2 items): (1) Masters import → Tasks 2, 3, 6. (2) Full voucher engine with VCHTYPE routing incl. `ALLINVENTORYENTRIES.LIST`, `BILLALLOCATIONS.LIST`, credit/debit notes → Tasks 4, 7, 8. (3) GUID+ALTERID idempotency, ImportBatch UI with created/updated/skipped/errored + undo → Tasks 5, 6, 9, 12. (4) Stitch-designed wizard with warnings preview and downloadable mapping report → Task 12 (+ CSV report in Task 6/10). (5) Pure-function parsers unit-tested on real fixtures; large files via Inngest with progress → Tasks 1–4 (purity), 10 (job), progress counters in Task 6. (6) docs/TALLY.md incl. HTTP-XML path → Task 11. Gate → Task 13, matching the master gate verbatim.
- **Deliberate scope decisions:** changed money vouchers are SKIPPED-with-message rather than updated (safe re-allocation needs a deallocation API this phase doesn't own — undo + re-import is the documented path); files > 4 MB are rejected with a documented split-by-period workaround (application-level cap, see Global Constraints) instead of building blob-storage streaming; godowns/batches from the master plan §0.1 schema list are parsed-through but not modeled (no `godown` field landed in the §0.3 blueprint's `StockMovement` "Key fields" the contract froze — if Phase 1 shipped one, populate it during Task 0 reconciliation from the inventory entry's `GODOWNNAME`).
- **Type consistency:** `tallyImportService` signatures in Task 6's Produces block are the ones used by Tasks 9–13; repository surface fixed in Task 5 and consumed unchanged; parser types fixed in Task 1. Assumed Phase 1 shapes are all funneled through Task 0's reconciliation step so a mismatch is caught before code.
- **Placeholder scan:** the only deferred implementations are explicit `NOT_IMPLEMENTED` stubs that a named later task replaces with shown code (Task 6 → 7/8, Task 6 → 9); fixture-dependent exact counts are pinned by in-test computation from the fixture bytes (no TBD values). Task 7 Step 1 and Task 12 Step 3 specify behavior as testable spec tables/bullets with exact names and values rather than full listings — every referenced function/type is defined in a Produces block.
