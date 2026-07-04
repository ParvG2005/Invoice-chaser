# Screen Inventory — InvoicePilot

The 12 screens from the parent plan §0.1 decision 6. Phase 3 iterates each of these in Stitch (project `projects/7229335890257417243`) before implementation. Dashboard is the Phase 0 pilot (see `DESIGN_SYSTEM.md`); the rest are generated in Phase 3.

| # | Screen | Purpose | Primary actions | Data shown | Phase |
|---|---|---|---|---|---|
| 1 | App shell / navigation | Persistent frame: sidebar nav, org switcher, user menu, assistant entry point | Switch org, open assistant, sign out | Nav items, current org, current user | 3 |
| 2 | Dashboard | At-a-glance financial health (pilot screen generated in Phase 0) | Jump to invoices due soon, remind, view aging detail | Money to come/pay, overdue, collection rate, aging chart, recent activity, invoices due soon table | 3 |
| 3 | Invoices — list | Browse/filter/bulk-act on receivables | Filter (status/party/date), bulk remind, bulk export, create invoice | Invoice list: party, number, amount, due date, status | 3 |
| 4 | Invoices — detail | Single invoice deep-dive incl. history | Mark paid/partial, send reminder now, snooze, write-off, duplicate, export PDF | Line items, balance due, payment history, communication timeline | 3 |
| 5 | Invoices — editor | Create/edit an invoice | Add/remove line items, pick stock item, set party, save/send | Party picker, item picker, tax calc, totals | 3 |
| 6 | Bills (payables) | Supplier-side mirror of Invoices | Same as invoices, payable direction | Bill list + detail, supplier, due date, status | 3 |
| 7 | Parties & Agents | Directory + per-party ledger statement; agent → managed parties rollup | Add/edit party, view statement, assign agent | Party directory, GSTIN, credit terms, ledger statement, agent rollups | 3 |
| 8 | Stock | Item master, movements, low-stock alerts | Add/edit item, record adjustment, view movement history | Item list, SKU/HSN/GST rate, qty on hand, reorder level, movement log | 3 |
| 9 | Payments | Record receipts/payments with bill-wise allocation | Record payment, allocate to invoice(s)/bill(s) | Payment list, allocation breakdown, mode/date | 3 |
| 10 | Imports wizard | Guided Tally/CSV import | Upload Masters, upload vouchers, review preview/warnings, confirm import, download mapping report | Upload steps, preview table, created/updated/skipped/errored counts | 2 (parser + UI, implemented) |
| 11 | Reminders | Per-invoice schedule + sequence/tone/channel settings | Edit schedule, set tone, toggle channels (email/WhatsApp) | Reminder sequence config, per-invoice schedule, channel status | 3 |
| 12 | Analytics | Deeper receivables/payables/stock analytics | Change date range/filters, export | Aging buckets, DSO, collection rate trend, stock valuation, per-party/agent exposure & payment behavior score | 3 (initial) / 5 (full) |
| 13 | Assistant drawer | Side panel available on every screen; chat + pending-action approvals | Send message, approve/reject pending action | Conversation history, pending `AssistantAction` queue | 6 |
| 14 | Settings | Org, user, reminder defaults, channel credentials status | Edit org profile, manage members/roles, configure reminder defaults | Org settings, member list + roles, channel connection status | 3 |

Note: the parent plan's decision-6 list names 12 screens conceptually but splits Invoices into list/detail/editor (3 screens) — the table above enumerates 14 concrete Stitch screens to cover that split plus the Assistant drawer, matching how Phase 3's plan will actually iterate them.

**Row 10 footnote (Task 12):** the Imports wizard shipped directly against this row's spec (stepper, upload steps, preview/warnings, progress, created/updated/skipped/errored counts, download report, undo) using this codebase's existing hand-rolled UI conventions — it did **not** go through a Stitch design pass. Design sign-off for this screen is deferred to a human follow-up; if Stitch iteration later changes the visual design, update this row's Phase back to include a "3 (design pass)" note and record the screen ID/approval here as the other rows do.
