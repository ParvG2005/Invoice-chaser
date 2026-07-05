# Provisioning Log

Running log of external services provisioned for InvoicePilot, who did it, and where to find them. No secrets recorded here — see `docs/ENVIRONMENT.md` for variable names and placement.

---

## Database & Hosting (Task 4)

**Decision:** Supabase (not Neon) — see addendum below. This supersedes the "Supabase or Neon" open choice in ADR-001/parent plan §0.2.

### Database — done

- Project: **"Invoice Chaser"** (Supabase)
- Project ref: `sikdvtqrdqynknlvpsls`
- Region: `ap-northeast-1`
- Postgres version: 17.6.1
- Status: `ACTIVE_HEALTHY` (verified via Supabase MCP `list_projects`/`get_project`, 2026-07-04)
- Dashboard: https://supabase.com/dashboard/project/sikdvtqrdqynknlvpsls
- API URL: `https://sikdvtqrdqynknlvpsls.supabase.co`

**ADR-001 addendum:** project already existed prior to Phase 0 (created 2026-07-03); Phase 0 adopts it as the single source of truth for `DATABASE_URL`/`DIRECT_URL` rather than provisioning a new Neon or second Supabase project.

### Preview database — decided 2026-07-04

**Decision:** reuse the main Supabase "Invoice Chaser" project for preview too (no branch, no second project). Supabase branching requires a paid-plan cost confirmation and the initial `list_branches` call returned a permissions error, so it's not enabled on this plan tier. Revisit real branch-based previews later once there's a cost/isolation reason to.

**Status:** ✅ done (decision recorded; using main DB for all environments for now).

### Hosting — Cloudflare Workers (via OpenNext adapter) — done

**Decision (amended 2026-07-04, ADR-001):** Cloudflare (not Vercel). Deployed as a native Worker (Workers Builds Git integration), not the classic Pages product — this is the OpenNext-recommended path and functionally equivalent for this project's needs.

1. ✅ OpenNext Cloudflare adapter added (`@opennextjs/cloudflare`), `wrangler.jsonc` + `open-next.config.ts` configured.
2. ✅ Worker `invoicechaser` connected to GitHub repo (`ParvG2005/Invoice-chaser`) via Cloudflare's Git integration; build command `npx opennextjs-cloudflare build`, deploy command `npx wrangler deploy`.
3. ✅ Account `workers.dev` subdomain registered: `invoicepilot.workers.dev`. Live URL: `https://invoicechaser.invoicepilot.workers.dev`.
4. ✅ `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` set as Worker secrets (`wrangler secret put`, verified via `wrangler secret list --name invoicechaser`) — same values for all environments per the preview-DB decision above. (Clerk keys were missed initially and caused a 500 — caught by the smoke test below.)
5. ✅ Smoke test (2026-07-04): `GET /` → 200 with Clerk initialized (`x-clerk-auth-status: signed-out`); `GET /sign-in` → 200; `GET /api/dashboard/stats` (unauthenticated) → 404, which is Clerk's expected `auth.protect()` behavior for non-page requests, not an error. Confirms Prisma + Clerk middleware work correctly under Cloudflare's Workers runtime.
6. Preview deployments: not yet configured for non-main branches/PRs (Workers Builds' per-branch preview behavior needs separate verification if/when needed).

**Status:** ✅ done.

### Migration workflow decision

Per ADR-002 and parent plan §0.2: Phase 0/1 uses `prisma db push` (current dev workflow). Starting Phase 1, this switches to `prisma migrate dev`/`prisma migrate deploy` once the Phase-1 blueprint models land, so schema changes are versioned and repeatable against the Supabase database above.

**2026-07-05 (Phase 7 Task 4):** Cloudflare's Git integration builds the Worker with `npx opennextjs-cloudflare build` only — it does **not** run `prisma migrate deploy` (the `pages-build` npm script that does is not actually wired to the Cloudflare project's build command). Until now nothing applied migrations to the production database automatically. Added a `migrate` job to `.github/workflows/ci.yml`, gated to `push` on `main` after `checks` passes, that runs `npx prisma migrate deploy` against `PROD_DIRECT_URL`.

