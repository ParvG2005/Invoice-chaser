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
