# Phase 6 Gate — AI Assistant

**Status: PASS (with deploy blocker below — read it first).**

## ⚠️ DEPLOY BLOCKER — UNAPPLIED MIGRATIONS (2)

Two migrations are written and verified additive/safe, but **have NOT been applied to any real database** —
this sandbox has no network access to the DB host. **`npx prisma migrate
deploy` MUST run before this Phase 6 code touches a real/production
database.** Do not merge/deploy this branch's app code without it.

- `prisma/migrations/20260705120000_phase6_assistant_action_fields` — adds
  `diff_summary`/`reject_feedback` to `assistant_actions`; renames Prisma field
  `approvedById` → `approvedBy` via `@map` (DB column unchanged).
- `prisma/migrations/20260705130000_phase6_assistant_session_model_tier` — adds
  `model_tier` to `assistant_sessions` (fixes pre-existing schema/DB drift found
  during final review: the field existed in `schema.prisma` since Task 1 but was
  never migrated).

## Checks

| Check | Result |
|---|---|
| Red-team suite green | `tests/assistant/red-team.test.ts` — PASS |
| Writes blocked without approval | `tests/assistant/approval-loop.test.ts` (`proposeWriteAction` never executes; `dispatchReadTool` refuses write tools) + `tests/assistant/red-team.test.ts` — PASS |
| Complete audit trail, 20-action scripted session | `tests/assistant/scripted-session.test.ts` — 20 proposed, 15 approved→EXECUTED (audited, `approvedBy`+`executedAt` set), 5 rejected→REJECTED (`rejectFeedback` set), 0 auto-executed, exactly 15 `withAudit` calls all actor `{type:"ASSISTANT", id:"u1"}` — PASS |
| `npx vitest run tests/assistant` | 12 files / 68 tests — PASS |
| `npm run typecheck` | clean |
| `npm run lint` | pre-existing 20 `no-explicit-any` errors in already-committed `approval-loop.test.ts`/`loop.test.ts`/`red-team.test.ts` (Tasks 5/6/9, unrelated to this task); `scripted-session.test.ts` itself is lint-clean |
| Kill switch (`ASSISTANT_KILL_SWITCH=true` → POST `/api/assistant/sessions` returns 503) | **Not verified end-to-end in sandbox** — no DB network access and no authenticated Clerk session available; the real route runs `auth()` + `organizationService.ensureUserOrganization` (a DB call) *before* the kill-switch check, so a live curl can't reach that branch here. Verified instead at the unit level: `tests/assistant/routes.test.ts` (3 cases) asserts 503 for `/sessions`, `/sessions/:id/messages`, `/actions/:id/approve` with the kill switch set, and that `assistantService` is never touched. |
| Per-org token budget | `tests/assistant/budget.test.ts` — `assertTokenBudget` throws once an org's usage exceeds its daily cap; budgets are isolated per org (one org's usage never throttles another) |
| RBAC viewer read-only | `tests/assistant/rbac.test.ts` — viewer role's registry contains read tools only; `approval-loop.test.ts` asserts `proposeWriteAction` throws for `role: "viewer"` |

## Tools left `disabled: true`

| Tool | Reason | Owner |
|---|---|---|
| `import_status` (read) | Brief's `importService.getBatches(org, {batchId, limit})` contract has no matching service — the real `tallyImportService` exposes `listBatches(org)` / `getBatch(org, batchId)`, neither matching the filtered-list shape closely enough to fake safely | Task 4/5 follow-up |

All other 26 tools (14 read + 12 write, `import_status` excluded) are enabled — 27 tools total.

## Go/No-Go

**GO for merge to Phase 6 branch**, conditional on running `npx prisma migrate deploy`
before this code reaches any environment with a live database.

Sign-off: ______________________ (name) — ______________ (date)
