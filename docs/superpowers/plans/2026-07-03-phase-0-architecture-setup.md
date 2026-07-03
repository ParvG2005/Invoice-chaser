# Phase 0: Architecture, Prerequisites & Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent plan:** `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (read its Phase 0 section before starting).
>
> **Hard rule for this phase: no application code.** Nothing under `src/` changes. Allowed outputs: documentation (`docs/`), configuration (`.github/`, `.nvmrc`, `package.json` scripts/engines only), test fixtures (`tests/fixtures/`), and provisioned external accounts. Several tasks are **USER ACTION** tasks — they need the human's credentials/decisions; the agent prepares everything, presents exact instructions, and records the result.

**Goal:** Lock in the architecture, provision every external service, set up CI and design tooling, and collect Tally fixtures — so Phase 1 can start with zero unknowns.

**Architecture:** Single Next.js monolith on Vercel; Postgres via Prisma; Inngest for background jobs; channel-abstracted messaging (Resend email + WhatsApp Cloud API); AI assistant as an approval-gated tool loop over the service layer; Stitch-first UI design. (Full rationale in parent plan §0.1.)

**Tech Stack targets:** Node 26 LTS, Next.js ≥16.2, React ≥19.2, TypeScript ≥6.0, Prisma ≥7.8, Tailwind ≥4.3 (upgrade itself happens in Phase 1 Step 0, not here).

## Global Constraints

- No changes under `src/` or `prisma/schema.prisma` in this phase.
- Secrets never committed — env values live in Vercel/provider dashboards and local `.env` (gitignored); docs record variable *names* and owners only.
- Every task ends in a commit (docs/config/fixtures are all committable).
- Real Tally fixture files must be sanitized (user confirms no data they consider sensitive) before committing; otherwise store paths outside the repo and note it in the fixtures README.

---

### Task 1: Architecture Decision Records

**Files:**
- Create: `docs/architecture/ADR-001-monolith-on-vercel.md`
- Create: `docs/architecture/ADR-002-party-centric-ledger.md`
- Create: `docs/architecture/ADR-003-tally-file-first-import.md`
- Create: `docs/architecture/ADR-004-channel-abstracted-messaging.md`
- Create: `docs/architecture/ADR-005-assistant-tool-loop-with-approval.md`
- Create: `docs/architecture/README.md` (index)

**Interfaces:**
- Produces: the decision record set that every later phase plan cites by ADR number.

- [ ] **Step 1: Write the five ADRs.** Each uses this exact template, with content transcribed and expanded from parent plan §0.1 decisions 1–5 (one ADR per decision; decision 6 Stitch and 7 analytics are process choices, recorded in the README index as "non-ADR conventions"):

```markdown
# ADR-00N: <Title>

- **Status:** Accepted
- **Date:** 2026-07-03

## Context
<What problem/forces exist. 1-2 paragraphs, specific to Invoice Chaser.>

## Decision
<The choice made, stated imperatively.>

## Alternatives considered
<2-3 real alternatives and why each was rejected.>

## Consequences
<What becomes easier, what becomes harder, what we're committing to.>
```

- [ ] **Step 2: Write `docs/architecture/README.md`** listing all ADRs with one-line summaries, plus the two non-ADR conventions (Stitch-first UI, precomputed+live analytics) and the layered-architecture convention (route → handler → service → repository → Prisma).

