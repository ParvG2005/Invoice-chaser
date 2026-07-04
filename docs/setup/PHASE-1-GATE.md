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
| 10 | Payment service with FIFO/bill-wise allocation | Done | `eec0819`. Review clean (opus-level review given financial logic). The `paidAt` re-stomp risk (same class as Task 9's bug) was traced and confirmed structurally impossible: `applyAllocation` guards `status !== "PAID"` before setting `paidAt`, and only open (non-PAID) documents ever reach an allocation write path. |
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

## Step 1 — Prod-Copy Migration Rehearsal (USER ACTION — not yet run)

This sandbox has no IPv6 route to the direct Supabase DB host and no authorization to run prod-data operations autonomously. **TODO — user to run:**

```bash
# Point DATABASE_URL/DIRECT_URL at a copy of prod (Supabase/Neon branch, or pg_dump→psql restore)
npx prisma migrate resolve --applied 0_init
npx prisma migrate deploy
npm run db:backfill-parties
npm run db:backfill-parties   # second run must report 0 created / 0 linked
```

Then record:
```sql
SELECT count(*) FROM invoices WHERE deleted_at IS NULL AND party_id IS NULL AND client_name <> '';
-- expected: 0
SELECT count(*) FROM parties;  -- expected: = number of distinct (org, lower(trim(client_name)))
```

**Result: _TODO — pending user run. Fill in exit codes and query counts here._**

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
- **Task 10 (Payment)**: `tx.invoice.update`/`tx.bill.update` inside the allocation transaction key on the global id only (not an org-scoped `updateMany`, unlike the rest of the codebase) — not exploitable today since every `documentId` originates from an org-scoped read, but a latent hazard for future callers; duplicate `documentId` entries in explicit allocations aren't aggregated (could push `amountPaid` over the document total); `Payment.amount` isn't rounded to 2dp before persistence; the `applyAllocation`/`paidAt` guard has no direct test coverage (all payment.service tests mock the repository layer).
- **Task 11 (RBAC)**: manual live-Clerk owner-login smoke test not run (see top-level risk above); `requiredRole` check lives inside the `if (requireAuth)` block in `handler.ts` — a future route combining `{ requireAuth: false, requiredRole: "member" }` would silently skip the role check (not triggered by any of the current 7 routes, all default `requireAuth: true`).
- **Task 12 (CI)**: workflow has not yet been run on real GitHub Actions infrastructure (Steps 4–5 deferred); Cloudflare Pages dashboard build-command has not been configured; **production must be baselined** (`prisma migrate resolve --applied 0_init` against prod) before the first deploy using `pages-build`, or `migrate deploy` will refuse the non-empty schema.
- **WhatsApp template approval status** — carried from Phase 0, still open as of this gate.

## Go/No-Go Recommendation

**Conditional go.** All automatable work is complete: 12 tasks implemented, each reviewed (2 required one fix round for a real bug — both fixed and regression-tested), full suite green (66/66), typecheck/lint/build clean. The two review-caught bugs (Bill.paidAt overwrite, parseRole prototype-chain bypass) are exactly the kind of defect this review process exists to catch, and both were fixed before merge.

What remains before this phase can be called fully verified and merged:
1. Run the prod-copy migration rehearsal (Step 1) and record real counts.
2. Run the manual browser regression (Step 3) with a live Clerk session.
3. Push the CI workflow branch, open a PR, and confirm all gates (`lint`, `typecheck`, `test`, `migrate-check`, `build`) go green against real GitHub Actions infrastructure — the workflow has only been validated by reading its YAML, not by running it.
4. User sign-off below.

Given the size and financial sensitivity of this phase (payment allocation, RBAC), recommend completing all four before starting Phase 2 work, even though the automatable 90% is solid.

## Sign-off

**Signed by:** _TODO — user name_
**Date:** _TODO_
