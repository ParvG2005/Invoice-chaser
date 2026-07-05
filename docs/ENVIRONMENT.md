# Environment & Secrets Matrix

Canonical list of environment variables for InvoicePilot. Values live only in Cloudflare Pages project envs and local `.env` (gitignored) — this table records names, purpose, and where to get them, never values. `.env.example` mirrors this list with blank values.

Legend: ✅ set · ⬜ not yet set · — not applicable to that environment.

**Note (2026-07-04):** hosting is a single native Cloudflare Worker (`invoicechaser`, via OpenNext — see `docs/setup/PROVISIONING.md`), not the classic Pages product, and there's no separate Preview deployment/secret-set configured yet — "Cloudflare Prod" below means `wrangler secret put --name invoicechaser`, currently the only Cloudflare environment that exists.

## Existing (already in use)

| Variable | Used by | Local dev | Cloudflare Preview | Cloudflare Prod | Owner / where to get it |
|---|---|---|---|---|---|
| `DATABASE_URL` | Prisma (pooled) | ✅ | — | ✅ | Supabase project **"Invoice Chaser"** (`sikdvtqrdqynknlvpsls`, ap-northeast-1) → Project Settings → Database → Connection string (pooled, port 6543) |
| `DIRECT_URL` | Prisma migrations (direct) | ✅ | — | ✅ | Same Supabase project → Connection string (direct, port 5432) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk (client) | ✅ (dev instance `refined-collie-21`) | — | ✅ (same dev instance — real prod instance blocked on owning a custom domain, see Task 5 in `PROVISIONING.md`) | Clerk dashboard |
| `CLERK_SECRET_KEY` | Clerk (server) | ✅ (dev instance) | — | ✅ (dev instance) | Clerk dashboard, same split as above |
| `GROQ_API_KEY` | AI email drafting (`server/ai`) | ✅ | ⬜ | ⬜ | console.groq.com |
| `GROQ_MODEL` | AI email drafting | ✅ | ⬜ | ⬜ | Config value, not a secret — safe to set in `.env.example` with a default |
| `GEMINI_API_KEY` | AI email drafting fallback | ✅ | ⬜ | ⬜ | Google AI Studio |
| `GEMINI_MODEL` | AI email drafting fallback | ✅ | ⬜ | ⬜ | Config value, not a secret |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` | Legacy Nodemailer email path | ✅ | ⬜ | ⬜ | Existing SMTP provider — superseded by Resend (Task 6) once migrated |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | WhatsApp settings flag (not yet sending) | ⬜ | ⬜ | ⬜ | Twilio console — kept as the documented fallback if Meta WhatsApp Cloud API approval stalls (ADR-004) |
| `CALLMEBOT_API_KEY` | Legacy WhatsApp experiment | ⬜ | ⬜ | ⬜ | callmebot.com — candidate for removal once Meta WhatsApp Cloud API (Task 6) lands |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | ✅ | — | ✅ | Upstash console (Task 7) |
| `INNGEST_EVENT_KEY` | Background jobs (dev mode works without it) | ⬜ | ⬜ | ⬜ | Inngest dashboard (Task 7) |

## Planned (introduced by later Phase 0 tasks / Phase 1+)

| Variable | Used by | Local dev | Cloudflare Preview | Cloudflare Prod | Owner / where to get it |
|---|---|---|---|---|---|
| `RESEND_API_KEY` | Email (Phase 4 Task 3) | ✅ | — | ✅ (key set; sending domain still not verified — works against Resend's default testing domain only) | resend.com dashboard |
| `RESEND_FROM_EMAIL` | Email (Phase 4 Task 3) — `From` header used by `ResendEmailProvider`; falls back to `SMTP_FROM_EMAIL` then a Resend testing address if unset | ✅ | ⬜ | ⬜ | Config value, not a secret |
| `RESEND_WEBHOOK_SECRET` | Email delivery webhooks (Phase 4, later task) | ⬜ | ⬜ | ⬜ | resend.com webhook config |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API (Task 6) | ⬜ | ⬜ | ⬜ | Meta Business Manager → WhatsApp → API Setup |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API (Task 6) | ⬜ | ⬜ | ⬜ | Meta Business Manager (system user token) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | WhatsApp Cloud API webhook (Task 6) | ⬜ | ⬜ | ⬜ | Self-generated, registered in Meta webhook config |
| `ANTHROPIC_API_KEY` | AI assistant (Task 7 / Phase 6) | ✅ | — | ✅ | console.anthropic.com |
| `ANTHROPIC_MODEL` | AI assistant model selection (Task 7 / Phase 6) | ✅ | ⬜ | ✅ | Config value, not a secret — default `claude-sonnet-5` for now; revisit at Phase 6 build time against then-current model lineup/pricing |
| `INNGEST_SIGNING_KEY` | Background jobs, production (Task 7) | — | ⬜ | ⬜ | Inngest dashboard → production app |
| `SENTRY_DSN` | Error tracking (Task 7) | ⬜ | ⬜ | ⬜ | sentry.io project settings |
| `SENTRY_AUTH_TOKEN` | Sentry release/source-map upload (Task 7, CI) | — | ⬜ | ⬜ | sentry.io → Auth Tokens |
| `ASSISTANT_KILL_SWITCH` | Assistant guardrail flag (Phase 6) | ⬜ | ⬜ | ⬜ | Set manually per environment; `true` disables all assistant tool execution |
| `E2E_CLERK_USER_EMAIL` | Playwright e2e auth fixture (`e2e/auth.setup.ts`, Phase 3 Task 1) | ⬜ | — | — | Dedicated test user in the Clerk dev instance (`refined-collie-21`), email+password auth enabled; also set as a GitHub Actions secret for the `e2e` CI job |
| `E2E_CLERK_USER_PASSWORD` | Playwright e2e auth fixture (`e2e/auth.setup.ts`, Phase 3 Task 1) | ⬜ | — | — | Password for the same dedicated Clerk test user; also set as a GitHub Actions secret for the `e2e` CI job |

## Notes

- **Database provider decision:** Supabase, not Neon — an "Invoice Chaser" Supabase project already exists (`sikdvtqrdqynknlvpsls`, ap-northeast-1, Postgres 17). Task 4 documents using this project directly (prod) plus a Supabase branch/second project for preview, rather than provisioning a new provider.
- CI (`Task 3`) only needs syntactically valid dummy values for `DATABASE_URL`/`DIRECT_URL` and real dev keys for the two Clerk vars (as GitHub Actions secrets) — see `.github/workflows/ci.yml`.
- `SMTP_*`, `TWILIO_*`, and `CALLMEBOT_API_KEY` are legacy/parallel paths predating this program; they are not removed in Phase 0 (no `src/` changes) but are flagged here for cleanup once Resend + Meta WhatsApp Cloud API (Task 6) are live.
