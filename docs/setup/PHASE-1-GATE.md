# Phase 1 Gate — Foundation & Data Model

Parent-plan gate: *"all existing features still work (invoices list/create/remind); new models covered by unit tests; migration runs clean against a copy of prod data."*

Branch: `worktree-phase-1-foundation-data-model` (worktree at `.claude/worktrees/phase-1-foundation-data-model`)

## Task Status

| Task | Description | Status | Evidence |
|---|---|---|---|
| 1 | Node/Next/React/TS/Tailwind upgrade | Done | `d5d73c5` |
| 2 | Prisma 7 upgrade, driver adapters, migrate baseline | Done | `49c6ba3` |
| 3 | Vitest + characterization tests (invoice service, tally parser) | Done | `77e2868` |
| 4 | Phase 1 core data model migration (Party, Item, Stock, Bill, Payment, audit, import, assistant tables) | Done | `5a7bc72`. Controller verified `_prisma_migrations` on live Supabase DB shows `0_init` + `20260704070457_phase1_core_data_model` applied. |
| 5 | Backfill `clientName` → `Party`, idempotent script | Done | `028e12a`, `710a6d5`. Deviation/caveat: DB-side create/reuse/link logic verified only against an empty dev DB (0 invoices) — real-data idempotency covered by unit tests of the pure grouping function, not the Prisma-side runner end-to-end. |
| 6 | AuditLog repository + `withAudit` helper | Done | `c483168`. Review clean. |
| 7 | Party repository + service | Done | `b9cba98`. Review clean. Note: `partyRepository.update` uses `Prisma.PartyUncheckedUpdateInput` (not `PartyUpdateInput`) to allow the `agentId` scalar — verified safe (org scoping enforced via `where`, not the data type). |
| 8 | Item + Stock repositories/services | Done | `ff0f3f8`. Review clean. |
| 9 | Bill repository + service | Done | `9473c22` + fix `81d7467`. One review round: `paidAt` was being overwritten on every update to an already-PAID bill, not just the transition into PAID — fixed and covered by a regression test. |
| 10 | Payment service with FIFO/bill-wise allocation | Done | `eec0819`. Review clean (opus-level review given financial logic). The `paidAt` re-stomp risk (same class as Task 9's bug) was traced and confirmed structurally impossible: `applyAllocation` guards `status !== "PAID"` before setting `paidAt`, and only open (non-PAID) documents ever reach an allocation write path. Two findings surfaced during the *final whole-branch review* (below) and were fixed in `6717844`. |
| 11 | RBAC — role enforcement in `lib/api/handler` | Done | `2a45b40` + fix `1ff42cd`. One review round: `parseRole` used `value in ROLE_RANK`, which matched `Object.prototype` property names (`"constructor"`, `"toString"`, etc.) instead of failing closed to `"viewer"` — fixed with `hasOwnProperty.call` and a regression test. |
| 12 | CI — test/migrate-check gates, `pages-build` script | Done (Steps 1–3 only) | `b51536e`. Steps 4–5 (push branch, open draft PR, confirm CI green against a live Postgres service, and the Cloudflare Pages dashboard build-command configuration) are **deferred** — pushing branches/opening PRs is a shared-visibility action left for explicit user action, not delegated to a subagent. |

## Step 2 — Full Automated Check (this session, on the worktree branch)

```
npm run lint && npm run typecheck && npm test && npm run build
```

Result: **all green.**
- `lint`: clean
- `typecheck`: clean
- `test`: 14 test files, 66 tests, all passed (mappers, invoice.service, tally-parser, party-backfill, audit.service, party.service, item.service, stock.service, bill.service, payment-allocation, payment.service, roles, api-handler, and one more)
- `build`: Next.js 16.2.10 (Turbopack) production build compiled successfully, all routes generated

## Step 1 — Prod-Copy Migration Rehearsal (N/A — superseded)

**Result: not applicable, by design, not skipped.** This project is pre-launch: there is no separate production database with real customer data. `sikdvtqrdqynknlvpsls` ("Invoice Chaser" on Supabase) is the only database, and it already has the Phase 1 migration (`0_init` + `20260704070457_phase1_core_data_model`) applied live — done directly during Task 4 and controller-verified against `_prisma_migrations`. A `pg_dump`/branch-and-restore rehearsal now would just be dumping a DB that's already past the schema state the rehearsal exists to de-risk (applying migrations to a copy of the *pre-migration* schema).

Confirmed with the user (2026-07-04) before deciding to skip rather than run a redundant dump: this is the only DB, no distinct prod project exists yet.

What this means in practice: the equivalent verification already happened for real, just not as a disposable rehearsal —
- `npx prisma migrate deploy` was run for real against `sikdvtqrdqynknlvpsls` in Task 4, and the migration applied cleanly (see Task 4 row above).
- `npm run db:backfill-parties` was run for real against the same DB in Task 5 — 0 invoices existed at the time, so the create/reuse/link path only exercised the empty case (already flagged as an open risk below); the idempotency logic itself is unit-tested against the pure grouping function.
- Before this database ever holds real customer data (i.e. before this app actually launches), re-run the backfill idempotency check (call it twice, second run must report 0 created/0 linked) against real invoice rows once some exist — that's the point at which this rehearsal becomes meaningful, and it should happen then rather than now.

## Step 3 — Manual Regression (USER ACTION — not yet run)

No live Clerk session is available in this sandbox. **TODO — user to verify against `npm run dev`:**

- [ ] Sign in
- [ ] Dashboard loads with correct stats
- [ ] Invoices list loads
- [ ] Create invoice
- [ ] Edit invoice to PAID
- [ ] CSV/Tally import page still parses a file
- [ ] Trigger a reminder (or verify reminders settings save)
- [ ] No console/server errors during the above

**Result: _TODO — pending user verification._**

## Open Risks / Carried-Forward Items

- **No live-authenticated smoke test** of Clerk v7/Inngest v4 flows (dashboard/invoice CRUD, RBAC 403s in a real browser session) has been run in this sandbox across the whole phase — every task's automated coverage is unit-level with mocked auth/repositories. This is the single largest gap between "tests pass" and "verified working."
- **Task 5 backfill**: DB-side create/reuse/link logic only exercised against an empty dev DB; real-data idempotency at scale is unverified.
- **Task 7 (Party)**: no guard against `agentId === id` (self-referencing agent); `update`'s success path, `list` pagination, and the audit "before" payload snapshot are untested beyond the brief's 5 mandated cases.
- **Task 8 (Item/Stock)**: duplicate-name check is TOCTOU-racy (relies on the DB unique constraint, would surface as an unhandled P2002 rather than a clean `ValidationError`); `itemService.update`/`remove` and `stockService.listMovements` untested beyond the brief's 6 mandated cases.
- **Task 9 (Bill)**: `computeInvoiceStatus`'s full return signature wasn't visible in the Task 9 diff context (typecheck confirms it's fine); `list`/`remove` untested beyond the brief's mandated cases.
- **Task 10 (Payment)**: two findings from the task-level review were promoted to Important during the final whole-branch review and fixed in `6717844` (see below): non-org-scoped allocation writes, and duplicate-`documentId` overpay in explicit allocations. Remaining non-blocking items: `Payment.amount` isn't rounded to 2dp before persistence (DB truncates safely); `applyAllocation` now silently no-ops if a pre-update read finds nothing instead of throwing (unreachable today — all ids come from org-scoped reads); `round2` is defined three times across payment.service/payment-allocation/mappers (worth hoisting to `lib/utils/currency`); the `applyAllocation`/`paidAt` guard has no direct test coverage (all payment.service tests mock the repository layer).
- **Task 11 (RBAC)**: manual live-Clerk owner-login smoke test not run (see top-level risk above); `requiredRole` check lives inside the `if (requireAuth)` block in `handler.ts` — a future route combining `{ requireAuth: false, requiredRole: "member" }` would silently skip the role check (not triggered by any of the current 7 routes, all default `requireAuth: true`).
- **Task 12 (CI)**: workflow has not yet been run on real GitHub Actions infrastructure (Steps 4–5 deferred); Cloudflare Pages dashboard build-command has not been configured; **production must be baselined** (`prisma migrate resolve --applied 0_init` against prod) before the first deploy using `pages-build`, or `migrate deploy` will refuse the non-empty schema.
- **WhatsApp template approval status** — carried from Phase 0, still open as of this gate.

## Final Whole-Branch Review

A cross-cutting review (opus, full 16-commit diff, base `65bdfe4` → head `5e81925`) ran after all 13 tasks were individually reviewed and merged into this branch. It checked consistency across tasks and integration points no single-task review could see.

**Verdict: ready to merge, with fixes.** No Critical issues — no reachable cross-org leak, audit gap, or broken integration seam across the whole phase. Two items carried forward from Task 10's task-level review (there rated Minor) were re-rated **Important** during the cross-cutting pass:
1. `applyAllocation`'s invoice/bill writes keyed on global PK only, not org-scoped like every other mutation in the codebase.
2. `validateExplicitAllocations` didn't aggregate duplicate `documentId` entries, allowing an overpay past a document's outstanding balance.

Both were fixed in `6717844` and re-reviewed clean (org-scoped `updateMany` + pre-update read for the PAID-flip decision; additive per-`documentId` aggregation with a regression test). Remaining Minor findings (rounding hoisting, `round2` duplication, item/party duplicate-name TOCTOU race with the DB unique constraint, silently-swallowed not-found in `applyAllocation`) are non-blocking polish, listed above and in the review agent's full output.

Strengths noted: the repository layer is remarkably consistent (every read/write org-scoped and soft-delete-aware the same way across Party/Item/Bill/Payment/Invoice); every mutating service method routes through `withAudit`; the payment allocation code (pure FIFO planner separated from the transactional writer, single `$transaction`, `paidAt` re-stomp guard) was called out as the strongest-engineered piece of the phase.

## Go/No-Go Recommendation

**Conditional go.** All coding work is complete: 13 tasks implemented, each individually reviewed, plus a final whole-branch review — 3 real bugs caught across the whole process (`Bill.paidAt` overwrite, `parseRole` prototype-chain bypass, payment allocation org-scoping + duplicate-overpay), all fixed and regression-tested. Full suite green (67/67), typecheck/lint/build clean.

What remains before this phase can be called fully verified and merged:
1. ~~Prod-copy migration rehearsal~~ — N/A, see Step 1 above (pre-launch, single DB, already migrated live).
2. Run the manual browser regression (Step 3) with a live Clerk session.
3. Push the CI workflow branch, open a PR, and confirm all gates (`lint`, `typecheck`, `test`, `migrate-check`, `build`) go green against real GitHub Actions infrastructure — the workflow has only been validated by reading its YAML, not by running it.
4. User sign-off below.

Given the small current user base (2-3 users, not yet production-scale) but real financial logic in this phase (payment allocation, RBAC), recommend at minimum #2 and #3 before starting Phase 2 work — the automatable coding work is solid and has been reviewed at both the task and whole-branch level, but neither has been exercised end-to-end in a live browser session.

## Sign-off

**Signed by:** _TODO — user name_
**Date:** _TODO_
