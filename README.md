# InvoicePilot

AI-assisted receivables/payables and inventory platform for freelancers, agencies, and SMBs — invoices, bills, stock, Tally Prime import, automated reminders, and an in-app AI assistant.

## Stack

- **Frontend:** Next.js 16.2, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query/Table, Zod
- **Backend:** Next.js Route Handlers, Prisma 7 (driver adapter, not the legacy `url` field), PostgreSQL (Supabase)
- **Auth:** Clerk (currently the `refined-collie-21` dev instance, used in every environment including production — no custom domain yet, see `docs/setup/PROVISIONING.md`)
- **Email:** Nodemailer over Gmail SMTP (`src/lib/email/providers/nodemailer.ts`) — Resend is referenced in config but not actually wired into any send path
- **AI (email drafting):** Groq / Gemini, with automatic fallback between them (`src/lib/ai`)
- **AI (assistant):** Anthropic (`claude-sonnet-5`), tool-use loop with mandatory human approval on every write (`src/lib/assistant`, ADR-005)
- **Jobs:** Inngest
- **Rate limiting / assistant budgets:** Upstash Redis
- **Deploy:** a single native Cloudflare Worker (`invoicechaser`, via the OpenNext Cloudflare adapter) — not the classic Pages product. See ADR-001 and `docs/setup/PROVISIONING.md`.

## Prerequisites

- Node.js 26+ (see `.nvmrc`) and npm
- A Supabase Postgres database
- Clerk, Groq/Gemini, Gmail (or another SMTP account), Inngest, and Upstash accounts

## Setup

```bash
npm ci
cp .env.example .env
# fill in .env — see docs/ENVIRONMENT.md for what each variable is and where to get it

npm run db:migrate   # applies prisma/migrations
npm run dev
```

In a second terminal, for background jobs locally:

```bash
npx inngest-cli@latest dev
```

## Environment variables

See [.env.example](.env.example) for the full list and [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for what's actually set where (local/preview/prod) and who owns each.

## CSV upload format

Use `public/sample-invoices.csv` as a template:

```csv
clientName,clientEmail,amount,dueDate,invoiceNumber,notes
```

For bulk data from Tally Prime, see [docs/TALLY.md](docs/TALLY.md) instead — it's a richer, foreign-key-ordered XML import (ledgers → stock items → vouchers), not this CSV path.

## Project structure

```
src/
  app/              # Next.js App Router pages & API routes
  components/       # Shared UI (shadcn), providers, assistant drawer
  modules/          # Feature UI (dashboard, invoices, bills, stock, analytics)
  lib/              # Cross-cutting utilities (AI, email, jobs, logger, assistant, import)
  server/
    repositories/   # Data access layer
    services/       # Business logic
    workflows/      # Inngest functions
  types/            # Shared TypeScript types
prisma/             # Database schema + migrations
e2e/                # Playwright specs (run: npm run test:e2e; smoke subset: npm run test:smoke)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design principles and layer diagram (some of it — the Resend/OpenRouter references — predates the actual providers in use above).

## Tests

```bash
npm test              # vitest unit/integration tests
npx playwright test   # full e2e suite
npm run test:smoke    # tagged @smoke subset — read-only, safe to run against a deployed URL
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply Prisma migrations (dev) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run seed:staging` | Seed a small deterministic demo org (`SEED_ALLOW=staging` required) |
| `npm run seed:volume` / `npm run explain:check` | Load-sanity seed (10k invoices/1k parties) + EXPLAIN checks on hot-path queries |

## Deployment

Cloudflare's Git integration builds and deploys `main` automatically as a native Worker (build: `npx opennextjs-cloudflare build`, deploy: `npx wrangler deploy`) — this is independent of GitHub Actions CI, which runs lint/typecheck/tests and, separately, gates `prisma migrate deploy` against production (see `.github/workflows/ci.yml` and `docs/RUNBOOK.md` §2–3). See `docs/setup/PROVISIONING.md` for the full provisioning history and current status of every external service.

## Program plan

This repo is mid-way through a larger platform buildout. See `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` for the master plan and `docs/architecture/README.md` for accepted architecture decisions (ADRs).

## Operations

- [docs/RUNBOOK.md](docs/RUNBOOK.md) — service map, deploy/rollback, migrations, incidents, secrets rotation
- [docs/ONBOARDING.md](docs/ONBOARDING.md) — first-run walkthrough for a new user
- [docs/TALLY.md](docs/TALLY.md) — Tally Prime export/import guide
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) — environment variable matrix

## License

Private / MVP — all rights reserved.
