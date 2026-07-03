# InvoicePilot

AI-powered automated invoice chaser for freelancers, agencies, and SMBs. Upload invoices, configure reminder sequences, and send professional follow-up emails via OpenRouter + Resend.

## Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zod, Zustand
- **Backend:** Next.js Route Handlers, Prisma, PostgreSQL (Supabase)
- **Auth:** Clerk
- **Email:** Resend
- **AI:** OpenRouter (free-tier models)
- **Jobs:** Inngest (abstracted for future BullMQ/Temporal)
- **Deploy:** Vercel

## Prerequisites

- Node.js 20+ and npm (recommended: use your `gpu_env` conda environment)
- Supabase Postgres database
- Clerk, OpenRouter, Resend, and Inngest accounts

## Setup (Windows + Conda `gpu_env`)

```powershell
conda activate gpu_env
cd c:\invoice_chaser

# Ensure conda node/npm are first on PATH
$env:PATH = "C:\Users\parvg\anaconda3\envs\gpu_env;C:\Users\parvg\anaconda3\envs\gpu_env\Library\bin;" + $env:PATH

npm install
cp .env.example .env.local
# Fill in all values in .env.local

npx prisma db push
npm run dev
```

In a second terminal (for background jobs locally):

```powershell
npx inngest-cli@latest dev
```

## Environment variables

See [.env.example](.env.example) for the full list.

## CSV upload format

Use `public/sample-invoices.csv` as a template:

```csv
clientName,clientEmail,amount,dueDate,invoiceNumber,notes
```

## Project structure

```
src/
  app/              # Next.js App Router pages & API routes
  components/       # Shared UI (shadcn) and providers
  modules/          # Feature UI (dashboard, invoices)
  lib/              # Cross-cutting utilities (AI, email, jobs, logger)
  server/
    repositories/   # Data access layer
    services/       # Business logic
    workflows/      # Inngest functions
  types/            # Shared TypeScript types
prisma/             # Database schema
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for scalability notes.

## MVP features

- Clerk authentication with protected dashboard
- Invoice CRUD + CSV bulk import
- AI reminder email generation (friendly / professional / firm)
- Configurable reminder days, tone, and auto-send
- Daily Inngest cron to scan overdue invoices and queue reminders
- Resend HTML emails with reusable templates
- Dashboard: unpaid total, overdue count, reminders sent, recovered amount

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:studio` | Open Prisma Studio |

## Deployment (Vercel)

1. Connect repo to Vercel
2. Add all env vars from `.env.example`
3. Set `DATABASE_URL` to Supabase pooled connection for serverless
4. Deploy Inngest app sync at `/api/inngest`
5. Run `prisma migrate deploy` or `db push` against production DB

## License

Private / MVP — all rights reserved.