- [ ] **Step 3: Self-check** — every ADR names at least two alternatives and at least one accepted downside. Fix any that read as advertisements rather than decisions.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/
git commit -m "docs: add Phase 0 architecture decision records"
```

---

### Task 2: Environment & Secrets Matrix

**Files:**
- Create: `docs/ENVIRONMENT.md`
- Modify: `.env.example` (create if absent — names only, no values)

**Interfaces:**
- Produces: canonical list of env var names used by Tasks 3–8 and all later phases.

- [ ] **Step 1: Inventory current env usage:**

```bash
grep -rhoE "process\.env\.[A-Z0-9_]+" src prisma next.config.ts | sort -u
```

- [ ] **Step 2: Write `docs/ENVIRONMENT.md`** — a table with columns: `Variable | Used by | Local dev | Vercel Preview | Vercel Prod | Owner/where to get it`. Include every variable found in Step 1 plus the planned ones:

```
DATABASE_URL, DIRECT_URL                         (Postgres — Task 4)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY (Clerk — Task 5)
RESEND_API_KEY, RESEND_WEBHOOK_SECRET            (Email — Task 6)
WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN,
WHATSAPP_WEBHOOK_VERIFY_TOKEN                    (WhatsApp — Task 6)
ANTHROPIC_API_KEY                                (Assistant — Task 7)
GROQ_API_KEY, GEMINI_API_KEY                     (existing AI drafting)
INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY           (Jobs — Task 7)
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (Rate limits — Task 7)
SENTRY_DSN, SENTRY_AUTH_TOKEN                    (Observability — Task 7)
ASSISTANT_KILL_SWITCH                            (Phase 6 guardrail flag)
```

- [ ] **Step 3: Write `.env.example`** with every variable name and a one-line comment each, all values blank. Verify `.env` is in `.gitignore` (add if missing).

- [ ] **Step 4: Commit**

```bash
git add docs/ENVIRONMENT.md .env.example .gitignore
git commit -m "docs: add environment and secrets matrix"
```

---

### Task 3: CI Skeleton (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.nvmrc`
- Modify: `package.json` (add `engines` and `typecheck` script only — no dependency changes)

**Interfaces:**
- Produces: `ci.yml` jobs `lint`, `typecheck`, `build` that Phase 1 extends with `test`.

- [ ] **Step 1: Pin Node.** `.nvmrc` containing exactly `26`. In `package.json` add:

```json
"engines": { "node": ">=26" },
```

and to `scripts`:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 2: Write `.github/workflows/ci.yml`:**

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
        env:
          DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci"
          DIRECT_URL: "postgresql://ci:ci@localhost:5432/ci"
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CI_CLERK_PUBLISHABLE_KEY }}
          CLERK_SECRET_KEY: ${{ secrets.CI_CLERK_SECRET_KEY }}
