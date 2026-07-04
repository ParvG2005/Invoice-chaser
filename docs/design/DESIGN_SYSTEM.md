# Design System — InvoicePilot

Source of truth for visual design going into Phase 3 (Stitch Frontend Overhaul). Every new/rewritten screen is generated/iterated in Stitch against this design system, then implemented as shadcn/Tailwind components — see ADR-README's "Stitch-first UI" convention.

## Current brand tokens (extracted from `src/app/globals.css`, read-only)

| Token | Light | Dark |
|---|---|---|
| `--background` | `hsl(0 0% 100%)` — white | `hsl(240 10% 3.9%)` — near-black |
| `--foreground` | `hsl(240 10% 3.9%)` | `hsl(0 0% 98%)` |
| `--card` | `hsl(0 0% 100%)` | `hsl(240 10% 3.9%)` |
| `--primary` | `hsl(240 5.9% 10%)` — near-black | `hsl(0 0% 98%)` — near-white |
| `--primary-foreground` | `hsl(0 0% 98%)` | `hsl(240 5.9% 10%)` |
| `--muted` | `hsl(240 4.8% 95.9%)` | `hsl(240 3.7% 15.9%)` |
| `--muted-foreground` | `hsl(240 3.8% 46.1%)` | `hsl(240 5% 64.9%)` |
| `--border` | `hsl(240 5.9% 90%)` | `hsl(240 3.7% 15.9%)` |
| `--ring` | `hsl(240 5% 64.9%)` | `hsl(240 4.9% 83.9%)` |
| `--radius` | `0.75rem` (12px) | same |
| Font | Geist Sans (`--font-geist-sans`), Geist Mono for numeric/code | same |

Palette is neutral/near-monochrome (zero-saturation grays with a near-black primary) — no brand accent color yet. Status colors (paid/overdue/pending) are used ad hoc in existing UI, not yet tokenized.

## Stitch project

- **Project:** "InvoicePilot" — `projects/7229335890257417243`
- **Design system asset:** `assets/5052952801528952529` ("InvoicePilot Design System")
- Theme: color mode Light (dark mode described in design-system markdown, since Stitch's `create_design_system` takes one primary mode per asset), color variant Neutral, seed color `#18181B` (matches existing near-black `--primary`), font Geist (headline + body), roundness `ROUND_TWELVE` (12px, matches existing `--radius`).
- Design system markdown (`designMd`) encodes: light+dark parity requirement, data-dense/legible-over-decorative priority, sparse semantic status colors (green=paid, red=overdue, amber=pending), INR-first right-aligned tabular amounts, and a persistent AI-assistant entry point on every screen.

## Pilot screen

- **Dashboard** — `projects/7229335890257417243/screens/062263df22594523a01541d0268d1b53`
- Validates: sidebar nav with all 10 screens + pinned assistant entry, top KPI row (Money to Come / Money to Pay / Overdue / Collection Rate), receivables aging chart, recent activity feed, "Invoices Due Soon" table with per-row Remind action, Indian business names + INR amounts, neutral palette with sparse status accents.
- Screenshot reviewed 2026-07-04 — matches design-system intent (neutral, data-dense, 12px rounded cards, restrained accent color use).

**Approval:** ✅ approved 2026-07-04 (dashboard layout/KPIs/aging/activity confirmed good), with one requested change since applied — see below.

**Iteration 2026-07-04:** "Invoices Due Soon" table updated — every column header (Party Name, Invoice #, Amount, Due Date, Status) now has a sort icon, and a search input above the table filters rows by matching any column value (name/amount/date/etc). Verified in generated HTML (search input + `unfold_more` icons on all 5 headers landed; first attempt missed the sort icons, re-ran and confirmed via HTML diff, not just the screenshot — Stitch's screenshot renderer intermittently fails to load the icon font and shows a visually broken preview even when the underlying markup is correct).

## Second screen — Analytics

- **Analytics** — `projects/7229335890257417243/screens/3bb2600840db49968f065b0dc33df521`
- Generated 2026-07-04 per user request for per-attribute breakdowns, dedicated tab per attribute: **Party Name** (ranked table, outstanding amount + invoice count + avg days overdue), **Date** (monthly Invoiced-vs-Collected bar chart + date-range picker), **Status** (donut chart, Paid/Pending/Overdue with %), **Amount** (histogram of invoice counts by amount bucket), **Agent** (leaderboard: managed parties, collection rate, total collected), **Stock** (added as 6th tab per user follow-up: summary row — total stock value/SKUs/low-stock count — plus a 6-month value-vs-units trend chart).
- Same app shell, neutral palette, 12px cards, INR formatting as Dashboard pilot.
- **Approval:** ✅ approved 2026-07-04 — IA, tab structure, tables, and content confirmed good across all 6 tabs (Party Name, Date, Status, Amount, Agent, Stock), reviewed via live in-browser render of each tab, not just the static screenshot.
- **Known issue, deferred to Phase 3 (not blocking):** the Date and Stock tabs' trend charts are hand-rolled from raw divs (Stitch's prototype approach, not a real charting library) and have real rendering bugs verified live: Date tab's bars are invisible (`height: 100%` on a flex item whose immediate parent has no explicit height, inside an `items-end` container that doesn't stretch children); Stock tab's bars render as flat grey (Tailwind's `bg-primary/20` opacity-modifier syntax doesn't resolve against this design system's custom extended color tokens under the Play CDN build). Status (SVG donut), Amount (fixed-height histogram bars), Party Name, and Agent tabs all render correctly with no such issues. Phase 3 implementation should rebuild Date/Stock charts with a real chart library (Recharts/Chart.js) rather than porting this pattern.

## Imports wizard

- Stepper (Upload masters → Upload vouchers → Preview & warnings → Import progress → Results) built as hand-rolled numbered pills (matching this codebase's existing tab-switcher pattern, not a shadcn `Tabs` component — none exists in `src/components/ui/`), a drag-and-drop `.xml` dropzone reusing the `import-dialog.tsx` dropzone pattern, a client-side preview (record count, per-kind breakdown for vouchers, parser warnings, missing-email warning row for parties), a progress bar (plain styled `<div>`, polling every 2s), and results shown as `Badge` chips (created/updated/skipped/errored).
- Batch list and batch detail (records table, download report, undo with `window.confirm`) reuse the same hand-rolled overlay-dialog and table conventions as `import-dialog.tsx` and the AI preview modal on `src/app/dashboard/invoices/page.tsx`.
- Validates: neutral palette, 12px rounded cards/dialogs, dark-mode `dark:` classes throughout, consistent with the Dashboard and Analytics screens above.
- **Approval:** implemented directly per SCREEN_INVENTORY row 10 spec, no Stitch iteration — deferred to a human design pass.
