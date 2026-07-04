# Phase 2 (Tally Import) Gate

Plan: `docs/superpowers/plans/2026-07-03-phase-2-tally-import.md`
Ledger: `.superpowers/sdd/progress.md` (full task-by-task detail; summarized below)

The parent master plan's Phase 2 gate is:

> **user's real Tally export imports with 0 unexplained errors; re-import produces 0 duplicates; receivables total matches Tally's outstanding report.**

This document records what has been verified automatically (Task 13) and what remains an **open item requiring a human** (the master plan's Phase 2 gate checkbox is deliberately left unticked pending that human step — see "What remains open" below).

## Task status (Tasks 0–13)

| Task | Status | Commit range | Note |
|---|---|---|---|
| 0 | Complete | e4e8d07..e0e3e11 | Reconciliation note vs. real Phase 1 interfaces; migration hand-authored, human should run `prisma migrate deploy` on the live DB. |
| 1 | Complete | e0e3e11..fc294b5 | Tally XML primitives and shared parser types. |
| 2 | Complete | fc294b5..52a3b02 | LEDGER masters parser; added CREDITPERIOD tag fallback for the real fixture. |
| 3 | Complete | 52a3b02..28ace1a | STOCKITEM masters parser; added GSTHSNCODE/GSTRATE top-level fallback. |
| 4 | Complete | 28ace1a..f223086 | Voucher parser; brief's sample code worked verbatim against the real fixture. |
| 5 | Complete | f223086..f23c389 | Import repository built against the real schema (not the plan's assumed one). |
| 6 | Complete | f23c389..988b9c9 | Import service skeleton; adapted to real `withAudit`/enum/field names, no double-audit. |
| 7 | Complete | 988b9c9..056d1d0 | Sales/Purchase voucher import; extended `invoiceService`; fixed idempotency-ordering bug (tallyAlterId stamped only after stock effects succeed). Open note: `invoiceService.update`'s `paidAt` reset isn't transition-guarded like `billService`'s (pre-existing, not introduced by Phase 2). |
| 8 | Complete | 056d1d0..a1d1ae9 | Money voucher import (RECEIPT/PAYMENT/CREDIT_NOTE/DEBIT_NOTE); fixed a real pre-existing bug in `payment.service.ts` (explicit empty `allocations[]` fell through to auto-FIFO). Open notes: one throw site uses bare `Error` instead of `AppError`; `inferPaymentMode` substring-match order is a heuristic. |
| 9 | Complete | a1d1ae9..8371c13 | Undo (`undoBatch`, `softDeleteEntity`, `restoreEntitySnapshot`, `countReferences`); fixed PAID→PENDING flip on payment undo to recompute against remaining allocations. Open notes: undo is not wrapped in one outer transaction across all records in a batch (each record's soft-delete/restore is its own transaction — safe-to-retry but a mid-loop failure leaves batch status un-updated). |
| 10 | Complete | 8371c13..56ba695 | Inngest job + API routes under `src/app/api/import/`. Minor pre-existing note: `getRecordsCsv` only quotes the message field. |
| 11 | Complete | 3dc46df | `docs/TALLY.md` import + HTTP-XML auto-sync docs (docs-only). |
| 12 | Complete | 302e5e9 | Import wizard UI, batch list/detail, undo button; retired legacy `tally-parser.ts`. Stitch design pass and Playwright e2e explicitly deferred (no Playwright harness exists in this repo). Minor open notes: no `isError` handling on batch queries (pre-existing convention); dropzone lacks keyboard/role semantics (inherited from old import-dialog). |
| 13 | Complete (this doc) | see below | Round-trip integration gate against a disposable database. Two real defects found and fixed (below). Receivables reconciliation and live sign-off deferred to a human — see "What remains open." |

## Task 13: round-trip integration test

**What was built:**
- `tests/integration/helpers/db.ts` — `resetDatabase()` (deletes all Organizations + Users; every org-scoped model cascades from Organization per `prisma/schema.prisma`) and `createTestOrganization()` (Organization + User + OrganizationMember).
- `tests/integration/tally-roundtrip.test.ts` — imports all three fixtures (`tests/fixtures/tally/{masters-ledgers,masters-stockitems,vouchers-daybook}.xml`) against a real disposable Postgres database with **no mocks**, exercising `tallyImportService` end to end.
- `vitest.config.ts` now excludes `tests/integration/**` from the default `vitest run` — CI's `npm test` step runs *before* `prisma migrate deploy` (see `.github/workflows/ci.yml`), so the default unit suite must stay DB-independent.
- `vitest.integration.config.ts` — a separate Vitest config scoped to `tests/integration/**/*.test.ts`, wired to `npm run test:integration`.

**Actual run against the disposable database** (`postgresql://postgres:test@localhost:5433/test`):

```
$ npm run test:integration

 ✓ tests/integration/tally-roundtrip.test.ts (4 tests) 308ms
   ✓ first import: creates records, zero unexplained errors
   ✓ re-import: zero duplicates, everything skipped
   ✓ undo then re-import restores identical counts
   ✓ receivables total matches Tally outstanding (user-verified figure) — SKIPPED (TALLY_EXPECTED_RECEIVABLES not set)

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

The fourth test only performs the reconciliation assertion when `TALLY_EXPECTED_RECEIVABLES` is set (per the brief's design — nobody in this automated pipeline has a real Tally export's Outstandings figure); it currently no-ops with a console warning. It is not a false pass — it genuinely did not check anything, by design, until a human supplies the real figure.

### Real defects found and fixed during this gate run

The round-trip test caught two genuine Phase 2 defects — not test-harness mistakes — that would have caused **silent data loss on re-import after undo**, and **phantom "failed" invoice imports** whenever a background job dispatch had a transient failure. Both are fixed with regression coverage:

1. **`src/server/services/invoice.service.ts` — `enqueueOverdueCheckBestEffort`** (new helper; call sites in `create`/`bulkCreate`).
   `invoiceService.create` awaited `getJobScheduler().enqueueOverdueCheck(organizationId)` *after* the Invoice row was already durably written. In this test environment `INNGEST_EVENT_KEY` isn't set, so that call threw "Failed to send event," and the exception propagated out of `create` — even though the invoice had been created successfully. The Tally import path (`importSalesVoucher` in `tally-import.service.ts`) treats any exception as "nothing created," writing an `ERRORED` `ImportRecord` with `entityId: null`. Net effect: **the invoice silently existed in the database but was completely untracked by the import record, invisible to undo, and miscounted as an error** in `errorCount`. This is not import-specific — any caller of `invoiceService.create`/`bulkCreate` in an environment where the Inngest event send fails transiently would see the same false failure on a successful write. Fixed by making the overdue-check enqueue best-effort (caught and logged, never thrown). Regression test: `tests/unit/invoice.service.test.ts` — "create does not throw and still returns the invoice when enqueueOverdueCheck fails."

2. **`src/server/repositories/tally-import.repository.ts` — `softDeleteEntity`** (Invoice/Bill/Party/Item branches).
   Undoing a batch only set `deletedAt` on the entity; it never cleared the org-scoped unique constraints (`invoiceNumber`, `billNumber`, `name`, `tallyGuid`). Postgres unique indexes here are not partial/filtered on `deletedAt IS NULL`, so a soft-deleted row still occupied its unique slot forever — **re-importing the same Tally document after an undo failed with "Unique constraint failed" on every entity type** (Invoice, Bill, Payment via `tallyGuid`, Party, Item), making "undo then re-import" completely broken. Fixed by nulling `tallyGuid` and renaming the non-nullable business key (e.g. `invoiceNumber` → `${invoiceNumber}__deleted-${entityId}`) at soft-delete time, for all five entity types handled by `softDeleteEntity`. No pre-existing unit test exercised the Invoice/Bill/Party/Item soft-delete branches' *content* (only the Payment branch's allocation-reversal math was covered) — the round-trip integration test is now the regression coverage for this fix; a future task could add repository-level unit tests for these branches specifically.

Both fixes were verified by re-running `npm run test:integration` to green (4/4 passing) after each fix, and confirmed via a scratch debug script (removed before commit) that inspected the actual `ImportRecord`/`Invoice` rows to trace the failure before attributing it to a specific line.

### Own-harness bugs also found and fixed (not product defects)

Two issues were in the test/config setup itself, corrected before attributing anything to product code:
- The brief's specified relative import path (`../helpers/db` from `tests/integration/tally-roundtrip.test.ts`) was inconsistent with its own specified directory layout (`tests/integration/helpers/db.ts`); the correct path is `./helpers/db`.
- The "undo then re-import" test's `batches.find(b => ...COMPLETED)` picked the *most recent* matching batch (list is newest-first), which after the prior "re-import" test is the all-skipped re-import batch, not the original batch that created the invoices. Narrowed the predicate to `createdCount > 0` to select the batch that actually needs undoing.

### `npm run typecheck && npm run lint && npm test` (default, DB-independent suite)

```
> tsc --noEmit                     — clean, 0 errors
> eslint                           — 0 errors, 13 pre-existing warnings (unused mock params in
                                      tests/unit/services/tally-import*.test.ts, not touched by this task)
> vitest run                       — 21 test files, 133 tests passed, 0 from tests/integration/**
```

Confirmed the integration test is excluded from the default sweep: `vitest run` (no args) reports 21 files / 133 tests, none of which is `tally-roundtrip.test.ts`.

## What remains open (requires a human)

1. **Master plan gate checkbox** (`docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md`) is **deliberately left unticked**. That checkbox represents the *full* Phase 2 gate, which includes the live human sign-off below — ticking it now would be premature and is explicitly out of scope for this automated task.

2. **Step 3 of the brief — USER ACTION, live gate run.** Nobody in this automated pipeline has access to a real user's Tally export or their Tally Prime "Statements of Accounts → Outstandings → Receivables" report figure. A human must:
   - Upload their real Tally exports (masters + vouchers) through the import wizard on a deployed preview environment.
   - Read the Outstandings → Receivables figure from Tally Prime for the same period and confirm it matches the dashboard's receivables total (or re-run `tests/integration/tally-roundtrip.test.ts` with `TALLY_EXPECTED_RECEIVABLES=<figure>` set, against a database seeded from the real export, to get an automated `toBeCloseTo` check).
   - Re-upload the same export and confirm the batch reports all-skipped (0 created, 0 updated).
   - Record both figures, the batch IDs, and a sign-off (name + date) in this document, then tick the master plan's gate checkbox.

3. **Receivables reconciliation assertion** in `tests/integration/tally-roundtrip.test.ts` is env-var-gated and was **not exercised with a real figure** in this run — only the create/idempotency/undo-reimport behavior was verified end-to-end.

## Other open risks carried forward from Tasks 7–12

These are pre-existing or minor items noted during Phase 2 development that a human reviewing this gate should be aware of — none of them blocked Task 13's round-trip test, but they are relevant to a live gate run:

- **Unmatched historical receipts / payment refs** (brief's own callout): a RECEIPT/PAYMENT voucher whose `Agst Ref` doesn't match any known bill/invoice number stays unallocated rather than guessed — expected behavior, but a human validating a real export should check the import wizard's warnings for "Unmatched bill ref" messages and reconcile them manually.
- **`invoiceService.update`'s `paidAt` reset isn't transition-guarded** (Task 7 note) — low-impact double-refresh of `paidAt` on repeated re-imports of an already-PAID invoice.
- **Undo is not wrapped in one outer transaction across all records in a batch** (Task 9 note) — each record's soft-delete/restore is its own transaction; a mid-loop failure during undo of a large batch leaves the batch's status un-updated (though individual record effects are safe-to-retry/idempotent).
- **`getRecordsCsv` only quotes the message field**, other CSV columns unquoted (Task 10 note) — low risk unless a Tally field itself ever contains a raw comma.
- **Stitch-designed wizard visual pass and Playwright e2e smoke test were deferred** (Task 12) — no Playwright harness exists in this repo, and the Stitch design pass requires human approval of generated screens. The wizard is functionally complete and hand-styled to match existing conventions, but has not had a design review or an automated browser-level smoke test.
- **Import wizard's dropzone lacks keyboard/role semantics** and batch list/detail queries have no `isError` handling (Task 12 notes, both pre-existing conventions inherited from earlier code, not regressions).
- **Undo of an UPDATED Sales/Purchase voucher does not restore its line items or stock movement history** (found during the final whole-branch review after Task 13). When a Sales/Purchase voucher is re-imported after being edited in Tally (same voucher, higher `ALTERID`), `importSalesVoucher`/`importPurchaseVoucher`'s UPDATE branch replaces the invoice/bill's line items and stock movements with the new state. The `ImportRecord.beforeJson` snapshot only captures the invoice/bill's own scalar columns (`JSON.parse(JSON.stringify(existing))`), not its line items or stock movements. As a result, `undoBatch`'s `restoreEntitySnapshot` correctly reverts scalar fields (e.g. `amount`) but leaves line items and the stock ledger reflecting the **post-update** state — inconsistent with the reverted invoice/bill. Stock-on-hand and line-item detail will not match the undone invoice/bill until corrected.
  - **Mitigation**: avoid undoing a batch that contains UPDATED Sales/Purchase voucher records when line-item or quantity accuracy matters. If such a batch has already been undone, re-importing the corrected voucher again is safe (all import steps are idempotent by GUID+ALTERID) and will bring line items and stock back in sync with the current state in Tally.
  - A full fix (snapshotting and restoring nested line items/stock movements on undo) was assessed as disproportionate risk for this fix pass, since it touches several already-reviewed tasks' code paths; it is deferred to a future task.

## Sign-off

_(To be completed by a human after Step 3 above.)_

- Tally export date range: ____
- Batch IDs (masters-ledgers / masters-stockitems / vouchers): ____ / ____ / ____
- Tally Outstandings → Receivables figure: ____
- Dashboard receivables total after import: ____
- Re-upload confirms all-skipped: yes / no
- Signed off by: ____  Date: ____
