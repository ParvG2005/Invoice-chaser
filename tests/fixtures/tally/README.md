# Tally Fixture Files

Real Tally Prime export files used as the parser test oracle for Phase 2. See `docs/TALLY.md` for the exact export steps.

## Status: ⬜ pending — USER ACTION

No fixture files have been delivered yet. Once the user runs the exports in `docs/TALLY.md` and hands over `masters-ledgers.xml`, `masters-stockitems.xml`, and `vouchers-daybook.xml`:

1. **Sanitize together with the user** — confirm party names, phone numbers, emails, and amounts in the files are OK to commit to this repo as-is, or anonymize via a consistent find-replace (same fake name/phone/email substituted everywhere a real one appears, so relationships between records stay intact) while keeping XML structure, voucher counts, and amounts unchanged. Record exactly what was changed below.
2. **If the user does not want any version of the data committed to git**, store the sanitized files outside the repo (e.g. a local-only path) and note that path + how a future contributor obtains them here instead of committing XML.
3. Place the resulting files directly in this directory (`tests/fixtures/tally/*.xml`).
4. Fill in the inventory table below — this directly scopes which voucher types, fields, and edge cases the Phase 2 parser must handle.

## Sanitization log

_None yet — fill in once fixtures are delivered and sanitized. Example format:_

| File | Change made |
|---|---|
| `masters-ledgers.xml` | Replaced real party names with `Party 1`, `Party 2`, ... (consistent per GUID); phone/email replaced with fake but structurally valid values. |

## Fixture inventory

_None yet — fill in per file once delivered._

| File | Voucher types present | Voucher count | Has `GUID` | Has `ALTERID` | Has `BILLALLOCATIONS.LIST` | Has `ALLINVENTORYENTRIES.LIST` | GST fields present |
|---|---|---|---|---|---|---|---|
| `masters-ledgers.xml` | n/a (masters) | — party count: TBD | TBD | TBD | n/a | n/a | TBD (GSTIN on ledgers) |
| `masters-stockitems.xml` | n/a (masters) | — item count: TBD | TBD | TBD | n/a | TBD (HSN/GST rate) | TBD |
| `vouchers-daybook.xml` | TBD (Sales/Purchase/Receipt/Payment/...) | TBD | TBD | TBD | TBD | TBD | TBD |
