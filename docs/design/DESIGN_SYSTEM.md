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

**Approval:** ⬜ pending user review (see Task 8 Step 5 — user reviews the pilot screen above and records approval or requested changes here before Phase 3 iterates the remaining 11 screens).
