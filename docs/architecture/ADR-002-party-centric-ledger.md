# ADR-002: Party-centric ledger data model

- **Status:** Accepted
- **Date:** 2026-07-03

## Context

Today `Invoice.clientName`/`clientEmail`/`clientPhone` are free text — there is no shared identity for a customer across invoices, no supplier/payable side, no inventory, and no structured record of payments. Tally Prime (the primary import source) is built around ledger masters (parties) and stock item masters, with vouchers referencing them by GUID and doing bill-wise allocation of payments against specific invoices/bills. To import Tally data faithfully and to support receivables *and* payables, the schema needs a real party identity and a payment-allocation model, not just an invoice list.

## Decision

Model the domain around a `Party` entity (type: CUSTOMER/SUPPLIER/AGENT/BOTH) as the hub. `Invoice` gains `type` (RECEIVABLE/PAYABLE), `partyId`, `InvoiceLineItem`s, and derived `balanceDue`. New entities: `Item` + `StockMovement` (inventory), `Payment` (with `allocations[]` mirroring Tally's `BILLALLOCATIONS.LIST`), `Bill` (payable-side documents), `CommunicationLog` (unified email/WhatsApp log), `AuditLog`, `AssistantSession`/`AssistantAction`, `ImportBatch` (Tally/CSV provenance keyed by GUID + ALTERID). Existing `clientName`-style fields are kept during migration and backfilled into `Party` rows rather than dropped outright.

## Alternatives considered

- **Keep free-text client fields, add payments as a flat log against invoices only:** rejected — cannot represent suppliers/payables, cannot do bill-wise payment matching (a single payment often settles multiple invoices, which Tally already tracks), and blocks per-party analytics (aging, exposure, payment behavior score) required by later phases.
- **Model parties as two separate tables (Customer, Supplier):** rejected — Tally ledgers don't distinguish this way structurally (a ledger can be both), and agents managing multiple parties need a uniform shape; a single `Party` with a `type` enum and self-relation for agents is simpler and matches the import source.
- **Derive `balanceDue` and aging purely from live aggregation queries, no stored/derived fields:** considered for simplicity, deferred rather than rejected — Phase 0 blueprint keeps `amountPaid`/`balanceDue` as derived fields for query performance, revisit if materialized views (ADR-relevant to analytics, decision 7) make derived columns redundant.

## Consequences

- Easier: bill-wise payment allocation, payable-side tracking, per-party/agent analytics, faithful idempotent Tally re-import (GUID+ALTERID keyed).
- Harder: migration must backfill `Party` from historical free-text client fields without data loss, and every service touching invoices must become party-aware; more tables to keep org-scoped and soft-deletable.
- Committing to: `organization_id` scoping and soft deletes on every one of these new tables (per the program's global constraints), and to bill-wise allocation as the payment model instead of simple oldest-invoice-first matching.
