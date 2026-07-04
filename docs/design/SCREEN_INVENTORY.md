# Screen Inventory — InvoicePilot

The 12 screens from the parent plan §0.1 decision 6. Phase 3 iterates each of these in Stitch (project `projects/7229335890257417243`) before implementation. Dashboard is the Phase 0 pilot (see `DESIGN_SYSTEM.md`); the rest are generated in Phase 3.

| # | Screen | Purpose | Primary actions | Data shown | Phase |
|---|---|---|---|---|---|
| 1 | App shell / navigation | Persistent frame: sidebar nav, org switcher, user menu, assistant entry point | Switch org, open assistant, sign out | Nav items, current org, current user | 3 |
| 2 | Dashboard | At-a-glance financial health (pilot screen generated in Phase 0, restyled in Task 5) | Jump to invoices due soon, remind, view aging detail, quick-create invoice/payment/import | Money to come/pay, pending invoices count+value, overdue value, aging chart, receivables-by-status chart, recent activity, invoices due soon table | 3 |
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

## Task 5 — App Shell + Dashboard (Batch A), pending human design review

Both screens below are **candidate** designs generated/iterated in Stitch project `projects/7229335890257417243` against design-system asset `assets/5052952801528952529`. They are recorded here for the Task 6 human design-review gate — not yet marked approved.

### Row 1 — App shell / navigation (new screen)

| Variant | Screen ID | Notes |
|---|---|---|
| Light (desktop) | `projects/7229335890257417243/screens/b45d601ef84a43ef9f281b4ce335ef26` | New screen — did not exist from the Phase 0 pilot. Fixed 260px sidebar with nav in brief order (Dashboard active, Invoices, Bills, Parties, Stock, Payments, Imports, Reminders, Settings), a visually separated "Coming soon" section with **disabled** "Analytics" and "Assistant" items each carrying a "Soon" pill, a collapse-toggle affordance at the sidebar foot (for icon-only tablet collapse / off-canvas mobile drawer, described in the prompt since Stitch renders one static breakpoint), pinned "Ask Assistant" button, Help/Support links, and org/user footer. Top bar: page title ("Dashboard") + org breadcrumb ("Mehta Global Ventures"), global search, theme toggle, notification bell with unread dot, user avatar. Content area shows a placeholder 2x2 dashed-border grid to demonstrate the reusable `max-w-7xl` frame. |
| Dark | `projects/7229335890257417243/screens/c6bc199a32bd4667ac9b039bf7d26e9f` | `generate_variants` (COLOR_SCHEME, REFINE) off the light shell — near-black background/near-white foreground, same layout/copy/nav, moon icon shown active in the theme toggle, sidebar/card surfaces use a lighter near-black tier for depth. Verified visually: identical structure to light, only palette changed. |

**Design decision:** the app shell is a new screen (not present in the Phase 0 pilot); its sidebar is the canonical nav treatment (10 real items + 2 disabled "soon" slots) that later screens — including the existing pilot Dashboard/Analytics, whose sidebars predate this shell and still show Analytics as a live item — should be reconciled against during Task 7/8 implementation.

### Row 2 — Dashboard (iterated from Phase 0 pilot)

| Variant | Screen ID | Notes |
|---|---|---|
| Light (desktop) | `projects/7229335890257417243/screens/8e8b9689715e460bbfbfde024762eabd` ("InvoicePilot Dashboard - Updated") | Iterated via `edit_screens` off the approved pilot (`062263df22594523a01541d0268d1b53`), which is left untouched. Reused as-is: sidebar, "Receivables Aging" chart, "Recent Activity" feed, "Invoices Due Soon" table with sortable columns + search (all pre-existing and already approved). Added: (1) KPI row's 4th tile swapped from "Collection Rate" to "Pending Invoices" showing count ("12 Invoices") + total pending value, alongside the existing Money-to-Come/Money-to-Pay/Overdue tiles; (2) a new "Receivables by Status" stacked-bar + legend card next to the aging chart, breaking outstanding value into the 5 binding statuses (amber Pending, red Overdue, emerald Paid, blue Partially Paid, gray Written Off); (3) a "Quick Actions" row (New Invoice primary button, Record Payment and Import from Tally secondary/outline buttons) between the KPI tiles and the charts row. Verified via HTML diff (grep for "Pending Invoices", "Receivables by Status", "New Invoice", "Record Payment", "Import from Tally", "Partially Paid", "Written Off" — all present) and the rendered screenshot. |
| Dark | `projects/7229335890257417243/screens/a5fb9b5329c9411ebdc4a18afc353eb0` ("InvoicePilot Dashboard - Dark Mode") | `generate_variants` (COLOR_SCHEME, REFINE) off the updated light dashboard — same layout/data/copy, near-black background, status chips keep their dark-tinted semantic colors (verified visually: amber/red/emerald/blue/gray chips all legible against dark cards). |

**Design decision:** reused the approved pilot Dashboard rather than regenerating from scratch, since its structure (4-tile KPI row, chart pair, recent activity, invoices-due-soon table, sidebar) already matched the brief; only added the 3 pieces the brief asked for that were missing (Pending Invoices tile, receivables-by-status chart, quick actions row).

**Known pre-existing issue carried over (not introduced by this task, already documented above under "Pilot screen"):** the "Receivables Aging" bar chart's bars render invisible in the static Stitch screenshot (hand-rolled flex-height CSS bug, same root cause as the Analytics Date/Stock tab bug already documented) — the newly-added "Receivables by Status" chart uses a stacked single bar + legend instead of individual per-status bars and is unaffected. Phase 3 implementation should rebuild both charts with a real charting library (Recharts/Chart.js), not port Stitch's hand-rolled div bars.

**Approval status:** ⏳ pending Task 6 human design-review gate — not yet approved.