- ⬜ **USER ACTION required:** add repo secret `PROD_DIRECT_URL` (GitHub → Settings → Secrets and variables → Actions) — the same direct (port 5432, non-pooled) Supabase connection string as `DIRECT_URL` above. Migrations must not go through the pooler.
- Because the GitHub Actions `migrate` job and Cloudflare's own Worker build/deploy are two independent systems triggered by the same push, they are **not strictly ordered** — every migration must stay backward-compatible with the previously-deployed app version (expand/contract) until this is tightened. Documented in `docs/RUNBOOK.md`.
- Not yet verified against a real `main` push (needs the secret above first) — next push to `main` after the secret is added should show `migrate` run `No pending migrations to apply.` or the actual pending migrations.

---

## Auth — Clerk production instance (Task 5) — USER ACTION

**Correction (2026-07-04):** the app was originally wired to a Clerk dev instance `exotic-polliwog-92.clerk.accounts.dev` from the repo's initial commit — that instance is not visible under the Clerk account currently in use (`parvmahangoyal2005@gmail.com`, dashboard app "My Application" / dev instance `refined-collie-21.clerk.accounts.dev`), likely created under a different login during original project scaffolding. Since it can't be managed from the current account, the project has been switched to `refined-collie-21` as the canonical Clerk app going forward — local `.env` and the Cloudflare Worker secrets both updated and redeployed; verified live (`GET /` 200 with correct key, `GET /sign-in` 200, unauthenticated `GET /api/dashboard/stats` correctly 404s).

1. A **production instance** for `refined-collie-21` (app `app_3Dzk5xhtTxUnGABUZi1GNXyjcYu`) was created via `clerk deploy`, targeting domain `invoicechaser.invoicepilot.workers.dev` — but it's **stuck in `domain_pending`** and cannot complete: Clerk needs 5 CNAME records added under that domain (`clerk.`, `accounts.`, `clkmail.`, two `_domainkey` records), and `workers.dev` is Cloudflare-owned, so there's no DNS control to add them. Production Clerk requires a **real custom domain you own**, added to Cloudflare as a DNS zone.
2. **Decision (2026-07-04):** paused — continue using the `refined-collie-21` **dev** instance/keys for now (fully functional for current purposes). Revisit once a real custom domain is acquired.
3. Google OAuth was prompted during `clerk deploy` (not currently used anywhere in this app — only email/password is wired up) — skipped/deferred, not configured.

**Decision recorded (per parent plan §0.2):** organization modeling stays in-app — the existing `Organization`/`OrganizationMember` Prisma tables remain the source of truth for org membership and roles; Clerk is used for identity/authentication only, not Clerk Organizations.

**Status:** 🟡 paused — dev instance working correctly in production deployment; real production instance blocked on owning a custom domain.

---

## Messaging — Email (Task 6)

**Decision (2026-07-04):** no custom domain is owned yet, so Resend domain verification is deferred indefinitely. The app's actual, active email path is **Nodemailer over Gmail SMTP** (`src/lib/email/index.ts` → `createNodemailerProvider`), sending from the user's personal Gmail address (`parvmahangoyal2005@gmail.com`) — Resend was never wired into the codebase at all (only referenced in this doc as originally-planned future work). Considered and explicitly deferred: per-signed-in-user sender email (each org connecting its own email account) — real feature scope, not a config change; revisit at Phase 4 (Communications) if wanted.

