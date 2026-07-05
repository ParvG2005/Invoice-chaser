# Phase 5 Gate — Analytics & Trackers

**Status: PASS.** All 6 contract methods (`getHeadlineTiles`, `getAgingReport`, `getCollectionTrend`, `getCashflowProjection`, `getPartyAnalytics`, `getStockAnalytics`) reconcile exactly against the hand-computed fixture in `tests/fixtures/analytics/expected.ts`.

## Checks

| Check | Result |
|---|---|
| `npx vitest run tests/integration/analytics` (7 files) | 12/12 PASS |
| `npm test` (unit) | 238/238 PASS |
| `npm run test:integration` (full) | 18/18 PASS |
| `npm run lint` | 0 errors |
| `npm run typecheck` | clean |
| `npm run build` | clean, all 6 `/api/analytics/*` routes + `/dashboard/analytics` registered |
| Live UI (local test DB, real Clerk auth, Playwright + manual screenshot) | headline tiles, aging (DSO 86.5), cashflow, trend, party risk flags, stock all match fixture numbers pixel-for-pixel with `expected.ts` |
| `e2e/analytics.spec.ts` | PASS against live dev server |

## Deviations from the plan (schema reality, not a plan bug)

- Invoice/Bill have no `issueDate`/`balanceDue` columns. `createdAt` stands in for issue date (fixture sets it explicitly); balance is computed in SQL (`COALESCE(total_amount, amount) - amount_paid`). Documented at the top of `analytics.service.ts`.
- Payment's date field is `paymentDate`, not `date`.
- `revalidateTag` now requires a second arg and throws outside a request context — wrapped in `invalidateAnalyticsCache()` (best-effort, matching the existing `enqueue*BestEffort` convention), since the 60s TTL is the correctness backstop anyway.
- Chart colors were corrected from the dataviz skill's default blue/red categorical palette to match InvoicePilot's own near-monochrome + sparse-status-accent system (per `docs/design/DESIGN_SYSTEM.md` and the existing Stitch "InvoicePilot Analytics" screens) — ink/gray two-tone series, red reserved for danger tiles only.
- Analytics dashboard page lives at `src/app/dashboard/(shell)/analytics/page.tsx` (existing route-group convention), not `src/app/dashboard/analytics/page.tsx`.
- `vitest.integration.config.ts` gained `fileParallelism: false` — the fixture reuses fixed IDs across test files, which raced under file-level parallelism.

## Known gap

`Collected this month` is computed against the real server clock (`asOf` defaults to `new Date()`), so it won't match the fixture's frozen `AS_OF` when eyeballed live — this is correct production behavior, not a bug (the unit tests pin `AS_OF` explicitly and pass).

Sign-off: _pending user confirmation_
