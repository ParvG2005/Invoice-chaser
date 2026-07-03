# ADR-001: Single Next.js monolith on Cloudflare Pages

- **Status:** Accepted (amended 2026-07-04 — see Amendment)
- **Date:** 2026-07-03

## Context

InvoicePilot must grow from an invoice-reminder tool into receivables/payables + inventory + AI assistant + multi-channel dunning. That growth pulls in Tally import, background jobs, webhooks, and a chat-based assistant with tool access. A team of one (plus AI agents) needs to ship all of this without carrying multi-service operational overhead. The app is already a Next.js 15 App Router project with Prisma/Postgres and Inngest wired in — any architecture change has to justify the migration cost against that baseline.

## Decision

Keep InvoicePilot a single Next.js monolith. All HTTP surfaces (REST API, assistant API, webhooks) live in `app/api/*` routes. Background/async work (reminders, dunning, imports, webhook processing) runs through Inngest functions inside the same deployable. The service layer (`server/services` → `server/repositories` → Prisma) is kept as a clean internal boundary so pieces could be extracted later, but no extraction happens now.

**Hosting: Cloudflare Pages** (amended from the original Vercel choice — see Amendment below), using the OpenNext Cloudflare adapter (`@opennextjs/cloudflare`) to run the Next.js App Router on Cloudflare's platform.

## Alternatives considered

- **Microservices per domain** (imports service, messaging service, assistant service): rejected — at current scale (single team, single Postgres database, no independent scaling needs) this multiplies deploy/config/observability surface for no capacity benefit. YAGNI.
- **Separate backend (e.g. NestJS/Express) + separate frontend**: rejected — duplicates auth, adds a second deploy target and a second env-var surface, and Next.js API routes already give us server-side execution colocated with the UI.
- **Serverless-functions-per-feature on a different platform (AWS Lambda + API Gateway)**: rejected — loses zero-config preview deployments per PR, which the team relies on for review; Inngest already gives us durable background execution without owning queue infra.
- **Vercel** (original decision, superseded — see Amendment): rejected on cost/preference grounds even though it has the most native Next.js support of any host.
- **Netlify / Railway / self-hosted (Fly.io, DigitalOcean, Docker)**: considered as Vercel alternatives; rejected in favor of Cloudflare Pages for its free-tier generosity, global edge network, and because the team already uses other Cloudflare products.

## Consequences

- Easier: one deploy pipeline, one env-var matrix, atomic deploys of API + UI + assistant together, preview environments per PR (Cloudflare Pages supports this natively), Cloudflare's edge network and free-tier bandwidth.
- Harder: cannot independently scale or version the assistant, import pipeline, and web UI; a large Inngest job or assistant tool call runs in the same platform limits (execution time, memory) as the rest of the app. Additionally, Cloudflare Pages runs Next.js on the **Workers runtime**, not a full Node.js runtime — some Node APIs and npm packages that assume Node (certain Prisma engine binaries, some crypto/stream APIs, native addons) need verification or Node-compat-mode flags; this must be validated during Phase 1's framework-upgrade step before deeper phases depend on it.
- Committing to: the services layer discipline (route → handler → service → repository → Prisma) as the only thing standing between "monolith" and "unmaintainable monolith" — every phase must keep writing through it, not around it. Also committing to the OpenNext Cloudflare adapter as the build/deploy tool, and to validating Prisma's Cloudflare-compatible driver adapters over `DATABASE_URL` (Postgres via Supabase) work under Workers runtime in Phase 1.

## Amendment (2026-07-04)

Original decision (2026-07-03) was Vercel, chosen for its native, zero-config Next.js support. User requested switching to Cloudflare Pages on 2026-07-04. This ADR is updated in place (not superseded by a new ADR number) since the surrounding architecture — monolith, service layer, Inngest — is unchanged; only the hosting platform changed. `docs/setup/PROVISIONING.md` and `docs/ENVIRONMENT.md` are updated accordingly. Anyone executing Phase 1's framework-upgrade step must add the OpenNext Cloudflare adapter and smoke-test the full app (especially Prisma DB connectivity and Clerk middleware) under Cloudflare's Workers runtime before Phase 1 is considered done.
