# Operations Runbook

Real, current state of InvoicePilot's production deployment — not the aspirational Cloudflare Pages / Resend / custom-domain setup described in the Phase 7 plan. See `docs/setup/PROVISIONING.md` for the full decision history.

## 1. Service map

| Service | What it's for | Link | Owner |
|---|---|---|---|
| Cloudflare Worker `invoicechaser` | Hosting (native Worker via OpenNext, not Pages) | Cloudflare dashboard → Workers & Pages → `invoicechaser` | Parv Goyal |
| Live URL | Production | `https://invoicechaser.invoicepilot.workers.dev` (no custom domain yet) | — |
| Supabase project "Invoice Chaser" | Postgres (`sikdvtqrdqynknlvpsls`, ap-northeast-1) | Supabase dashboard | Parv Goyal |
| Clerk app `refined-collie-21` | Auth — **dev instance used in production** (real prod instance blocked on owning a custom domain) | Clerk dashboard | Parv Goyal |
| Inngest app "invoicepilot" | Background jobs | app.inngest.com | Parv Goyal |
| Upstash Redis | Rate limiting + assistant budgets | upstash.com console | Parv Goyal |
| Anthropic console | AI assistant (`claude-sonnet-5`) | console.anthropic.com | Parv Goyal |
| Gmail SMTP (`parvmahangoyal2005@gmail.com`) | Actual email send path (Nodemailer) — **not Resend**, which is unused despite being referenced elsewhere | — | Parv Goyal |
| GitHub Actions CI | Lint/typecheck/test/build, migrate gate | `.github/workflows/ci.yml` | Parv Goyal |

Not yet provisioned: Sentry (deferred), uptime monitor (not set up), WhatsApp Cloud API (deferred — settings UI exists but nothing sends).

## 2. Deploy & rollback

- Deploys happen automatically when Cloudflare's Git integration builds `main` (build command `npx opennextjs-cloudflare build`, deploy `npx wrangler deploy`). This is **independent** of GitHub Actions CI — the two systems are not ordered relative to each other.
- **Rollback:** Cloudflare dashboard → Workers & Pages → `invoicechaser` → Deployments → pick a previous deployment → Rollback. This does **not** revert database migrations — see §3.
- The `pages-build` npm script (`prisma generate && prisma migrate deploy && npx opennextjs-cloudflare build`) exists in `package.json` but is **not** actually configured as Cloudflare's build command — don't assume migrations run as part of the Worker build.

## 3. Migrations

- CI's `migrate` job (`.github/workflows/ci.yml`, added Phase 7 Task 4) runs `npx prisma migrate deploy` against `PROD_DIRECT_URL` after `checks` passes on `main`. Because it isn't ordered against the Cloudflare build/deploy, **every migration must be safe against the previously-deployed app version** (expand/contract): add new columns/tables before the code that uses them ships; don't drop/rename columns the currently-live code still reads.
- Check status: `DATABASE_URL=<prod-direct-url> DIRECT_URL=<prod-direct-url> npx prisma migrate status`.
- Resolve drift (e.g. if the DB was ever `db push`ed out of band): `npx prisma migrate resolve --applied <migration-name>`.
- Requires the GitHub repo secret `PROD_DIRECT_URL` to be set — see `docs/setup/PROVISIONING.md` "Task 4".

## 4. Backups & restore

- ⬜ **Not yet confirmed** — see `docs/setup/PROVISIONING.md` "Backups & staging seed". Check Supabase plan (Free has no automated backups); if Free, either upgrade or add a scheduled `pg_dump`.
- ⬜ **Restore drill not yet performed.** Procedure once a backup exists: restore the latest backup into a scratch Supabase project or local `restore_drill` DB, then verify:
  ```sql
  SELECT count(*) FROM invoices;
  SELECT max(created_at) FROM invoices;
  SELECT count(*) FROM _prisma_migrations;
  ```
  match production, then destroy the scratch DB. Record the drill date, backup timestamp, counts, and time-to-restore in `PROVISIONING.md`. Re-drill quarterly once done once.

## 5. Monitoring & alerts

None wired up yet — this is the biggest gap versus the aspirational plan:

- **Sentry:** deprioritized/deferred (`docs/setup/PROVISIONING.md`) — no error tracking in production today. Errors only show up as Cloudflare Worker logs (`wrangler tail --name invoicechaser` or the dashboard's Logs view) or user reports.
- **Uptime monitor:** not set up. Nothing pages anyone if the Worker goes down.
- **Inngest failures:** visible in the Inngest dashboard (failed runs), but there's no automated alert-on-failure handler — someone has to check the dashboard.

First response for any incident today is: check `wrangler tail --name invoicechaser` for live logs, check the Inngest dashboard for job failures, check Supabase for DB health.

## 6. Common incidents

- **Email not sending** — Gmail SMTP (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM_EMAIL` Worker secrets, `src/lib/email/providers/nodemailer.ts`). Known footgun: SMTP_PORT must be `465` (implicit TLS) or `587` (STARTTLS) — `secure: port === 465` in the provider code, so any other value silently uses the wrong TLS mode. Check Gmail's "less secure app" / app-password settings if auth fails.
- **WhatsApp** — not built/sending yet (deferred, see PROVISIONING.md); settings UI exists but is a no-op. Nothing to debug here until that lands.
- **Assistant misbehaving or cost spike** → flip `ASSISTANT_KILL_SWITCH=true` via `wrangler secret put ASSISTANT_KILL_SWITCH --name invoicechaser` (checked in `src/lib/assistant/killswitch.ts`), then trigger a redeploy. No approval bypass exists — every assistant write requires explicit user approval regardless of the kill switch.
- **DB connection exhaustion** — `DATABASE_URL` is the Supabase pooled connection (port 6543); `DIRECT_URL` is direct (port 5432, migrations only). Confirm the app is using the pooled URL for request-path queries (`src/lib/db/prisma.ts`) — the Workers runtime's concurrency model hasn't been load-tested against Prisma's connection-pooling assumptions, so watch for this under real traffic.
- **Stuck reminders/communications** — Inngest dashboard → find the run → replay. Query for stuck sends:
  ```sql
  SELECT channel, count(*) FROM communication_logs
  WHERE status = 'QUEUED' AND created_at < now() - interval '1 hour'
  GROUP BY channel;
  ```
- **Unapproved assistant writes (should never happen)**:
  ```sql
  SELECT count(*) FROM assistant_actions
  WHERE status = 'EXECUTED' AND approved_by_id IS NULL;
  ```

## 7. Secrets rotation

All secrets are Cloudflare Worker secrets on `invoicechaser` (`wrangler secret put <NAME> --name invoicechaser`), not Pages env vars — see `docs/ENVIRONMENT.md` for the full variable list and owners. After rotating any secret, a redeploy is needed for it to take effect (`wrangler secret put` alone doesn't trigger one — push a no-op commit to `main` or use the Cloudflare dashboard's "Retry deployment").

`PROD_DIRECT_URL` (GitHub Actions secret, used only by the CI `migrate` job) must be updated separately in GitHub → Settings → Secrets and variables → Actions whenever the Supabase direct connection string changes.

## 8. Escalation & contacts

- Owner: Parv Goyal (parv.goyal@scalerailabs.com)
- Cloudflare status: cloudflarestatus.com
- Supabase status: status.supabase.com
- Anthropic status: status.anthropic.com
- No formal on-call — this is a single-operator project.
