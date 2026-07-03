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

### Preview database — open decision, USER ACTION

Supabase branching (`create_branch`) is a paid/billing-relevant operation (requires cost confirmation) and the initial `list_branches` call returned a permissions error — branching may not be enabled on this project's plan tier. Two options, user to choose and record here:
1. Enable Supabase branching (requires appropriate plan tier) and create a `preview` branch — agent can then create it via Supabase MCP once cost is confirmed.
2. Provision a second, separate Supabase project dedicated to preview/staging (simpler, no branching-plan dependency).

**Status:** ⬜ pending user decision.

### Hosting — Cloudflare Pages — USER ACTION

**Decision (amended 2026-07-04, ADR-001):** Cloudflare Pages, not Vercel. No Cloudflare Pages project is linked yet.

1. Add the OpenNext Cloudflare adapter to the app before first deploy: `npm i -D @opennextjs/cloudflare` (this is the one exception to Phase 0's "no `src/`/dependency changes" rule that must happen — track it as the first item of Phase 1's framework-upgrade step, not done in Phase 0 itself). Follow the adapter's `wrangler.jsonc`/`open-next.config.ts` setup for Next.js App Router.
2. In the Cloudflare dashboard → Workers & Pages → Create → Pages, connect this GitHub repo. Build command: the OpenNext build command from the adapter docs (not the default `next build`); output directory per adapter config.
3. Enable preview deployments for branches/PRs (Cloudflare Pages does this per-branch by default).
4. Once linked, set `DATABASE_URL` and `DIRECT_URL` in Cloudflare Pages → Project → Settings → Environment Variables:
   - **Production:** Supabase "Invoice Chaser" pooled (port 6543) / direct (port 5432) connection strings — get exact strings from Supabase dashboard → Project Settings → Database → Connection string.
   - **Preview:** connection strings for whichever preview-DB option is chosen above.
5. Validate Prisma + Clerk middleware actually run under Cloudflare's Workers runtime (not full Node.js) — this is a real risk called out in ADR-001's Consequences, not a formality. Confirm with a smoke test before treating hosting as done.
6. Confirm via `wrangler pages deployment list` (Wrangler CLI) or the Cloudflare dashboard once linked, or paste confirmation back for manual verification.

**Status:** ⬜ pending user action.

### Migration workflow decision

Per ADR-002 and parent plan §0.2: Phase 0/1 uses `prisma db push` (current dev workflow). Starting Phase 1, this switches to `prisma migrate dev`/`prisma migrate deploy` once the Phase-1 blueprint models land, so schema changes are versioned and repeatable against the Supabase database above.

---

## Auth — Clerk production instance (Task 5) — USER ACTION

1. In the Clerk dashboard (clerk.com), create a **production instance** for InvoicePilot (the app currently uses a dev instance/keys).
2. Once the production domain is known (from the Cloudflare Pages setup above), configure it under Clerk → Domains for the production instance.
3. Copy the production `Publishable key` and `Secret key` into Cloudflare Pages → Settings → Environment Variables → **Production** as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` (see `docs/ENVIRONMENT.md`).
4. Keep the existing dev-instance keys for local dev and Cloudflare Pages Preview — do not mix prod/dev Clerk keys across environments.
5. Agent verification: confirm both Clerk vars via the Cloudflare dashboard → Settings → Environment Variables (no CLI list-by-value equivalent to `vercel env ls`).

**Decision recorded (per parent plan §0.2):** organization modeling stays in-app — the existing `Organization`/`OrganizationMember` Prisma tables remain the source of truth for org membership and roles; Clerk is used for identity/authentication only, not Clerk Organizations.

**Status:** ⬜ pending user action.

---

## Messaging — Email (Resend) (Task 6) — USER ACTION, start early

1. In the Resend dashboard (resend.com), add and verify the sending domain: Resend generates SPF and DKIM DNS records — add exactly the records shown in Resend's domain-verification screen to the domain's DNS provider. (Exact record values are per-account/per-domain and shown only in the Resend dashboard at verification time — copy them from there, not from this doc.)
2. Once verified, create a production API key and paste it into Cloudflare Pages → Settings → Environment Variables → Production as `RESEND_API_KEY`.
3. Configure a Resend webhook (for delivery/bounce/open events) pointing at `/api/webhooks/resend` (reserved path for Phase 4 — not implemented yet, this is just registering the endpoint). Copy the webhook signing secret into Cloudflare Pages as `RESEND_WEBHOOK_SECRET`.

**Status:** ⬜ pending user action.

## Messaging — WhatsApp Cloud API (Task 6) — USER ACTION, start early (longest lead time)

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

**Status:** ⬜ pending user action (templates not yet submitted).

---

## Remaining services (Task 7) — USER ACTION

### Anthropic (AI assistant, Phase 6)

1. Create an API key at console.anthropic.com.
2. Paste into Cloudflare Pages envs as `ANTHROPIC_API_KEY` (Production + Preview) once the project is linked; for now, add the real key to a local `.env` (gitignored) for early testing.
3. **Model decision (2026-07-04):** `ANTHROPIC_MODEL=claude-sonnet-5` for now. Revisit at Phase 6 build time against the then-current model lineup/pricing — this is a placeholder-for-now choice, not a load-bearing architecture decision, so no ADR.

**Status:** 🟡 key being added locally by user; Cloudflare Pages env placement still pending (blocked on Task 4's Cloudflare Pages link).

### Inngest (background jobs, production)

1. In the Inngest dashboard, create/promote a production app for InvoicePilot (dev mode is already integrated locally).
2. Copy the production event key and signing key into Cloudflare Pages as `INNGEST_EVENT_KEY` (already used in dev) and `INNGEST_SIGNING_KEY`.

**Status:** ⬜ pending.

### Upstash (rate limits + assistant budgets)

1. Create a production Redis database at upstash.com (region close to the Cloudflare Pages deployment region for latency).
2. Copy the REST URL and token into Cloudflare Pages as `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

**Status:** ⬜ pending.

### Sentry (observability)

1. Create a Sentry project for this Next.js app at sentry.io.
2. Copy the DSN into Cloudflare Pages as `SENTRY_DSN`; create an auth token (Settings → Auth Tokens) for CI source-map upload, store as `SENTRY_AUTH_TOKEN` (GitHub Actions secret + Cloudflare Pages).

**Status:** ⬜ pending.

### Agent verification (all four)

Once keys are in place, check the Cloudflare dashboard → Settings → Environment Variables for Production and Preview and tick each variable's cell in `docs/ENVIRONMENT.md`'s Legend column.

---
