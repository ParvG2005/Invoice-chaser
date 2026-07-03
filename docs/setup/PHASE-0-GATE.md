# Phase 0 Gate Review

Status of Tasks 1-9 against `docs/superpowers/plans/2026-07-03-phase-0-architecture-setup.md`, open risks, and go/no-go recommendation.

## Task status

_Last updated 2026-07-04 — see `docs/setup/PROVISIONING.md` for full detail behind every row below._

| Task | Status | Evidence |
|---|---|---|
| 1. Architecture Decision Records | ✅ Done | `docs/architecture/ADR-001..005.md`, `docs/architecture/README.md` |
| 2. Environment & Secrets Matrix | ✅ Done | `docs/ENVIRONMENT.md`, `.env.example` — legend refreshed 2026-07-04 to reflect what's actually live |
| 3. CI Skeleton | ✅ Done | `.github/workflows/ci.yml`, `.nvmrc`, `package.json` engines/typecheck. Caveat unchanged: no PR-triggered run and no real `CI_CLERK_*` secrets exercised yet — see Open risk 6 |
| 4. Database & Hosting Provisioning | ✅ **Done** (was 🟡) | DB: existing Supabase "Invoice Chaser" project adopted for all environments. Hosting: native Cloudflare Worker `invoicechaser` (OpenNext), live at `https://invoicechaser.invoicepilot.workers.dev`, `DATABASE_URL`/`DIRECT_URL` set as Worker secrets, smoke-tested end-to-end (200s, correct Clerk init, expected 404 on unauthenticated API) |
| 5. Auth (Clerk) Production Instance | 🟡 Partial, correctly diagnosed (was vaguely 🟡) | Dev instance (`refined-collie-21`) works correctly in the production deployment. Real Clerk **production** instance is genuinely blocked — needs a custom domain you own to add 5 required CNAME records (`workers.dev` DNS isn't yours to edit). Deliberately paused, not forgotten. Also discovered & fixed: the app was originally wired to a different, inaccessible Clerk instance (`exotic-polliwog-92`) from initial project scaffolding — switched to the one actually manageable now |
| 6. Messaging Providers (Resend + WhatsApp) | 🟡 Partial (email path resolved, WhatsApp unchanged) | **Email: ✅ done** — decided to keep the existing Gmail SMTP path (Resend deferred indefinitely, no domain owned); found and fixed a real bug (`SMTP_PORT=469`, an invalid port that would have broken sending) along the way; all 5 SMTP vars live as Worker secrets. **WhatsApp: ⬜ unchanged** — Meta Business Manager account, template submission still open, USER ACTION |
| 7. Remaining Services (Anthropic, Inngest, Upstash, Sentry) | 🟡 Partial, 3 of 4 done | **Anthropic: ✅**, **Upstash: ✅**, **Inngest: ✅** (production app created, synced, both keys live) — all set as Worker secrets 2026-07-04. **Sentry: ⬜, explicitly deprioritized to last** per user decision — not blocking anything |
| 8. Stitch Project & Design System | 🟡 Partial (unchanged) | Project + design system + pilot Dashboard screen created (`docs/design/DESIGN_SYSTEM.md`, `docs/design/SCREEN_INVENTORY.md`). User design-approval sign-off: still open |
| 9. Tally Fixtures & Export Runbook | 🟡 Partial (unchanged) | Runbook ready (`docs/TALLY.md`), fixtures README scaffolded. Real export files: not yet delivered, USER ACTION |

**Not part of the original Phase 0 task list, done opportunistically:** a small Phase 4 feature (manual "send from your own email" via Gmail/mailto compose-link buttons) was planned and fully implemented on branch `feat/manual-email-compose-link` — 3 commits, all task/final reviews clean, ship-ready. See `docs/superpowers/plans/2026-07-04-manual-email-compose-link.md`. This is ahead-of-schedule Phase 4 work, not a Phase 0 item — noted here only because it happened in the same session.

## Open risks

1. **No Cloudflare Pages project linked yet.** Blocks setting `DATABASE_URL`/`DIRECT_URL`/Clerk keys in real Cloudflare envs and blocks agent-side verification (`wrangler pages deployment list`) for every other service in Tasks 4-7. Highest-priority next action.
2. **WhatsApp template approval has an external, unpredictable timeline** (Meta review). Per plan, submission (not approval) is what gates Phase 0 — templates are drafted and ready to submit. If approval stalls past ~2 weeks post-submission, fall back to Twilio WhatsApp per ADR-004.
3. **Supabase preview/branch database undecided.** `list_branches` returned a permissions error (branching may require a higher plan tier) — needs a user decision between enabling branching or provisioning a second Supabase project for preview.
4. **No local `.env` exists in this environment.** CI and local build/lint/typecheck were verified with dummy values (matching the CI workflow's own dummy-value approach) — this validates the scripts, not real database/auth connectivity. First real end-to-end verification happens once Cloudflare Pages + Supabase envs are wired together — including confirming Prisma/Clerk run under Workers runtime (ADR-001 risk).
5. **Stitch design direction not yet user-approved.** Pilot Dashboard screen is generated and self-reviewed against the design-system brief; Phase 3 should not generate the remaining 11 screens until the user signs off on this pilot (or requests changes).
6. **CI has never run against a real Clerk key or via a PR.** All CI runs so far are direct pushes to `main` with empty `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` (no `CI_CLERK_*` GitHub secrets exist yet). `next build` tolerates empty Clerk env vars, so CI is green, but a real key-format or Clerk-init issue wouldn't be caught until a real key is used. Add `CI_CLERK_*` dev-instance secrets and exercise CI via an actual PR before relying on it as a real gate.

## Go/no-go recommendation

**Conditional go.** All agent-doable Phase 0 work (Tasks 1, 2, 3, and the preparatory/decision portions of 4, 5, 6, 7, 8, 9) is complete and committed directly on `main`. Phase 1 planning/writing can begin in parallel with the user completing the remaining USER ACTION items (Cloudflare Pages link, Clerk/Resend/WhatsApp/Anthropic/Inngest/Upstash/Sentry account creation, Tally exports, Stitch design approval) — none of those block *writing* the Phase 1 plan, but Phase 1 *execution* should not start until:
- Cloudflare Pages is linked and `DATABASE_URL`/`DIRECT_URL` work end-to-end against the Supabase project, and
- Clerk production keys (or a documented decision to defer prod auth past Phase 1) are in place.

WhatsApp template *approval* pending is explicitly not a blocker per the parent plan; WhatsApp template *submission* should happen before Phase 4 begins.

## Sign-off

**Status:** ⬜ pending user sign-off (name + date).
