# InvoicePilot Architecture

This MVP is intentionally small in product scope but structured for enterprise-scale growth.

## Design principles

1. **Thin route handlers** — API routes validate input and delegate to services.
2. **Repository pattern** — Prisma queries live in `server/repositories`, not in handlers.
3. **Provider abstractions** — AI (`lib/ai`), email (`lib/email`), and jobs (`lib/jobs`) are swappable.
4. **Multi-tenant ready** — `Organization` + `OrganizationMember` with UUID keys and soft deletes.
5. **Queue-friendly jobs** — Reminder processing is idempotent and event-driven via Inngest.

## Layer diagram

```
┌─────────────────────────────────────────────────────────┐
│  UI (modules/, components/)                             │
│  TanStack Query → REST API                              │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  API Routes (app/api/)                                  │
│  withApiHandler → auth, rate limit, error handling      │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  Services (server/services/)                            │
│  Business rules, orchestration                          │
└───────┬─────────────────────────────┬───────────────────┘
        │                             │
┌───────▼────────┐            ┌───────▼────────┐
│ Repositories   │            │ Job Scheduler  │
│ (Prisma)       │            │ (Inngest)      │
└───────┬────────┘            └───────┬────────┘
        │                             │
┌───────▼────────┐            ┌───────▼────────┐
│ PostgreSQL     │            │ Workflows      │
│ (Supabase)     │            │ send-reminder  │
└────────────────┘            └────────────────┘
```

## Multi-tenancy path

- Every invoice/reminder/email log is scoped by `organizationId`.
- Clerk user maps to `User` → `OrganizationMember` on first API call.
- Future: invite flows, RBAC roles on `OrganizationMember.role`.

## AI provider abstraction

`AiProvider` interface in `lib/ai/types.ts`. Current implementation: `OpenRouterProvider` with:

- Configurable primary + fallback models via env
- Timeout (30s) and retry (2 attempts)
- Modular prompts in `lib/ai/prompts/`

Add Anthropic/OpenAI by implementing `AiProvider` and registering in `lib/ai/index.ts`.

## Email abstraction

`EmailProvider` + HTML templates in `lib/email/templates/`. Resend is the default provider.

## Job scheduler abstraction

`JobScheduler` interface in `lib/jobs/types.ts`. `InngestJobScheduler` emits events; workers in `server/workflows/inngest/`.

To migrate to BullMQ/Temporal:

1. Implement `JobScheduler` for the new queue.
2. Replace `getJobScheduler()` binding.
3. Port workflow steps from Inngest functions to workers.

## Database indexes

Key indexes on `invoices(organizationId, status)`, `reminders(scheduledFor, status)`, and unique `invoiceNumber` per org.

## Security

- Clerk middleware protects dashboard and API routes (except `/api/inngest` for Inngest sync).
- Zod validation on all write endpoints.
- In-memory rate limiting foundation (`lib/rate-limit`) — swap for Redis at scale.
- Structured JSON logging for audit trails (`lib/logger`).

## Observability (future)

- Plug logger into Datadog/Axiom
- Add OpenTelemetry traces around AI and email calls
- Dead-letter queue for failed reminders