```

(Build needs only syntactically valid env values; note in the workflow comments which are dummies. If `next build` fails on a missing var, add a dummy for it rather than changing `src/`.)

- [ ] **Step 3: Verify locally** — run `npm run lint && npm run typecheck && npm run build` with the current `.env`. Expected: all pass (this validates the scripts, not CI itself).

- [ ] **Step 4: Push a branch, open a draft PR, confirm the workflow runs green.** USER ACTION if repo secrets are needed: add `CI_CLERK_*` dev keys under GitHub → Settings → Secrets → Actions.

- [ ] **Step 5: Commit/merge**

```bash
git add .github/workflows/ci.yml .nvmrc package.json
git commit -m "ci: add lint/typecheck/build workflow and Node 26 pin"
```

---

### Task 4: Database & Hosting Provisioning — **USER ACTION**

**Files:**
- Create: `docs/setup/PROVISIONING.md` (running log of what was created, by whom, with dashboard URLs — no secrets)

**Interfaces:**
- Produces: live Vercel project + prod/preview Postgres, recorded in `PROVISIONING.md`; `DATABASE_URL`/`DIRECT_URL` set in Vercel envs.

- [ ] **Step 1: Prepare exact instructions** in `docs/setup/PROVISIONING.md` for the user: create/link Vercel project to the GitHub repo (framework auto-detected: Next.js), enable preview deployments; create Supabase (or Neon — record the choice as an addendum to ADR-001) project for production and a second branch/database for preview.
- [ ] **Step 2: USER ACTION —** user performs the above; agent verifies via `vercel whoami`/`vercel env ls` (or the Supabase MCP `list_projects`) that project + envs exist.
- [ ] **Step 3: Set `DATABASE_URL`, `DIRECT_URL` in Vercel prod + preview** (user pastes values into Vercel dashboard; never into the repo). Record variable placement in `docs/ENVIRONMENT.md` table.
- [ ] **Step 4: Decision recorded:** migration workflow switches from `prisma db push` to `prisma migrate` starting Phase 1 — note this in `PROVISIONING.md` with a link to ADR-002.
- [ ] **Step 5: Commit** `docs/setup/PROVISIONING.md`.

---

### Task 5: Auth (Clerk) Production Instance — **USER ACTION**

**Files:**
- Modify: `docs/setup/PROVISIONING.md` (append Clerk section)

- [ ] **Step 1: Prepare instructions:** create Clerk production instance, configure production domain (once known from Task 4), copy prod publishable/secret keys into Vercel prod env. Keep dev keys for local/preview.
- [ ] **Step 2: USER ACTION —** user executes; agent verifies the Vercel prod env now lists both Clerk vars (`vercel env ls production`).
- [ ] **Step 3: Record decision** (from parent plan): org modeling stays in-app (`Organization` table), Clerk used for identity only.
- [ ] **Step 4: Commit** the PROVISIONING.md update.

---

### Task 6: Messaging Providers (Resend + WhatsApp) — **USER ACTION, start early (longest lead time)**

**Files:**
- Modify: `docs/setup/PROVISIONING.md` (append Email + WhatsApp sections)
- Create: `docs/setup/WHATSAPP_TEMPLATES.md`

- [ ] **Step 1: Resend instructions:** verify sending domain (add SPF/DKIM DNS records — list the exact records Resend shows), create prod API key → Vercel, note webhook endpoint path reserved for Phase 4: `/api/webhooks/resend`.
- [ ] **Step 2: Draft WhatsApp message templates** in `docs/setup/WHATSAPP_TEMPLATES.md` — three payment-reminder templates (friendly / professional / firm) with placeholder variables `{{party_name}} {{invoice_number}} {{amount}} {{due_date}} {{payment_link}}`, written to comply with WhatsApp Business template rules (transactional category, no promotional wording). Include a fourth "payment received — thank you" template.
- [ ] **Step 3: USER ACTION —** user creates Meta Business Manager + WhatsApp Business account, registers phone number, submits the four templates for approval. Record app ID, phone number ID, and submission date in PROVISIONING.md. Note the fallback decision: if approval stalls >2 weeks, provision Twilio WhatsApp instead (record as ADR addendum).
- [ ] **Step 4: Commit** both docs.

---

### Task 7: Remaining Services (Anthropic, Inngest, Upstash, Sentry) — **USER ACTION**

**Files:**
- Modify: `docs/setup/PROVISIONING.md` (append one section each)

- [ ] **Step 1: Prepare instructions per service:** Anthropic API key (assistant, Phase 6); Inngest production app + event/signing keys (jobs already integrated in dev); Upstash Redis prod database (rate limits + assistant budgets); Sentry project for Next.js (record DSN).
- [ ] **Step 2: USER ACTION —** user creates each, pastes keys into Vercel envs per the ENVIRONMENT.md matrix.
- [ ] **Step 3: Agent verifies** each var appears in `vercel env ls` for the right environments and ticks the matrix cells in `docs/ENVIRONMENT.md`.
- [ ] **Step 4: Commit** doc updates.

---

### Task 8: Stitch Project & Design System

**Files:**
- Create: `docs/design/DESIGN_SYSTEM.md` (tokens + Stitch project reference)
- Create: `docs/design/SCREEN_INVENTORY.md`

**Interfaces:**
- Produces: Stitch project ID + design system ID recorded in `DESIGN_SYSTEM.md`; screen inventory that Phase 3's plan iterates over.

- [ ] **Step 1: Extract current brand tokens** from `src/app/globals.css` (read-only): color palette (light + dark), radius, font stack. Tabulate them in `docs/design/DESIGN_SYSTEM.md`.
- [ ] **Step 2: Create the Stitch project** ("InvoicePilot") and a design system from those tokens via the Stitch MCP tools (`create_project`, `create_design_system`). Record project + design-system IDs in the doc. (Consult the `stitch-first-design` skill before making Stitch calls.)
- [ ] **Step 3: Write `docs/design/SCREEN_INVENTORY.md`** — the 12 screens from parent plan §0.1 decision 6 (App shell, Dashboard, Invoices list/detail/editor, Bills, Parties & Agents, Stock, Payments, Imports wizard, Reminders, Analytics, Assistant drawer, Settings), each with: purpose, primary actions (buttons), data shown, and which phase implements it.
- [ ] **Step 4: Generate one pilot screen in Stitch** (Dashboard) from the design system to validate the pipeline end-to-end; link the screen ID in the doc. No code implementation — this is a design artifact only.
- [ ] **Step 5: USER ACTION — user reviews the pilot screen** and approves the design direction (or gives feedback; iterate in Stitch until approved). Record approval in the doc.
- [ ] **Step 6: Commit** `docs/design/`.

---

### Task 9: Tally Prime Fixtures & Export Runbook — **USER ACTION (critical path for Phase 2)**

**Files:**
- Create: `docs/TALLY.md`
- Create: `tests/fixtures/tally/README.md`
- Create: `tests/fixtures/tally/*.xml` (user-provided, sanitized)

**Interfaces:**
- Produces: real Masters + voucher XML files that Phase 2's parser tests are written against.

- [ ] **Step 1: Write `docs/TALLY.md` export runbook** with exact Tally Prime menu paths:
  - Masters: `Gateway of Tally → Display More Reports → List of Accounts → Alt+E (Export) → XML` (ledgers), same for Stock Items.
  - Vouchers: `Display More Reports → Day Book → set period → Alt+E → XML` (or Sales Register for sales only).
  - Note: export with "All masters" detail level; include the option names for enabling bill-wise details.
- [ ] **Step 2: USER ACTION —** user runs the exports on their real company data and delivers: `masters-ledgers.xml`, `masters-stockitems.xml`, `vouchers-daybook.xml` (covering at least one each of Sales, Purchase, Receipt, Payment voucher, with bill-wise allocations present).
- [ ] **Step 3: Sanitize with the user** — confirm party names/amounts are OK to commit, or anonymize (consistent find-replace of names/phones/emails; keep structure and amounts intact). Record what was changed in `tests/fixtures/tally/README.md`.
- [ ] **Step 4: Inventory the fixtures:** for each file list voucher types found, count, presence of `GUID`, `ALTERID`, `BILLALLOCATIONS.LIST`, `ALLINVENTORYENTRIES.LIST`, GST fields — this table goes in the fixtures README and directly scopes Phase 2 parsing tasks.
- [ ] **Step 5: Commit** docs + fixtures.

---

### Task 10: Phase Gate Review

**Files:**
- Modify: `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (tick Phase 0 checklist)
- Create: `docs/setup/PHASE-0-GATE.md`

- [ ] **Step 1: Walk the parent plan §0.2 checklist** — every box either ticked with evidence (dashboard URL, env var present, file path) or explicitly deferred with a reason and an owner. WhatsApp template *approval* may still be pending (Meta's timeline) — that alone does not block the gate; template *submission* does.
- [ ] **Step 2: Write `docs/setup/PHASE-0-GATE.md`:** status table of Tasks 1–9, open risks, and the go/no-go recommendation.
- [ ] **Step 3: USER ACTION — user signs off** (name + date in the gate doc).
- [ ] **Step 4: Commit.** Phase 1 detailed plan may now be written.

---

## Self-Review Notes

- Spec coverage: parent plan §0.2 checklist maps — Vercel/DB→Task 4, Clerk→5, Resend/WhatsApp→6, Anthropic/Inngest/Upstash/Sentry→7, Stitch→8, Tally fixtures→9, tooling/CI→3, env matrix→2, architecture→1, gate→10. Vitest/Playwright *installation* is deliberately deferred to Phase 1 (it touches `package.json` dependencies and test scaffolding — code-adjacent; only the CI skeleton lands here), and the parent plan's Phase 1 already covers it.
- The `graphify` checklist item from the parent plan is dropped: `graphify-out/` was removed from the repo on 2026-07-03; strike it from the parent checklist during Task 10 and remove the stale section from CLAUDE.md.
- Ordering: Tasks 1–3 are agent-only and can run immediately in sequence; Tasks 4–9 need user participation — start Task 6 (WhatsApp) and Task 9 (Tally exports) first, as both have external lead times.
