# ADR-003: Tally Prime integration is file-first, schema-complete

- **Status:** Accepted
- **Date:** 2026-07-03

## Context

Tally Prime is the user's system of record today. A basic XML parser already exists (`src/lib/import/tally-parser.ts`) but only handles a subset of the schema. Tally exposes data two ways: manual XML export from the desktop app, or an on-prem HTTP-XML server on the user's LAN that Tally can serve live. Full fidelity requires handling ledger/stock-item masters, and voucher types (sales/purchase/receipt/payment/credit-debit-notes) with `ALLLEDGERENTRIES.LIST`, `ALLINVENTORYENTRIES.LIST`, `BILLALLOCATIONS.LIST`, and GST fields — plus re-import safety, since users will re-export periodically.

## Decision

Primary integration path is **file-first**: the user exports Masters XML (ledgers, stock items) and Voucher XML (Day Book or Sales Register) from Tally Prime's UI and uploads them through `/api/import/tally`. The parser is built to the full voucher schema (all voucher types, bill allocations, inventory entries, GST fields), not just sales invoices. Every import is idempotent, keyed on Tally's `GUID` + `ALTERID` per record, recorded in an `ImportBatch`/`ImportRecord` pair so re-imports update changed records and skip unchanged ones instead of duplicating. The optional LAN HTTP-XML auto-sync bridge is documented as a later enhancement, not built in Phase 0-2.

## Alternatives considered

- **Live LAN HTTP-XML sync as the primary path:** rejected for now — requires the user's machine to run a sync helper reachable from Vercel (or a pull-based poller with network access to their LAN), which is a materially bigger and riskier build than "user uploads a file." Kept as a documented future enhancement once file-first import is proven.
- **Support only Sales Register / invoices, skip full voucher schema:** rejected — payables, payment matching, and inventory movements all depend on parsing Purchase/Receipt/Payment vouchers and `BILLALLOCATIONS.LIST`; deferring this would just mean rebuilding the parser in Phase 2 anyway.
- **Re-import as full replace-and-reimport (wipe and reload) instead of idempotent upsert:** rejected — destroys any in-app edits/communication history tied to imported records and can't distinguish "user re-exported the same period" from "data changed," which the gate criteria (0 duplicates on re-import) require.

## Consequences

- Easier: users control exactly when data syncs (no always-on bridge to secure/monitor); re-imports are safe to run repeatedly; parser is unit-testable against static fixture files.
- Harder: no real-time sync — data is only as fresh as the last manual export; the parser must handle Tally's full, occasionally inconsistent XML schema (optional fields, varying voucher structures across Tally versions).
- Committing to: real Tally export fixtures (Phase 0 Task 9) as the parser's test oracle, and to GUID+ALTERID as the permanent idempotency key for all future Tally sync work, including any future LAN bridge.
