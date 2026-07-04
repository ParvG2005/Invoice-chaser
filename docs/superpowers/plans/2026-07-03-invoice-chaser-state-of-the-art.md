# Invoice Chaser — State-of-the-Art Platform Plan

> **For agentic workers:** This is the master program plan. Each phase below must be expanded into its own detailed implementation plan (via `superpowers:writing-plans`) before execution, then executed with `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Phase 0 is architecture/setup only — **no application code is written in Phase 0.**

**Goal:** Evolve Invoice Chaser (InvoicePilot) from an invoice-reminder tool into a full receivables/payables + inventory platform with a Stitch-designed frontend, deep Tally Prime import, WhatsApp + email chasing, rich analytics, and a guarded in-app AI assistant that can operate the whole product with user approval.

**Current state (verified in repo):**
- Next.js 15 (App Router) + React 19 + Tailwind 4 + shadcn/radix, Clerk auth, Prisma 6 + Postgres, TanStack Query, Zustand, Inngest jobs, Resend/Nodemailer email, Groq/Gemini AI email generation, Upstash rate limiting.
- Models: `User`, `Organization`, `OrganizationMember`, `Invoice`, `ReminderSettings`, `Reminder`, `EmailLog`, `AiGeneration`.
- Existing basic Tally XML parser (`src/lib/import/tally-parser.ts`) and CSV import; dashboard stats API; WhatsApp only as a settings flag (no sending).
- No tests, no CI, no stock/party/payment models, no AI assistant.

**Tech stack (kept + added, upgraded to latest stable as of July 2026):** Next.js 16 (16.2.x), React 19.2, TypeScript 6, Node 26 LTS, Prisma 7 + Postgres, Tailwind 4.3, Clerk, Inngest, Resend, Upstash · **added:** Stitch (MCP) for UI design, WhatsApp Cloud API, Anthropic Claude API (assistant, model `claude-fable-5` / `claude-sonnet-5`), Vitest + Playwright, Sentry, Cloudflare Pages (via the OpenNext Cloudflare adapter — see ADR-001).

## Global Constraints

- Version floors: Node >= 26 (LTS), Next.js >= 16.2, React >= 19.2, TypeScript >= 6.0, Prisma >= 7.8, Tailwind >= 4.3. Pin Node via `.nvmrc`/`engines`; keep dependencies on latest stable at each phase start.
- Multi-tenant: every new table carries `organization_id`; every query is org-scoped at the repository layer. No cross-org data access, ever.
- All money columns `Decimal(12,2)`; all quantities `Decimal(12,3)`; currency INR-first but stored with a `currency` code.
- Soft deletes (`deleted_at`) on all business entities, matching existing convention.
- All writes performed by the AI assistant require explicit user approval (see Phase 7 guardrails) — no silent mutations.
- Existing layered convention preserved: `app/api` route → `lib/api/handler` → `server/services` → `server/repositories` → Prisma.
- Secrets only in env vars / provider credential stores; never in code, prompts, or logs.
- TDD for all service/parser/tool code; Playwright smoke tests for each new page.
- After code changes, run `graphify update .` (per CLAUDE.md) — install/verify the CLI in Phase 0.

---

## Phase 0 — Architecture, Prerequisites & Setup (no code)

**Deliverable:** approved architecture document + provisioned accounts/environments + this plan checked in. Nothing in `src/` changes.

### 0.1 Target architecture

```
┌────────────────────────  Cloudflare Pages  ───────────────────────┐
│  Next.js App Router                                              │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐   │
│  │ UI (Stitch-  │  │ REST API      │  │ AI Assistant API     │   │
│  │ designed,    │→ │ /api/* (zod-  │  │ /api/assistant/*     │   │
│  │ shadcn)      │  │ validated)    │  │ (chat + tool loop)   │   │
│  └──────────────┘  └──────┬────────┘  └─────────┬────────────┘   │
│                           ▼                     ▼                │
│                 server/services  ←── assistant tool registry     │
│                           ▼          (same services, approval-   │
│                 server/repositories   gated writes + audit log)  │
└───────────┬───────────────┬───────────────┬──────────────────────┘
            ▼               ▼               ▼
     Postgres (Supabase) Inngest (jobs:  Providers: Resend (email),
     + Prisma migrations reminders, dunn- WhatsApp Cloud API, Claude
                         ing, imports,    API, Upstash (rate limit),
                         webhooks)        Sentry (errors)
Tally Prime (on-prem) ──XML export upload / optional HTTP-XML bridge──▶ /api/import/tally
```

**Key architectural decisions (locked in Phase 0):**

1. **Single Next.js monolith** on Cloudflare Pages (via the OpenNext Cloudflare adapter — see ADR-001); background work via Inngest (already integrated). No microservices — YAGNI at this scale; services layer keeps future extraction possible.
2. **Domain model grows around a party-centric ledger.** New core entities: `Party` (customer/supplier/agent — replaces free-text `clientName` on invoices), `InvoiceLineItem`, `Item` + `StockMovement` (inventory), `Payment` (receipts & payables), `Bill` (purchase/payable side), `CommunicationLog` (unifies email + WhatsApp), `AuditLog`, `AssistantSession`/`AssistantAction`, `ImportBatch` (Tally/CSV provenance). Invoices gain `type` (RECEIVABLE/PAYABLE), `partyId`, line items, `balanceDue` derived from payments.
3. **Tally Prime integration = file-first, schema-complete.** Primary path: user exports Vouchers/Masters XML (or uses Tally's built-in HTTP-XML server on LAN with a small sync helper later). We map the full voucher schema: party masters (`LEDGER`), stock items (`STOCKITEM`), sales/purchase/receipt/payment vouchers with `ALLLEDGERENTRIES.LIST`, `ALLINVENTORYENTRIES.LIST`, `BILLALLOCATIONS.LIST` (bill-wise refs → payment matching), GST fields, godowns/batches. Every import is an idempotent `ImportBatch` keyed by Tally GUID + `ALTERID` so re-imports update rather than duplicate.
4. **Messaging = channel-abstracted dunning engine.** One `ChannelProvider` interface (email via Resend, WhatsApp via Meta WhatsApp Cloud API with pre-approved templates); reminders fan out per enabled channel side by side, with delivery webhooks feeding `CommunicationLog`.
5. **AI assistant = tool-calling loop over the existing service layer, never raw SQL/Prisma.** Claude API with a fixed tool registry (each tool = thin wrapper over a service method, org-scoped, zod-validated). Guardrails: (a) reads execute freely, all writes return a *pending action* the user must approve in the UI; (b) hard server-side authorization — the model cannot widen scope because tools inject `organizationId` from the session, not from model output; (c) system prompt + input hardening (treat retrieved invoice text/emails as untrusted data, never as instructions); (d) per-org rate limits and token budgets; (e) full `AssistantAction` audit trail; (f) no browsing/no arbitrary code — scope is website + user's own database only.
6. **Frontend built Stitch-first.** Create a Stitch project + design system for InvoicePilot; every new/rewritten screen is generated/iterated in Stitch, then implemented as shadcn/Tailwind components. Screens: Dashboard, Invoices (list/detail/editor), Bills/Payables, Parties & Agents, Stock, Payments, Imports (Tally/CSV), Reminders & Sequences, Analytics, Assistant panel (side drawer available everywhere), Settings.
7. **Analytics = precomputed + live.** Dashboard service extended with: receivables aging buckets (0-30/31-60/61-90/90+), money-to-come vs money-to-pay, DSO, collection rate, pending invoice counts/values, stock valuation & low-stock alerts, per-party/agent exposure and payment behavior score. Heavy aggregates via SQL views/materialized queries refreshed by Inngest.

### 0.2 Prerequisites & account provisioning (checklist)

- [ ] **Cloudflare Pages** project linked to the GitHub repo (via Cloudflare dashboard → Workers & Pages → Create → Pages); preview deployments on PRs; production env; requires the OpenNext Cloudflare adapter (`@opennextjs/cloudflare`) added to the app before first deploy. — deferred, USER ACTION (no Wrangler/Cloudflare link in this environment); instructions in `docs/setup/PROVISIONING.md`. Owner: user.
- [x] **Postgres** production DB (Supabase or Neon) — **decision: Supabase**, existing project "Invoice Chaser" (`sikdvtqrdqynknlvpsls`) adopted, see `docs/setup/PROVISIONING.md`. Preview/branch DB choice + `prisma migrate` cutover still deferred to Phase 1/pending Cloudflare Pages linkage. Owner: user (preview DB decision).
- [x] **Clerk** — decision recorded: keep in-app `Organization` model, Clerk for identity only (`docs/setup/PROVISIONING.md`). Production instance creation itself deferred, USER ACTION. Owner: user.
- [ ] **Resend** domain verification (SPF/DKIM) for deliverability; webhook endpoint for bounces/opens. — deferred, USER ACTION; instructions in `docs/setup/PROVISIONING.md`. Owner: user.
- [ ] **Meta WhatsApp Cloud API** — deferred, USER ACTION; templates drafted in `docs/setup/WHATSAPP_TEMPLATES.md`, submission instructions in `docs/setup/PROVISIONING.md`. Does not block the gate per plan note (approval pending is acceptable; submission is not). Owner: user.
- [ ] **Anthropic API key** — deferred, USER ACTION; instructions in `docs/setup/PROVISIONING.md`. Owner: user.
- [ ] **Inngest** production app + signing key. — deferred, USER ACTION; instructions in `docs/setup/PROVISIONING.md`. Owner: user.
- [ ] **Upstash** Redis prod instance. — deferred, USER ACTION; instructions in `docs/setup/PROVISIONING.md`. Owner: user.
- [ ] **Sentry** project. — deferred, USER ACTION; instructions in `docs/setup/PROVISIONING.md`. Owner: user.
- [x] **Stitch MCP** connected; project "InvoicePilot" (`projects/7229335890257417243`) + design system (`assets/5052952801528952529`) created from `globals.css` brand tokens; pilot Dashboard screen generated. See `docs/design/DESIGN_SYSTEM.md`. User design-approval sign-off still pending.
- [ ] **Tally Prime** sample data — deferred, USER ACTION; export runbook ready in `docs/TALLY.md`, fixtures README scaffolded in `tests/fixtures/tally/README.md`, no files delivered yet. Owner: user.
- [x] **Tooling:** GitHub Actions CI (lint, typecheck, build) added and verified green locally (`.github/workflows/ci.yml`, `.nvmrc`). Vitest/Testing Library/Playwright installation and the `test` CI job are deliberately deferred to Phase 1 (dependency/test-scaffolding work, out of Phase 0's no-`src/`-changes scope — see plan header). `graphify` CLI item struck — `graphify-out/` was removed from the repo (see Task 10 cleanup); no longer part of this program.
- [x] **Env matrix documented** in `docs/ENVIRONMENT.md`: every variable (existing + planned), owner, and where to get it recorded; per-environment presence cells (⬜) to be ticked as Task 4-7 USER ACTION items complete.

### 0.3 Data-model blueprint (schema design only — migrated in Phase 1)

New Prisma models (names final, fields refined during Phase 1 TDD):

| Model | Purpose | Key fields |
|---|---|---|
| `Party` | Customers, suppliers, agents | `type` (CUSTOMER/SUPPLIER/AGENT/BOTH), name, email(s), phone/WhatsApp, GSTIN, billing address, credit limit, credit days, `tallyGuid`, `agentId` (self-relation for agent-managed parties) |
| `Item` | Stock item master | name, SKU, unit, HSN, GST rate, opening qty, reorder level, purchase/sale price, `tallyGuid` |
| `StockMovement` | Every in/out | itemId, qty (+/-), rate, sourceType (INVOICE/BILL/ADJUSTMENT/OPENING), sourceId, godown |
| `InvoiceLineItem` | Invoice detail | invoiceId, itemId?, description, qty, rate, discount, taxRate, amount |
| `Bill` | Payable-side documents | mirror of Invoice with `partyId` (supplier), dueDate, status |
| `Payment` | Receipts & payments | partyId, direction (IN/OUT), amount, mode, date, `allocations[]` → invoice/bill (bill-wise matching, mirrors Tally `BILLALLOCATIONS`) |
| `CommunicationLog` | Unified email+WhatsApp log | channel, to, templateId, status (QUEUED/SENT/DELIVERED/READ/FAILED/BOUNCED), providerId, invoiceId?, reminderId? |
| `ImportBatch` / `ImportRecord` | Tally/CSV provenance & idempotency | source, fileHash, counts, per-record `tallyGuid`+`alterId`, status, errors |
| `AuditLog` | Every mutating action | actorType (USER/ASSISTANT/SYSTEM), actorId, action, entity, before/after JSON |
| `AssistantSession` / `AssistantMessage` / `AssistantAction` | Assistant chat + approval queue | action: toolName, input JSON, status (PROPOSED/APPROVED/REJECTED/EXECUTED/FAILED), approvedBy, executedAt |

`Invoice` changes: add `partyId` (backfill from `clientName`), `type`, `subtotal/taxAmount/totalAmount`, `amountPaid` (derived), `currency`, `tallyGuid`, keep legacy client fields during migration.

### 0.4 Phase gate

Phase 0 is **done** when: this plan is committed, all checklist accounts exist with envs documented, Stitch project + design system created, Tally sample exports are in `tests/fixtures/tally/`, and CI skeleton (lint+typecheck+build) is green on `main`. Only then does Phase 1 begin.

---

## Phase 1 — Foundation Hardening & Core Data Model

**Outcome:** tested, migrated data model for parties/items/payments/bills; audit logging; testing infra proven — on an upgraded, current toolchain.

0. **Framework upgrade first:** Node 26 LTS (`.nvmrc` + `engines`), Next.js 15 → 16 via `npx @next/codemod@latest upgrade` (async request APIs, config changes), React 19.2, TypeScript 6, Prisma 6 → 7 (new client engine; regenerate + verify all repository queries), Tailwind 4.3, and latest Clerk/Inngest/TanStack Query compatible releases. App must build and run identically before any schema work begins.
1. Add Vitest + first tests around existing `invoice.service` and `tally-parser` (characterization tests lock current behavior before refactors).
2. Prisma migrations for all Phase-0 blueprint models; migration + backfill script: distinct `clientName/clientEmail/clientPhone` → `Party` rows, link `Invoice.partyId`.
3. Repositories + services for Party, Item/Stock, Payment (with allocation logic: payment → oldest invoice or explicit bill-wise refs), Bill.
4. `AuditLog` written from a single service-layer helper wrapped around every mutating service method.
5. RBAC: `OrganizationMember.role` enforced (`owner`/`admin`/`member`/`viewer`) in `lib/api/handler`.
6. CI: lint, typecheck, vitest, build on every PR; `prisma migrate deploy` in the deploy pipeline.

**Gate:** all existing features still work (invoices list/create/remind); new models covered by unit tests; migration runs clean against a copy of prod data.

**Status (2026-07-04): CONDITIONAL GO.** All 13 tasks implemented on `worktree-phase-1-foundation-data-model`, each subagent-reviewed (2 real bugs caught and fixed with regression tests: `Bill.paidAt` overwrite, `parseRole` prototype-chain bypass); full suite green (66/66), lint/typecheck/build clean. Outstanding before this phase is fully closed: prod-copy migration rehearsal, manual live-Clerk browser regression, CI workflow verified green on real GitHub Actions, and user sign-off — see `docs/setup/PHASE-1-GATE.md` for the full status table, open risks, and sign-off block.

## Phase 2 — Tally Prime Import (full schema match) ⭐ most important

**Outcome:** user exports from Tally Prime and gets parties, stock items, sales/purchase/receipt/payment vouchers imported with bill-wise payment matching — idempotently.

1. **Masters import:** parse `LEDGER` (→ Party incl. GSTIN, address, credit period, opening balance) and `STOCKITEM` (→ Item incl. unit, HSN, GST rate, opening stock) from Masters XML.
2. **Voucher import:** extend the existing parser to a full voucher engine — `VOUCHER` with `VCHTYPE` routing: Sales→Invoice(+line items from `ALLINVENTORYENTRIES.LIST`, stock OUT movements), Purchase→Bill(+stock IN), Receipt→Payment IN with `BILLALLOCATIONS.LIST` → invoice allocations, Payment→Payment OUT, Credit/Debit Notes→adjustments.
3. **Idempotency & sync:** key on `GUID` + `ALTERID`; re-import updates changed vouchers, skips unchanged; `ImportBatch` UI shows created/updated/skipped/errored with row-level messages and an undo (batch revert).
4. **Import UX (Stitch-designed):** guided wizard — upload Masters first, then vouchers; preview table with warnings (missing emails/phones → prompt to fill on Party); mapping report downloadable.
5. All parsing pure-function + heavily unit-tested against real fixture files from Phase 0; large files processed in an Inngest job with progress.
6. Document (docs/TALLY.md) the exact export steps in Tally Prime for the user, plus the optional LAN HTTP-XML auto-sync path as a later enhancement.

**Gate:** round-trip test — user's real Tally export imports with 0 unexplained errors; re-import produces 0 duplicates; receivables total matches Tally's outstanding report.

## Phase 3 — Stitch Frontend Overhaul

**Outcome:** every screen redesigned via Stitch and rebuilt; all user-facing actions available as buttons/flows.

1. Stitch design system finalized (Phase 0 project): tokens, components, light/dark.
2. Generate + iterate screens in Stitch, then implement: App shell/navigation, Dashboard, Invoices (list with saved filters/bulk actions/status chips, detail with timeline of communications & payments, create/edit with line items + stock picker), Bills, Parties & Agents (directory, party ledger statement view, agent → managed parties rollup), Stock (item list, movements, low-stock), Payments (record + allocate UI), Imports wizard, Reminders (per-invoice schedule editor, sequence settings, tone picker, channel toggles), Settings.
3. Every mutation gets an explicit UI affordance (buttons the user asked for): mark paid/partial, send reminder now (email/WhatsApp), snooze, write-off, duplicate invoice, export CSV/PDF, statement download per party.
4. Playwright smoke test per screen; responsive + dark mode verified.

**Gate:** design review with user on Stitch screens *before* implementation of each screen batch; all smoke tests green.

**Status: DONE.** Signed off 2026-07-05 — see `docs/setup/PHASE-3-GATE.md`.

## Phase 4 — Communications: Email + WhatsApp side by side

**Outcome:** dunning engine sends reminders over email and WhatsApp in parallel with full delivery tracking.

1. `ChannelProvider` interface; refactor existing email path onto it; add WhatsApp Cloud API provider (template messages; session messages for replies).
2. Reminder scheduler fans out per enabled channel; per-party channel preferences; quiet hours; escalation sequence (friendly → professional → firm → final notice) configurable per org.
3. Webhooks: Resend (delivered/bounce/open) and WhatsApp (sent/delivered/read/reply) → `CommunicationLog`; replies surfaced on the invoice timeline; STOP/opt-out honored per channel.
4. Payment links / UPI details block in templates; "thanks" auto-message when an invoice is marked paid.

**Gate:** end-to-end test on a sandbox number + test inbox: schedule → send → webhook status → timeline display, both channels.

## Phase 5 — Analytics & Trackers

**Outcome:** the numbers the user asked for, live and accurate.

1. Receivables/payables headline tiles: **money to come** (outstanding receivables), **money to pay** (outstanding bills), **total invoices pending** (count+value), overdue value, collected this month.
2. Aging report (0-30/31-60/61-90/90+) for receivables and payables; DSO; collection-rate trend; cash-flow projection from due dates.
3. Party/agent analytics: exposure per party, average days-to-pay, on-time %, agent leaderboard (collections attributed via `agentId`), risk flags (over credit limit / habitual late).
4. Stock analytics: current stock + valuation, movement trends, low-stock/reorder alerts (Inngest daily job → notification), dead-stock report.
5. Implementation: SQL aggregate queries in a `analytics.service`, cached via unstable_cache/Redis with a short TTL; charts with Recharts following the dataviz skill.

**Gate:** every tile reconciles against a hand-computed value on seeded fixture data (unit-tested aggregates).

## Phase 6 — AI Assistant (approval-gated, guarded)

**Outcome:** a chat assistant (side panel on every page) that can read anything and do anything in the product — with user approval on every write.

1. **Tool registry:** ~25 tools wrapping existing services only — e.g. `search_invoices`, `get_party_ledger`, `get_analytics`, `create_invoice`, `record_payment`, `send_reminder`, `update_reminder_settings`, `draft_email`, `draft_whatsapp`, `import_status`, `adjust_stock`. Each tool: zod input schema, `organizationId` injected server-side from session, RBAC-checked, classified `read` or `write`.
2. **Approval loop:** write tools don't execute — they create `AssistantAction(PROPOSED)` rendered as an approval card in chat (human-readable diff: "Mark INV-042 ₹18,500 as PAID"). Approve → execute via service + audit log; Reject → feedback to model. Batch approvals allowed but each action itemized.
3. **Guardrails (jailbreak resistance):**
   - System prompt scoping: assistant may only discuss/operate this org's data; refuses off-scope requests.
   - Injection defense: all DB-sourced text (notes, party names, email/WhatsApp replies) wrapped as untrusted data in tool results; instructions in that content are never followed — enforced by prompt policy *and* by the fact that tools are the only capability surface.
   - Server-side authorization is the real boundary: no raw SQL/Prisma/HTTP tools; model cannot name an org or bypass RBAC; viewer-role users get read tools only.
   - Rate limits + daily token budget per org (Upstash); kill switch env flag; every session/message/action persisted for review.
   - Red-team test suite: prompt-injection fixtures (malicious invoice notes, "ignore previous instructions" in a WhatsApp reply) asserted to produce no unapproved action.
4. **Streaming chat UI** (Stitch-designed side drawer), context chips (current page entity auto-shared), slash-shortcuts ("/remind all overdue > 30d").
5. Model: Claude `claude-sonnet-5` default, `claude-fable-5` optional tier; email drafting can still route to Groq/Gemini for cost.

**Gate:** red-team suite green; every write demonstrably blocked without approval; audit log complete for a scripted 20-action session.

## Phase 7 — Deployment, Observability & Launch

**Outcome:** production-grade, monitored deployment.

1. Cloudflare Pages production: env audit, custom domain, security headers/CSP, Clerk prod keys.
2. `prisma migrate deploy` gated in CI; DB backup schedule + tested restore; seed script for staging.
3. Sentry (errors + traces), structured logs via existing `lib/logger`, uptime check, Inngest failure alerts to email/Slack.
4. Load sanity: dashboard and invoice list under 10k invoices / 1k parties (indexes verified with `EXPLAIN`).
5. Docs: `docs/RUNBOOK.md` (oncall basics), `docs/TALLY.md`, updated `README.md`; onboarding walkthrough for the user.
6. Launch checklist + 1-week hypercare: monitor deliverability, webhook health, assistant costs.

**Gate:** production smoke suite green post-deploy; user completes a real Tally import + sends a real reminder on both channels.

---

## Sequencing & dependencies

```
Phase 0 ─▶ Phase 1 (data model) ─▶ Phase 2 (Tally) ─▶ Phase 5 (analytics)
                     │                                     ▲
                     ├──▶ Phase 3 (Stitch UI, per-screen as models land)
                     ├──▶ Phase 4 (channels)───────────────┤
                     └──────────────▶ Phase 6 (assistant needs 1–5's services)
Phase 7 last. Phases 3 & 4 can run in parallel after Phase 1.
```

## Risks & mitigations

- **WhatsApp template approval delay** → apply in Phase 0; Twilio fallback.
- **Tally schema variance across companies/versions** → fixture-driven parser, warnings-not-failures, per-record error reporting, iterate on user's real files.
- **Assistant jailbreak/injection** → capability surface = approved tools only + server-side authz + approval gate + red-team suite (defense in depth; prompt is the weakest layer, not the only one).
- **Migration risk on live invoice data** → characterization tests first, backfill scripts rehearsed on a prod copy, legacy columns kept until verified.
- **Scope creep** → each phase gate requires user sign-off before the next detailed plan is written.
