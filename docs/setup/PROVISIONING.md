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

### Vercel — USER ACTION

No Vercel project is linked yet (no `vercel` CLI available in this environment, no `.vercel/project.json` in the repo).

1. Go to https://vercel.com/new, import this GitHub repo. Framework preset auto-detects as Next.js — accept defaults.
2. Enable preview deployments for all branches/PRs (default behavior).
3. Once linked, set `DATABASE_URL` and `DIRECT_URL` in Vercel → Project → Settings → Environment Variables:
   - **Production:** Supabase "Invoice Chaser" pooled (port 6543) / direct (port 5432) connection strings — get exact strings from Supabase dashboard → Project Settings → Database → Connection string.
   - **Preview:** connection strings for whichever preview-DB option is chosen above.
4. Confirm from the agent side via `vercel env ls production` / `vercel env ls preview` once the Vercel CLI is authenticated, or paste a screenshot/confirmation back for manual verification.

**Status:** ⬜ pending user action.

### Migration workflow decision

Per ADR-002 and parent plan §0.2: Phase 0/1 uses `prisma db push` (current dev workflow). Starting Phase 1, this switches to `prisma migrate dev`/`prisma migrate deploy` once the Phase-1 blueprint models land, so schema changes are versioned and repeatable against the Supabase database above.

---

## Auth — Clerk production instance (Task 5) — USER ACTION

1. In the Clerk dashboard (clerk.com), create a **production instance** for InvoicePilot (the app currently uses a dev instance/keys).
2. Once the production domain is known (from the Vercel setup above), configure it under Clerk → Domains for the production instance.
3. Copy the production `Publishable key` and `Secret key` into Vercel → Settings → Environment Variables → **Production** as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` (see `docs/ENVIRONMENT.md`).
4. Keep the existing dev-instance keys for local dev and Vercel Preview — do not mix prod/dev Clerk keys across environments.
5. Agent verification (once Vercel CLI is authenticated): `vercel env ls production` should list both Clerk vars.

**Decision recorded (per parent plan §0.2):** organization modeling stays in-app — the existing `Organization`/`OrganizationMember` Prisma tables remain the source of truth for org membership and roles; Clerk is used for identity/authentication only, not Clerk Organizations.

**Status:** ⬜ pending user action.

---

## Messaging — Email (Resend) (Task 6) — USER ACTION, start early

1. In the Resend dashboard (resend.com), add and verify the sending domain: Resend generates SPF and DKIM DNS records — add exactly the records shown in Resend's domain-verification screen to the domain's DNS provider. (Exact record values are per-account/per-domain and shown only in the Resend dashboard at verification time — copy them from there, not from this doc.)
2. Once verified, create a production API key and paste it into Vercel → Settings → Environment Variables → Production as `RESEND_API_KEY`.
3. Configure a Resend webhook (for delivery/bounce/open events) pointing at `/api/webhooks/resend` (reserved path for Phase 4 — not implemented yet, this is just registering the endpoint). Copy the webhook signing secret into Vercel as `RESEND_WEBHOOK_SECRET`.

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
6. Once approved, copy `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` into Vercel envs; generate and record a `WHATSAPP_WEBHOOK_VERIFY_TOKEN` for the webhook subscription.

**Status:** ⬜ pending user action (templates not yet submitted).

---