1. ✅ `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` set as `invoicechaser` Worker secrets (2026-07-04).
2. **Bug found and fixed:** `.env` had `SMTP_PORT=469` (not a valid SMTP port — Gmail listens on 465/587). `src/lib/email/providers/nodemailer.ts` sets `secure: port === 465`, so port 469 would have connected on the wrong port with the wrong TLS mode and failed outright. Corrected to `465` in both `.env` and the Worker secret.
3. Resend (`RESEND_API_KEY`) remains set as a Worker secret from earlier but is unused by the codebase — harmless to leave, revisit only if/when a domain is acquired and Resend is actually wired in.

**Status:** ✅ done (Gmail SMTP path, shared sender for all orgs) — real domain + Resend explicitly deferred, not blocking.

## Messaging — WhatsApp Cloud API (Task 6)

**Decision (2026-07-04):** deferred, grouped with automated per-user email sending (see `docs/superpowers/plans/2026-07-04-manual-email-compose-link.md`'s "Explicitly out of scope" section) as a "scale-up" item — both revisited together once the app needs to handle real message volume/paid tiers rather than one person manually managing reminders. Not urgent for Phase 0; not blocking anything else.

1. Create a Meta Business Manager account (business.facebook.com) if one doesn't already exist for this business.
2. Under Meta for Developers, create a WhatsApp Business app, register a phone number for it.
3. Submit the four message templates in `docs/setup/WHATSAPP_TEMPLATES.md` for approval (transactional category — required for reliability, since Meta places heavier restrictions/review on marketing-category templates).
4. Record here once done:
   - App ID: `TBD`
   - Phone number ID: `TBD`
   - Templates submitted on: `TBD`
   - Approval status: `TBD`
5. **Fallback decision:** if template approval has not completed within 2 weeks of submission, switch to Twilio WhatsApp as the provider behind the same `ChannelProvider` interface (ADR-004) — record that switch as an ADR-004 addendum here if it happens.
6. Once approved, copy `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` into Cloudflare Pages envs; generate and record a `WHATSAPP_WEBHOOK_VERIFY_TOKEN` for the webhook subscription.

**Status:** ⬜ deferred (scale-up item, grouped with automated email sending) — templates not yet submitted, not currently planned to be until then.

---

## Remaining services (Task 7) — USER ACTION

### Anthropic (AI assistant, Phase 6)

1. Create an API key at console.anthropic.com.
2. Paste into Cloudflare Pages envs as `ANTHROPIC_API_KEY` (Production + Preview) once the project is linked; for now, add the real key to a local `.env` (gitignored) for early testing.
3. **Model decision (2026-07-04):** `ANTHROPIC_MODEL=claude-sonnet-5` for now. Revisit at Phase 6 build time against the then-current model lineup/pricing — this is a placeholder-for-now choice, not a load-bearing architecture decision, so no ADR.

**Status:** ✅ key set as a Worker secret (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`), verified via `wrangler secret list --name invoicechaser` (2026-07-04).

### Inngest (background jobs, production)

1. ✅ Production Inngest app "invoicepilot" created at app.inngest.com, synced against `https://invoicechaser.invoicepilot.workers.dev/api/inngest` (initial sync failed with 401/signature-verification error until `INNGEST_SIGNING_KEY` was set on the Worker — then succeeded).
2. ✅ `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` set as Worker secrets and in local `.env` (2026-07-04).

**Status:** ✅ done.

### Upstash (rate limits + assistant budgets)

1. Create a production Redis database at upstash.com (region close to the Cloudflare Worker's deployment region for latency).
2. Copy the REST URL and token into the `invoicechaser` Worker (`wrangler secret put`) as `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

**Status:** ✅ key set as a Worker secret, verified via `wrangler secret list --name invoicechaser` (2026-07-04). Note: this reuses whatever Upstash database was already in local dev — worth confirming it's actually a production-grade instance, not a throwaway dev one, before relying on it.

### Sentry (observability)

**Decision (2026-07-04):** explicitly deprioritized — deferred to last, after everything else in Phase 0. Not a blocker for anything else.

1. Create a Sentry project for this Next.js app at sentry.io.
2. Copy the DSN into the `invoicechaser` Worker (`wrangler secret put`) as `SENTRY_DSN`; create an auth token (Settings → Auth Tokens) for CI source-map upload, store as `SENTRY_AUTH_TOKEN` (GitHub Actions secret + Worker secret).

**Status:** ⬜ pending, deprioritized (last).

### Agent verification (all four)

Once keys are in place, check the Cloudflare dashboard → Settings → Environment Variables for Production and Preview and tick each variable's cell in `docs/ENVIRONMENT.md`'s Legend column.

---

## Backups & staging seed (Phase 7 Task 5)

**`scripts/seed-staging.ts`** — done. Deterministic, idempotent demo org (`demo-staging-org`: 5 parties, 20 invoices spanning PENDING/OVERDUE/PAID). Guarded by `SEED_ALLOW=staging` (refuses without it). Run: `SEED_ALLOW=staging npm run seed:staging`. Verified locally (2026-07-05): seeds once, no-ops on re-run, refuses without the guard.

**Backup schedule** — ⬜ **USER ACTION, not yet confirmed.** The production database is the Supabase project "Invoice Chaser" (`sikdvtqrdqynknlvpsls`). Supabase automated daily backups are enabled by default on paid plans; on the Free plan there is **no automated backup** (only manual `pg_dump`). Confirm which plan this project is on (Supabase dashboard → Project Settings → Billing) and, if Free, either upgrade or set up a scheduled `pg_dump` (e.g. a cron'd GitHub Action) as a substitute. Record here once decided: plan, retention, PITR yes/no.

**Restore drill** — ⬜ **not yet performed.** Per the parent plan, an unrestored backup is not a backup — this requires a live drill (create a scratch DB/project, restore the latest backup into it, verify row counts and `_prisma_migrations` count match, then destroy the scratch DB) and is a USER ACTION the agent can prepare instructions for but not execute (no Supabase dashboard access). Do this once the backup schedule above is confirmed; re-drill quarterly per `docs/RUNBOOK.md`.

---

## Load sanity — volume seed + EXPLAIN checks (Phase 7 Task 8)

`scripts/seed-volume.ts` (1,000 parties, 10,000 invoices, throwaway `volume-test-org`) + `scripts/explain-checks.ts` (EXPLAIN ANALYZE on the app's real hot-path queries: `invoice.repository.ts#findMany`, `dashboard.service.ts#getStats`, `analytics.service.ts#getAgingReport`, party ledger). Run: `SEED_ALLOW=staging npm run seed:volume && npm run explain:check`.

Run against the local dev DB 2026-07-05 (no separate staging DB provisioned yet — same caveat as the seed-staging drill above):

```
PASS invoice-list:     4.3ms, seqScanOnInvoices=false
FAIL dashboard-tiles:  5.3ms, seqScanOnInvoices=true
FAIL aging-buckets:    9.9ms, seqScanOnInvoices=true
PASS party-invoices:   0.1ms, seqScanOnInvoices=false
```

All four are well under budget in absolute time. The two "FAIL"s are a seq scan, but not a missing-index problem: this test DB has only the one volume org, so 10,000 of the table's 10,021 rows (99.8%) belong to it — any organization-scoped query is a near-full-table scan by definition here, and Postgres correctly picks a seq scan over an index it knows won't be selective. The existing `@@index([organizationId, status])` (`prisma/schema.prisma`) is real and will matter once the table holds many orgs' data with much lower per-org selectivity; no new index was added because there was nothing here for EXPLAIN to actually prove missing. Re-run this check against the real Supabase database (which has other orgs' rows mixed in) before trusting the seq-scan verdict, and add `@@index([organizationId, status, dueDate])`/`@@index([organizationId, deletedAt])` only if that run still shows a seq scan.

Browser-level timing not measured (would need a signed-in session against the volume org on a running dev server — can be done on request).

---
