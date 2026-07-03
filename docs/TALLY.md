# Tally Prime Export Runbook

How to export data from Tally Prime for InvoicePilot import (Phase 2 parser). This is the file-first path locked in by ADR-003 — no live LAN sync in Phase 0-2.

## 1. Masters — Ledgers (parties)

`Gateway of Tally → Display More Reports → List of Accounts → Alt+E (Export) → XML`

- Set **Format** to `XML (Data Interchange)`.
- Under export configuration, enable **"All masters"** detail level so GSTIN, address, opening balance, and credit period fields are included (not just names).
- Save as `masters-ledgers.xml`.

## 2. Masters — Stock Items

Same path, for stock items: `Gateway of Tally → Display More Reports → List of Accounts` (or `Inventory Info → Stock Items` depending on Tally Prime version) `→ Alt+E → XML`, same "All masters" detail level.

- Save as `masters-stockitems.xml`.

## 3. Vouchers — Day Book (all voucher types)

`Gateway of Tally → Display More Reports → Day Book → set period (Alt+F2, choose the full range to export) → Alt+E → XML`

- This captures all voucher types in the period: Sales, Purchase, Receipt, Payment, Credit Note, Debit Note.
- Alternative for sales-only: `Display More Reports → Sales Register → Alt+E → XML` — use this only if the Day Book file is too large; the parser needs vouchers of at least the four core types (Sales, Purchase, Receipt, Payment) to be testable end-to-end, so prefer Day Book if it's reasonably sized.
- **Enable bill-wise details:** in Tally's voucher/report configuration (F12 configuration on the report screen), ensure "Show Bill-wise Details" / bill allocation info is turned on before exporting — this is what produces `BILLALLOCATIONS.LIST` in the XML, required for payment-to-invoice matching.
- Save as `vouchers-daybook.xml`.

## What the export must cover

For the Phase 2 parser to be tested meaningfully, the voucher export must include **at least one of each**: Sales, Purchase, Receipt, Payment voucher, with bill-wise allocations present on at least the Receipt/Payment vouchers. If the chosen date range doesn't naturally contain all four types, widen it or export multiple periods and concatenate before sanitizing.

## Next steps once files are delivered

1. Deliver `masters-ledgers.xml`, `masters-stockitems.xml`, `vouchers-daybook.xml` to the agent (via this repo's `tests/fixtures/tally/` directory or another shared path).
2. Sanitization pass — see `tests/fixtures/tally/README.md` for what needs anonymizing and what's recorded there.
3. Fixture inventory — voucher type counts, presence of `GUID`/`ALTERID`/`BILLALLOCATIONS.LIST`/`ALLINVENTORYENTRIES.LIST`/GST fields — recorded in the same README, scoping exactly what Phase 2's parser must handle.
