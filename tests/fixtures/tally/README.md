# Tally Fixture Files

Test oracle for the Phase 2 Tally parser. See `docs/TALLY.md` for the real export steps this is standing in for.

## Status: 🟡 synthetic fixtures in place (2026-07-04) — not a substitute for real data

**User has no Tally Prime access**, so real exports per `docs/TALLY.md` aren't obtainable right now. Instead, `masters-ledgers.xml`, `masters-stockitems.xml`, and `vouchers-daybook.xml` were hand-authored to match TallyPrime's real documented XML export schema (`ENVELOPE > BODY > EXPORTDATA > REQUESTDATA > TALLYMESSAGE > LEDGER/STOCKITEM/VOUCHER`, verified against Tally's own sample-XML docs and community API references), using fake but structurally realistic Indian business data.

**Known limitation:** synthetic data can validate that the parser handles the tag shapes it's supposed to, but it can't surface the idiosyncrasies a real company's export would have (unexpected voucher types, missing fields, encoding quirks, GST edge cases, real bill-wise reconciliation chains). Treat parser tests against these fixtures as necessary but not sufficient — swap in real exports the moment Tally Prime access exists, per `docs/TALLY.md`.

## Sanitization log

N/A — no real data was ever used; all party names, GSTINs, amounts, and voucher numbers are synthetic.

## Fixture inventory

| File | Voucher types present | Voucher count | Has `GUID` | Has `ALTERID` | Has `BILLALLOCATIONS.LIST` | Has `ALLINVENTORYENTRIES.LIST` | GST fields present |
|---|---|---|---|---|---|---|---|
| `masters-ledgers.xml` | n/a (masters) | 5 parties (4 debtors, 1 creditor) | Yes | Yes | n/a | n/a | Yes — `PARTYGSTIN` + `GSTREGISTRATIONTYPE` on every ledger |
| `masters-stockitems.xml` | n/a (masters) | 3 stock items | Yes | Yes | n/a | n/a | Yes — `GSTHSNCODE` + `GSTRATE` on every item |
| `vouchers-daybook.xml` | Sales (3), Purchase (1), Receipt (1), Payment (1) | 6 | Yes | Yes | Yes — on party ledger entries of every voucher (New Ref on sales/purchase, Agst Ref on receipt/payment) | Yes — on all 3 Sales + the 1 Purchase voucher | Yes — CGST/SGST/IGST ledger entries on Sales/Purchase vouchers |
