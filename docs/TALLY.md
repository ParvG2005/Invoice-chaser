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

## Importing into Invoice Chaser

**Required import order:** Always import in this sequence to satisfy foreign-key constraints:

1. Ledgers masters (`masters-ledgers.xml`)
2. Stock-item masters (`masters-stockitems.xml`)
3. Vouchers (`vouchers-daybook.xml`)

**Accessing the import wizard:**

Navigate to `Dashboard → Imports → New import` and select the XML file to upload. Each file must be processed through a separate import job.

**File size limits & workarounds:**

Each XML file is limited to 4 MB. If your Day Book export exceeds this, split it period-by-period:

- Export the oldest period first, then progressively newer periods.
- **Critical:** Ensure receipts appear *after* the sales they settle — this preserves bill allocation correctness. If a receipt in Period 2 references a sale in Period 1, ensure Period 1 is imported before Period 2.
- Import each period's file in chronological order.

**Result statuses:**

After import completes, the result screen shows per-record status:

- **created**: New record (party, stock item, or voucher) inserted.
- **updated**: Existing record (identified by GUID and ALTERID) matched and fields refreshed.
- **skipped**: Record already present and unchanged; no action taken.
- **errored**: Record failed validation or constraint check; see error message for details.

**Re-importing behavior:**

Invoice Chaser uses `GUID` and `ALTERID` fields to detect duplicate records. This means:

- Re-importing the same XML file is always safe — records are matched by these identifiers and either updated or skipped.
- **Idempotency is guaranteed:** running the import twice produces the same result as running it once.

**Unmatched bill references:**

If a receipt references an invoice (bill) that was created *before your first export window*, the receipt's bill allocation will remain unmatched in the import:

- **Solution 1:** Extend your Tally export window to include the original invoice. Re-import the enlarged voucher file.
- **Solution 2:** Manually allocate the receipt on the `Payments` screen after import completes. Search the receipt and link it to the matching invoice.

**Batch undo:**

If an import creates unwanted records, use the batch undo feature (available on the import result screen):

- **Reverts creations:** Records marked "created" are deleted entirely.
- **Restores updates:** Records marked "updated" are rolled back to their previous values.
- **Payment-before-invoice order:** Payments tied to invoices are undone *before* their invoices, so referential integrity is maintained.

## Optional: LAN auto-sync via Tally HTTP-XML (future enhancement)

Tally Prime includes a built-in HTTP-XML server that can export data without manual intervention. This section documents a potential enhancement; **it is not implemented in Phase 2**. The file-upload path (via the `Dashboard → Imports → New import` wizard) remains the canonical, tested path.

**How Tally HTTP-XML works:**

- Enable in Tally: `F1 → Settings → Connectivity → Client/Server configuration`
- Default port: `9000`
- Once enabled, Tally listens for XML export requests on `http://<tally-machine>:9000`

**Proposed enhancement design:**

A small helper service on the local network could:

1. POST an export request to the Tally HTTP-XML server:
   ```xml
   <ENVELOPE>
     <HEADER>
       <TALLYREQUEST>Export Data</TALLYREQUEST>
     </HEADER>
     <!-- Export parameters: ledgers, stock items, date range, etc. -->
   </ENVELOPE>
   ```
2. Receive the XML response containing the exported data.
3. Forward the XML to `POST /api/import/tally` with an API token (authenticating as a trusted service).
4. Run on a schedule (e.g., nightly) to keep Invoice Chaser synchronized.

**Benefits & considerations:**

- **Hands-off:** No manual file exports or uploads.
- **Frequency:** Can run as often as needed (nightly, hourly, etc.).
- **Traceability:** Audit trail of scheduled syncs (via API logs and import result screens).
- **Not yet built:** This enhancement is deferred to Phase 3 or later. For now, export manually and use the file-upload wizard.
