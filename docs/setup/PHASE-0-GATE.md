# Phase 0 Gate Review

Status of Tasks 1-9 against `docs/superpowers/plans/2026-07-03-phase-0-architecture-setup.md`, open risks, and go/no-go recommendation.

## Task status

_Last updated 2026-07-04 — see `docs/setup/PROVISIONING.md` for full detail behind every row below._

| Task | Status | Evidence |
|---|---|---|
| 1. Architecture Decision Records | ✅ Done | `docs/architecture/ADR-001..005.md`, `docs/architecture/README.md` |
| 2. Environment & Secrets Matrix | ✅ Done | `docs/ENVIRONMENT.md`, `.env.example` — legend refreshed 2026-07-04 to reflect what's actually live |
| 3. CI Skeleton | ✅ Done, fully verified (2026-07-04) | `.github/workflows/ci.yml`, `.nvmrc`, `package.json` engines/typecheck. `CI_CLERK_PUBLISHABLE_KEY`/`CI_CLERK_SECRET_KEY` GitHub secrets set from real dev-instance keys; exercised via real PR ([#1](https://github.com/ParvG2005/Invoice-chaser/pull/1)) — lint/typecheck/build all green with real Clerk keys, not just empty-var tolerance |
| 4. Database & Hosting Provisioning | ✅ **Done** (was 🟡) | DB: existing Supabase "Invoice Chaser" project adopted for all environments. Hosting: native Cloudflare Worker `invoicechaser` (OpenNext), live at `https://invoicechaser.invoicepilot.workers.dev`, `DATABASE_URL`/`DIRECT_URL` set as Worker secrets, smoke-tested end-to-end (200s, correct Clerk init, expected 404 on unauthenticated API) |
| 5. Auth (Clerk) Production Instance | 🟡 Partial, deferred to scale-up (2026-07-04) | Dev instance (`refined-collie-21`) works correctly in the production deployment. Real Clerk **production** instance needs a custom domain you own (`workers.dev` DNS isn't yours to edit) — **reclassified 2026-07-04 into the "scale-up" bucket** alongside WhatsApp and automated per-user email, not pursued now, not blocking. Also discovered & fixed: the app was originally wired to a different, inaccessible Clerk instance (`exotic-polliwog-92`) from initial project scaffolding — switched to the one actually manageable now |
| 6. Messaging Providers (Resend + WhatsApp) | 🟡 Partial, WhatsApp now explicitly deferred | **Email: ✅ done** — decided to keep the existing Gmail SMTP path (Resend deferred indefinitely, no domain owned); found and fixed a real bug (`SMTP_PORT=469`, an invalid port that would have broken sending) along the way; all 5 SMTP vars live as Worker secrets. **WhatsApp: ⬜ deferred (2026-07-04)** — grouped with automated per-user email sending and Clerk custom domain as a "scale-up" item, revisited together once message volume justifies it; not pursued now, not blocking |
| 7. Remaining Services (Anthropic, Inngest, Upstash, Sentry) | 🟡 Partial, 3 of 4 done | **Anthropic: ✅**, **Upstash: ✅**, **Inngest: ✅** (production app created, synced, both keys live) — all set as Worker secrets 2026-07-04. **Sentry: ⬜, explicitly deprioritized to last** per user decision — not blocking anything |
| 8. Stitch Project & Design System | ✅ Done, both screens approved (2026-07-04) | Dashboard pilot approved (incl. sort/search iteration). Analytics screen (6 tabs: Party/Date/Status/Amount/Agent/Stock) approved for IA/content — Date & Stock trend charts have known prototype-only rendering bugs, deferred to Phase 3 rebuild with a real chart library (`docs/design/DESIGN_SYSTEM.md`). Remaining ~10 screens queued for Phase 3 iteration |
| 9. Tally Fixtures & Export Runbook | 🟡 Partial, unblocked with synthetic fixtures (2026-07-04) | Runbook ready (`docs/TALLY.md`). User has no Tally Prime access, so 3 synthetic fixture files (`masters-ledgers.xml`, `masters-stockitems.xml`, `vouchers-daybook.xml`) were hand-authored matching Tally's real documented export schema (verified against official Tally XML docs), covering Sales/Purchase/Receipt/Payment with bill allocations, inventory entries, and GST fields. Known limitation recorded in `tests/fixtures/tally/README.md`: synthetic data unblocks Phase 2 parser dev but should be swapped for real exports later |

**Not part of the original Phase 0 task list, done opportunistically:** a small Phase 4 feature (manual "send from your own email" via Gmail/mailto compose-link buttons) was planned and fully implemented on branch `feat/manual-email-compose-link` — 3 commits, all task/final reviews clean, ship-ready. See `docs/superpowers/plans/2026-07-04-manual-email-compose-link.md`. This is ahead-of-schedule Phase 4 work, not a Phase 0 item — noted here only because it happened in the same session.

## Open risks

_Refreshed 2026-07-04 — most of the original list below is resolved; only genuinely open items remain._

1. **Clerk production instance — moved to scale-up bucket (2026-07-04), not a blocker.** `workers.dev` DNS isn't editable, so the 5 CNAME records Clerk needs can never be added there. Dev instance (`refined-collie-21`) works fine in production meanwhile. Grouped with WhatsApp and automated per-user email as an undated future decision — revisit once there's an actual business reason to own a domain.
2. **WhatsApp deferred by decision, not by blocker.** No longer time-pressured — grouped with automated per-user email sending and Clerk custom domain as a future "scale-up" item (2026-07-04), so the "submit templates early, longest lead time" framing from the original plan no longer applies. Revisit together, deliberately, not on a clock.
~~3. Stitch design direction not yet user-approved.~~ **Resolved 2026-07-04** — Dashboard and Analytics screens both approved. Phase 3 can proceed generating the remaining ~10 screens. Known caveat carried forward: Date/Stock chart visuals on the Analytics screen are prototype-only and need a real chart library in Phase 3 implementation (not a design-approval blocker).
~~4. CI has never run against a real Clerk key or via a PR.~~ **Resolved 2026-07-04** — `CI_CLERK_*` GitHub secrets set from real dev-instance keys, exercised via [PR #1](https://github.com/ParvG2005/Invoice-chaser/pull/1): lint/typecheck/build all passed with real keys.
5. **Tally fixtures are synthetic, not real.** User has no Tally Prime access. Synthetic fixture files (2026-07-04) unblock Phase 2 parser development but can't surface real-data idiosyncrasies — swap for a real export if/when access becomes available.
6. **Upstash Redis instance provenance unconfirmed** — the key pushed to production (2026-07-04) reuses whatever was already in local dev; worth confirming it's a production-grade instance before relying on it at real load.

**Resolved since last update (no longer risks):** Cloudflare hosting link (now live, native Worker deployed and smoke-tested), Supabase preview/branch decision (resolved — reuse main DB), local env/Cloudflare env wiring (done — Worker secrets verified end-to-end including a real Prisma+Clerk smoke test under the Workers runtime, resolving the ADR-001 runtime risk).

## Go/no-go recommendation

**Conditional go — materially further along than the last review.** Tasks 1-4 are fully done. Task 5 (Clerk) and Task 6 (email) have real, working fallbacks in place (dev-instance auth, Gmail SMTP) so neither blocks anything. Task 7 is 3-of-4 done (Sentry deliberately last). Remaining USER ACTION items — a custom domain (for Clerk prod), Stitch design sign-off, Tally exports, Sentry — are genuinely independent of each other and don't block Phase 1 execution, which can now proceed: the two conditions from the previous review (Cloudflare linked + DB working end-to-end; Clerk keys in place or a documented deferral) are both satisfied.

WhatsApp is no longer tracked as a lead-time risk — it's an explicit, undated future decision, not a pending task with a clock running.

## Sign-off

**Status:** ⬜ pending user sign-off (name + date).
