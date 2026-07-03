# ADR-001: Single Next.js monolith on Vercel

- **Status:** Accepted
- **Date:** 2026-07-03

## Context

InvoicePilot must grow from an invoice-reminder tool into receivables/payables + inventory + AI assistant + multi-channel dunning. That growth pulls in Tally import, background jobs, webhooks, and a chat-based assistant with tool access. A team of one (plus AI agents) needs to ship all of this without carrying multi-service operational overhead. The app is already a Next.js 15 App Router project deployed to Vercel with Prisma/Postgres and Inngest wired in — any architecture change has to justify the migration cost against that baseline.

## Decision

Keep InvoicePilot a single Next.js monolith deployed on Vercel. All HTTP surfaces (REST API, assistant API, webhooks) live in `app/api/*` routes. Background/async work (reminders, dunning, imports, webhook processing) runs through Inngest functions inside the same deployable. The service layer (`server/services` → `server/repositories` → Prisma) is kept as a clean internal boundary so pieces could be extracted later, but no extraction happens now.

## Alternatives considered

- **Microservices per domain** (imports service, messaging service, assistant service): rejected — at current scale (single team, single Postgres database, no independent scaling needs) this multiplies deploy/config/observability surface for no capacity benefit. YAGNI.
- **Separate backend (e.g. NestJS/Express) + separate frontend**: rejected — duplicates auth, adds a second deploy target and a second env-var surface, and Next.js API routes already give us server-side execution colocated with the UI.
- **Serverless-functions-per-feature on a different platform (AWS Lambda + API Gateway)**: rejected — loses Vercel's zero-config preview deployments per PR, which the team relies on for review; Inngest already gives us durable background execution without owning queue infra.

## Consequences

- Easier: one deploy pipeline, one env-var matrix, atomic deploys of API + UI + assistant together, Vercel preview environments per PR for free.
- Harder: cannot independently scale or version the assistant, import pipeline, and web UI; a large Inngest job or assistant tool call runs in the same platform limits (function duration, memory) as the rest of the app.
- Committing to: the services layer discipline (route → handler → service → repository → Prisma) as the only thing standing between "monolith" and "unmaintainable monolith" — every phase must keep writing through it, not around it.
