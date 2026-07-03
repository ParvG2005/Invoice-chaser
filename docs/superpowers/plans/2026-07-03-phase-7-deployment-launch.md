# Phase 7: Deployment, Observability & Launch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent plan:** `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (read its Phase 7 section and Global Constraints before starting).
>
> **Prerequisites (consumed, not redefined here):** Phase 0 provisioned Vercel, Postgres, Clerk prod, Sentry, Inngest, Upstash (recorded in `docs/setup/PROVISIONING.md`; env matrix in `docs/ENVIRONMENT.md`). Vitest + Playwright exist from Phases 1/3. Channel webhooks live at `/api/webhooks/resend` and `/api/webhooks/whatsapp` (Phase 4). Assistant with `ASSISTANT_KILL_SWITCH` + per-org budgets (Phase 6). `analytics.service` (Phase 5). Structured logger at `src/lib/logger/index.ts` (`logger`, `createLogger(context)`).

**Goal:** Ship Invoice Chaser to production on Vercel with hardened headers, gated migrations, tested backups, full observability (Sentry + structured logs + uptime + Inngest alerts), verified performance at 10k invoices / 1k parties, complete operator docs, and a launch checklist with 1-week hypercare.

**Architecture:** No new product features. This phase adds: security headers/CSP in `next.config.ts`, a `migrate` job in GitHub Actions gating `prisma migrate deploy` on main, `@sentry/nextjs` instrumentation, a `@smoke`-tagged Playwright subset runnable against the deployed URL, volume-seed + `EXPLAIN` verification scripts, and operational docs (`RUNBOOK.md`, final `TALLY.md`, README, onboarding).

**Tech Stack:** Next.js ≥16.2 on Vercel, Prisma ≥7.8 (`migrate deploy`), `@sentry/nextjs` (latest stable), Playwright (existing), GitHub Actions, Postgres (Supabase per Phase 0), Inngest, Upstash.

## Global Constraints

- Version floors (parent plan, verbatim): Node >= 26 (LTS), Next.js >= 16.2, React >= 19.2, TypeScript >= 6.0, Prisma >= 7.8, Tailwind >= 4.3. Node pinned via `.nvmrc`/`engines` (done Phase 0/1).
- Multi-tenant: every query org-scoped at the repository layer; no cross-org data access, ever — the volume-seed script must create its own throwaway org(s), never touch real orgs.
- Secrets only in env vars / provider credential stores; never in code, prompts, or logs. Docs record variable *names* and owners only.
- All assistant writes require explicit user approval — nothing in this phase may loosen that (kill switch stays wired).
- Existing layered convention preserved: `app/api` route → `lib/api/handler` → `server/services` → `server/repositories` → Prisma. Scripts in this phase call services/repositories or raw SQL via a dedicated script entrypoint — never ad-hoc Prisma from route code.
- TDD for all service/parser/tool code; Playwright smoke tests for each new page (this phase only *tags* existing tests and adds config, no new pages).
- Every task ends in a commit.
- **USER ACTION** tasks need human credentials/decisions; the agent prepares exact instructions, the user executes, the agent verifies and records the result in `docs/setup/PROVISIONING.md`.

---

### Task 1: Production Environment Audit — **USER ACTION (verification)**

**Files:**
- Modify: `docs/ENVIRONMENT.md` (tick/complete the `Vercel Prod` column)
- Modify: `docs/setup/PROVISIONING.md` (append "Phase 7 env audit" section)

**Interfaces:**
- Consumes: the env matrix from Phase 0 Task 2 (`docs/ENVIRONMENT.md`).
- Produces: a verified, dated statement that every production variable exists in Vercel prod — precondition for Tasks 2–11.

- [ ] **Step 1: List what production actually has:**

```bash
vercel env ls production
```

- [ ] **Step 2: Diff against `docs/ENVIRONMENT.md`.** Every row whose `Vercel Prod` column says required must appear in the output. Expected full set (from Phase 0 + later phases):

```
DATABASE_URL, DIRECT_URL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY        (must be pk_live_/sk_live_ — see Task 3)
RESEND_API_KEY, RESEND_WEBHOOK_SECRET
WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_WEBHOOK_VERIFY_TOKEN
ANTHROPIC_API_KEY
GROQ_API_KEY, GEMINI_API_KEY
INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
SENTRY_DSN, SENTRY_AUTH_TOKEN, NEXT_PUBLIC_SENTRY_DSN      (NEXT_PUBLIC_ added in Task 6)
ASSISTANT_KILL_SWITCH                                       (set to "false" in prod, documented flip procedure in RUNBOOK)
```

- [ ] **Step 3: USER ACTION —** user pastes any missing values into Vercel prod (dashboard → Project → Settings → Environment Variables). Agent re-runs Step 1 to confirm; no values are ever echoed into the repo.
- [ ] **Step 4: Record the audit** in `docs/setup/PROVISIONING.md`: date, who verified, list of variable *names* confirmed present, any deliberately absent vars with reason.
- [ ] **Step 5: Commit**

```bash
git add docs/ENVIRONMENT.md docs/setup/PROVISIONING.md
git commit -m "docs: phase 7 production environment audit"
```

---

### Task 2: Security Headers & CSP in `next.config.ts`

**Files:**
- Modify: `next.config.ts`
- Test: `tests/e2e/security-headers.spec.ts`

**Interfaces:**
- Consumes: current `next.config.ts` (empty config object). Task 6 wraps this same file with `withSentryConfig` — Task 6's snippet already includes these headers, so do this task first.
- Produces: `securityHeaders` array and a `headers()` function that Task 6 preserves.

- [ ] **Step 1: Write the failing Playwright test** at `tests/e2e/security-headers.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("security headers @smoke", () => {
  test("root document carries hardening headers", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["strict-transport-security"]).toContain("max-age=63072000");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers()["permissions-policy"]).toContain("camera=()");
    const csp = res.headers()["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("clerk");
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npx playwright test tests/e2e/security-headers.spec.ts`
Expected: FAIL — headers undefined (dev server sends none of them).

- [ ] **Step 3: Implement the headers in `next.config.ts`.** Replace the whole file with:

```typescript
import type { NextConfig } from "next";

// Clerk loads its JS from the instance's clerk.* domain and calls its API from
// clerk.<our-domain> (set after Task 3's custom domain + Clerk prod DNS).
// Resend/WhatsApp/Anthropic are server-side only — no CSP entries needed.
const CLERK_ORIGINS =
  "https://*.clerk.accounts.dev https://clerk.invoicepilot.in https://*.clerk.com";

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is required by Next.js inline runtime scripts and Clerk;
  // revisit with nonces if we later adopt next/script strict mode.
  `script-src 'self' 'unsafe-inline' ${CLERK_ORIGINS}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://img.clerk.com",
  "font-src 'self' data:",
  `connect-src 'self' ${CLERK_ORIGINS} https://*.ingest.sentry.io https://*.ingest.us.sentry.io wss://*.clerk.accounts.dev`,
  `frame-src ${CLERK_ORIGINS}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
```

Replace `invoicepilot.in` with the actual custom domain chosen in Task 3 (if Task 3 hasn't landed yet, keep the placeholder and Task 3 Step 5 updates it).

- [ ] **Step 4: Run the test again.**

Run: `npx playwright test tests/e2e/security-headers.spec.ts`
Expected: PASS.

- [ ] **Step 5: Manual verify Clerk still works with CSP on:** `npm run dev`, sign in, open browser console — zero CSP violation errors on sign-in page, dashboard, and assistant drawer. If a provider origin is blocked, add the *specific* origin to the relevant directive (never widen to `*`), and note it in a code comment.
- [ ] **Step 6: Commit**

```bash
git add next.config.ts tests/e2e/security-headers.spec.ts
git commit -m "feat: add security headers and CSP to next.config"
```

---

### Task 3: Custom Domain + Clerk Production Keys Live — **USER ACTION**

**Files:**
- Modify: `docs/setup/PROVISIONING.md` (append "Custom domain + Clerk go-live")
- Modify: `next.config.ts` (finalize domain in `CLERK_ORIGINS` from Task 2)

**Interfaces:**
- Consumes: Clerk prod instance from Phase 0 Task 5; Vercel project from Phase 0 Task 4.
- Produces: the production URL (referred to below as `$PROD_URL`) used by Tasks 7, 10, 12.

- [ ] **Step 1: Prepare exact instructions in `PROVISIONING.md`:** (a) user buys/assigns domain and adds it in Vercel → Project → Settings → Domains; (b) adds the DNS records Vercel displays (A/ALIAS + CNAME); (c) in Clerk dashboard → prod instance → Domains, sets the same domain and adds Clerk's CNAME records (`clerk.<domain>`, `accounts.<domain>`, DKIM records as shown); (d) confirms `pk_live_`/`sk_live_` keys are the ones in Vercel prod env (Task 1 verified presence; this verifies they are *live* keys, not `pk_test_`).
- [ ] **Step 2: USER ACTION —** user executes (a)–(d). DNS propagation may take up to 24h; do other tasks meanwhile.
- [ ] **Step 3: Agent verifies:**

```bash
curl -sI https://<domain> | grep -i "strict-transport-security"   # headers live on prod
vercel env ls production | grep CLERK                              # keys present
```

Expected: HSTS header present; both Clerk vars listed. Then sign in once on production — Clerk redirects stay on the custom domain.

- [ ] **Step 4: Record** domain, registrar, DNS records added (names only), and go-live date in `PROVISIONING.md`.
- [ ] **Step 5: Finalize `CLERK_ORIGINS`** in `next.config.ts` with the real `clerk.<domain>` origin; re-run `npx playwright test tests/e2e/security-headers.spec.ts` (PASS).
- [ ] **Step 6: Commit**

```bash
git add docs/setup/PROVISIONING.md next.config.ts
git commit -m "chore: custom domain live, finalize Clerk CSP origin"
```

---

### Task 4: `prisma migrate deploy` Gated in CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/setup/PROVISIONING.md` (record the `PROD_DIRECT_URL` GitHub secret, name only)

**Interfaces:**
- Consumes: Phase 0's `ci.yml` `checks` job (lint/typecheck/build) and Phase 1's `test` job.
- Produces: a `migrate` job that runs only on `main`, only after checks+tests pass. RUNBOOK (Task 9) documents the expand/contract rule this creates.

- [ ] **Step 1: Add the `migrate` job to `.github/workflows/ci.yml`.** The file after this change (Phase 0/1 jobs unchanged, new job appended):

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

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run test   # vitest, added Phase 1

  # Runs prisma migrations against production BEFORE Vercel's deploy finishes
  # building. Because the two are not strictly ordered, every migration must be
  # backward-compatible with the previous app version (expand/contract), per
  # docs/RUNBOOK.md "Migrations".
  migrate:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: [checks, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.PROD_DIRECT_URL }}
          DIRECT_URL: ${{ secrets.PROD_DIRECT_URL }}
```

- [ ] **Step 2: USER ACTION —** user adds GitHub repo secret `PROD_DIRECT_URL` (the pooling-bypass direct connection string; migrations must not go through PgBouncer): GitHub → Settings → Secrets and variables → Actions. Record the secret *name* in `PROVISIONING.md`.
- [ ] **Step 3: Verify on a no-op:** push a branch with only this yaml change, open PR — `migrate` must show as *skipped* on the PR run. Merge to `main` — `migrate` runs and logs either applied migrations or `No pending migrations to apply.`

Expected: exactly that output; any drift error means prod was ever touched by `db push` — resolve with `prisma migrate resolve --applied <migration>` per Prisma docs before proceeding, and note it in `PROVISIONING.md`.

- [ ] **Step 4: Commit** (this is the yaml-change PR itself)

```bash
git add .github/workflows/ci.yml docs/setup/PROVISIONING.md
git commit -m "ci: gate prisma migrate deploy on main after checks and tests"
```

---

### Task 5: DB Backups, Restore Drill & Staging Seed Script

**Files:**
- Create: `scripts/seed-staging.ts`
- Modify: `package.json` (add `seed:staging` script)
- Modify: `docs/setup/PROVISIONING.md` (append "Backups" section)

**Interfaces:**
- Consumes: existing repositories/services are *not* used — the seed writes via a standalone Prisma client (scripts run outside the Next.js request context); models from `prisma/schema.prisma` as of Phase 1 (Party, Item, Invoice, InvoiceLineItem, Bill, Payment, ReminderSettings, Organization, OrganizationMember, User).
- Produces: `npm run seed:staging` → deterministic demo org; backup schedule + a *dated, evidenced* restore drill.

- [ ] **Step 1: USER ACTION — configure backups on the Postgres provider** (Supabase, per Phase 0 Task 4). Instructions to prepare in `PROVISIONING.md`: enable daily automated backups (Supabase dashboard → Database → Backups; on the current plan confirm retention — 7 days minimum; enable PITR if the plan allows, decision + cost recorded). Record: schedule, retention, PITR yes/no, dashboard URL.
- [ ] **Step 2: Restore drill — prove a backup restores.** Agent prepares, user executes with agent watching:
  1. Create a scratch database (Supabase: restore latest backup to a *new* project, or locally: `createdb restore_drill`).
  2. Restore the latest backup into it (Supabase restore flow, or `pg_restore -d restore_drill <dump>` if using manual `pg_dump`).
  3. Verify:

```sql
SELECT count(*) FROM invoices;          -- matches prod count at backup time
SELECT max(created_at) FROM invoices;   -- within 24h of backup timestamp
SELECT count(*) FROM _prisma_migrations; -- matches prod migration count
```

  4. Destroy the scratch database/project.
  Record in `PROVISIONING.md`: drill date, backup timestamp used, the three counts, time-to-restore. **The drill is not optional — an unrestored backup is not a backup.**
- [ ] **Step 3: Write `scripts/seed-staging.ts`** — small, deterministic, idempotent seed for the preview/staging DB (distinct from Task 8's volume seed):

```typescript
/**
 * Seeds the staging/preview database with a small deterministic demo org.
 * Idempotent: keyed on the demo org's fixed slug; re-running updates nothing
 * and exits if the org exists. NEVER run against production.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_SLUG = "demo-staging-org";

async function main() {
  if (process.env.SEED_ALLOW !== "staging") {
    throw new Error("Refusing to run: set SEED_ALLOW=staging explicitly.");
  }
  const existing = await prisma.organization.findFirst({ where: { slug: DEMO_SLUG } });
  if (existing) {
    console.log("Demo org already seeded, exiting.");
    return;
  }

  const org = await prisma.organization.create({
    data: { name: "Demo Trading Co (Staging)", slug: DEMO_SLUG },
  });

  const parties = await Promise.all(
    ["Sharma Textiles", "Gupta Hardware", "Verma Agencies", "Iyer Exports", "Khan Distributors"].map(
      (name, i) =>
        prisma.party.create({
          data: {
            organizationId: org.id,
            type: "CUSTOMER",
            name,
            email: `party${i + 1}@example.com`,
            phone: `+9198765000${i}0`,
            creditDays: 30,
          },
        }),
    ),
  );

  const today = new Date();
  const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000);

  // 20 invoices: mix of PENDING / OVERDUE / PAID across aging buckets
  for (let i = 0; i < 20; i++) {
    const party = parties[i % parties.length];
    const overdueDays = [-5, 10, 25, 45, 75, 120][i % 6]; // negative = not yet due
    const status = i % 4 === 0 ? "PAID" : overdueDays > 0 ? "OVERDUE" : "PENDING";
    await prisma.invoice.create({
      data: {
        organizationId: org.id,
        partyId: party.id,
        invoiceNumber: `STG-${String(i + 1).padStart(3, "0")}`,
        type: "RECEIVABLE",
        status,
        issueDate: day(-(overdueDays + 30)),
        dueDate: day(-overdueDays),
        subtotal: new Prisma.Decimal(10000 + i * 500),
        taxAmount: new Prisma.Decimal((10000 + i * 500) * 0.18),
        totalAmount: new Prisma.Decimal((10000 + i * 500) * 1.18),
        currency: "INR",
      },
    });
  }
  console.log(`Seeded org ${org.id}: ${parties.length} parties, 20 invoices.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

Field names must match `prisma/schema.prisma` as it exists after Phase 1 — reconcile at implementation time (e.g. if the Party relation field or enum literals differ, follow the schema, not this snippet).

- [ ] **Step 4: Add the npm script** to `package.json` `scripts`:

```json
"seed:staging": "tsx scripts/seed-staging.ts"
```

(`tsx` is already a devDependency from Phase 1 test tooling; if not, `npm i -D tsx`.)

- [ ] **Step 5: Run against the preview DB and verify:**

Run: `SEED_ALLOW=staging DATABASE_URL=<preview-db-url> DIRECT_URL=<preview-db-url> npm run seed:staging`
Expected: `Seeded org ...: 5 parties, 20 invoices.` Second run prints `Demo org already seeded, exiting.` Refuses entirely without `SEED_ALLOW=staging`.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-staging.ts package.json docs/setup/PROVISIONING.md
git commit -m "feat: staging seed script; document backup schedule and restore drill"
```

---

### Task 6: Sentry — Errors + Traces

**Files:**
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Create: `src/instrumentation.ts`
- Create: `src/instrumentation-client.ts`
- Modify: `next.config.ts` (wrap with `withSentryConfig`)
- Modify: `.env.example` (add `NEXT_PUBLIC_SENTRY_DSN`)
- Modify: `docs/ENVIRONMENT.md` (add `NEXT_PUBLIC_SENTRY_DSN` row)

**Interfaces:**
- Consumes: `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` from Phase 0 Task 7; the `headers()` config from Task 2.
- Produces: `Sentry.captureException` available everywhere; traces on API routes; source maps uploaded on Vercel builds. RUNBOOK (Task 9) links the Sentry project.

- [ ] **Step 1: Install:**

```bash
npm install @sentry/nextjs
```

- [ ] **Step 2: Create `sentry.server.config.ts`** (repo root):

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.2 : 1.0,
  // Never send request bodies/headers wholesale — invoices contain party PII.
  sendDefaultPii: false,
  enabled: process.env.NODE_ENV === "production",
});
```

- [ ] **Step 3: Create `sentry.edge.config.ts`** (repo root — middleware runs on edge):

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: 0.2,
  enabled: process.env.NODE_ENV === "production",
});
```

- [ ] **Step 4: Create `src/instrumentation.ts`:**

```typescript
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 5: Create `src/instrumentation-client.ts`:**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 0, // no session replay: invoice pages show party PII
  enabled: process.env.NODE_ENV === "production",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 6: Wrap `next.config.ts`.** Keep everything from Tasks 2–3 and change only the export:

```typescript
import { withSentryConfig } from "@sentry/nextjs";
// ...existing csp/securityHeaders/nextConfig from Task 2 unchanged...

export default withSentryConfig(nextConfig, {
  org: "<sentry-org-slug from docs/setup/PROVISIONING.md>",
  project: "<sentry-project-slug>",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true, // strips Sentry debug logger from client bundles
});
```

- [ ] **Step 7: USER ACTION —** user adds `NEXT_PUBLIC_SENTRY_DSN` (same DSN value) to Vercel prod+preview and confirms `SENTRY_AUTH_TOKEN` is available to Vercel builds (needed for source-map upload). Agent updates `.env.example` and the `docs/ENVIRONMENT.md` row.
- [ ] **Step 8: Verify end-to-end:** deploy preview, then trigger a deliberate error — add `?boom=1` handling nowhere; instead hit a nonexistent API id path that throws in a service, or run locally with `NODE_ENV=production npm run build && npm start` and throw from a test route you immediately revert. Expected: event appears in Sentry with readable (source-mapped) stack and `environment: preview`. Also confirm one transaction/trace appears for an API route.
- [ ] **Step 9: Confirm CSP still passes** (Sentry ingest origin was already in Task 2's `connect-src`): `npx playwright test tests/e2e/security-headers.spec.ts` → PASS; no CSP errors in console on a page that fires a Sentry event.
- [ ] **Step 10: Commit**

```bash
git add sentry.server.config.ts sentry.edge.config.ts src/instrumentation.ts src/instrumentation-client.ts next.config.ts .env.example docs/ENVIRONMENT.md package.json package-lock.json
git commit -m "feat: add Sentry errors and traces via @sentry/nextjs"
```

---

### Task 7: Uptime Check + Inngest Failure Alerts + Log Hygiene

**Files:**
- Create: `src/app/api/health/route.ts`
- Create: `tests/unit/health.test.ts`
- Create: `src/lib/jobs/inngest/on-failure.ts`
- Modify: `src/lib/jobs/inngest/index.ts` (register the failure handler — exact export list per that file's current state)
- Modify: `docs/setup/PROVISIONING.md` (append "Uptime monitoring")

**Interfaces:**
- Consumes: `createLogger(context)` from `src/lib/logger` (existing signature: `createLogger(context: string): Logger` with `info/warn/error(message, meta?)`); Inngest client from Phase 0-era `src/lib/jobs/inngest`; Resend email path from Phase 4's channel provider.
- Produces: `GET /api/health` → `200 {"status":"ok","db":"ok"}` consumed by the uptime monitor and by Task 12's smoke suite.

- [ ] **Step 1: Write the failing test** at `tests/unit/health.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) },
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns 200 with db ok", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npx vitest run tests/unit/health.test.ts`
Expected: FAIL — module `@/app/api/health/route` not found.

- [ ] **Step 3: Implement `src/app/api/health/route.ts`:**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded", db: "error" }, { status: 503 });
  }
}
```

(No auth: the endpoint reveals nothing tenant-specific. Confirm the Clerk middleware matcher in `src/middleware.ts` excludes `/api/health` — add it to the public routes list if not.)

- [ ] **Step 4: Run the test.**

Run: `npx vitest run tests/unit/health.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the Inngest global failure handler** at `src/lib/jobs/inngest/on-failure.ts`. Inngest emits `inngest/function.failed` after a function exhausts retries — one handler catches all job failures (reminders, dunning, imports, webhook processors):

```typescript
import { inngest } from "./client";
import { createLogger } from "@/lib/logger";
import { sendOpsAlertEmail } from "@/lib/email/ops-alert"; // thin Resend wrapper; create if Phase 4 didn't
import * as Sentry from "@sentry/nextjs";

const log = createLogger("inngest.on-failure");

export const onFunctionFailed = inngest.createFunction(
  { id: "alert-on-function-failure" },
  { event: "inngest/function.failed" },
  async ({ event }) => {
    const { function_id: functionId, run_id: runId } = event.data;
    const error = event.data.error?.message ?? "unknown";

    log.error("inngest function failed after retries", { functionId, runId, error });
    Sentry.captureMessage(`Inngest function failed: ${functionId}`, {
      level: "error",
      extra: { runId, error },
    });
    await sendOpsAlertEmail({
      subject: `[InvoicePilot] Job failed: ${functionId}`,
      body: `Run ${runId} failed after all retries.\nError: ${error}\nInngest dashboard: https://app.inngest.com`,
    });
  },
);
```

If `src/lib/email/ops-alert.ts` does not exist after Phase 4, create it as a 15-line wrapper: Resend client, `from` = the verified ops sender, `to` = `OPS_ALERT_EMAIL` env var (add to `docs/ENVIRONMENT.md` + `.env.example`, USER ACTION to set in Vercel). Register `onFunctionFailed` in the functions array exported to the Inngest serve handler in `src/lib/jobs/inngest/index.ts`.

- [ ] **Step 6: Verify the failure path:** on preview, trigger a job with a forced throw (Inngest dev server: send a test event to a scratch function that always throws with `retries: 0`), confirm the alert email arrives and the Sentry message appears. Remove the scratch function.
- [ ] **Step 7: USER ACTION — uptime monitor.** User creates a monitor (Better Stack, UptimeRobot, or Vercel's own checks — record choice) on `https://<domain>/api/health`, 1-minute interval, alert to the same ops email. Expected keyword: `"status":"ok"`. Record monitor URL in `PROVISIONING.md`.
- [ ] **Step 8: Log hygiene sweep:** grep the codebase for raw console logging that bypasses the structured logger in server code:

```bash
grep -rn "console\.\(log\|error\|warn\)" src/server src/lib --include="*.ts" | grep -v "src/lib/logger"
```

Replace each hit in services/repositories/jobs with `createLogger("<context>")` calls (client components may keep console). Vercel captures stdout as JSON lines → searchable in Vercel Logs / Log Drains.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/health/route.ts tests/unit/health.test.ts src/lib/jobs/inngest/ src/lib/email/ops-alert.ts docs/setup/PROVISIONING.md docs/ENVIRONMENT.md .env.example
git commit -m "feat: health endpoint, inngest failure alerts, structured log sweep"
```

---

### Task 8: Load Sanity — Volume Seed + EXPLAIN-Verified Indexes

**Files:**
- Create: `scripts/seed-volume.ts`
- Create: `scripts/explain-checks.ts`
- Modify: `package.json` (add `seed:volume`, `explain:check` scripts)
- Modify: `prisma/schema.prisma` + new migration **only if** an EXPLAIN check fails (indexes listed in Step 4)

**Interfaces:**
- Consumes: Prisma schema (Phase 1 models); analytics SQL shapes from Phase 5's `analytics.service` (aging buckets, headline tiles).
- Produces: evidence (recorded in `docs/setup/PROVISIONING.md`) that dashboard + invoice list stay fast at 10k invoices / 1k parties.

- [ ] **Step 1: Write `scripts/seed-volume.ts`** — batch-insert volume data into a dedicated throwaway org on the *staging* DB (same `SEED_ALLOW` guard as Task 5):

```typescript
/**
 * Volume seed: 1 throwaway org, 1,000 parties, 10,000 invoices.
 * Staging DB only. Uses createMany in batches of 1,000 for speed.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const VOLUME_SLUG = "volume-test-org";
const PARTIES = 1_000;
const INVOICES = 10_000;

async function main() {
  if (process.env.SEED_ALLOW !== "staging") {
    throw new Error("Refusing to run: set SEED_ALLOW=staging explicitly.");
  }
  // Re-runnable: wipe and recreate the volume org only.
  const old = await prisma.organization.findFirst({ where: { slug: VOLUME_SLUG } });
  if (old) {
    await prisma.invoice.deleteMany({ where: { organizationId: old.id } });
    await prisma.party.deleteMany({ where: { organizationId: old.id } });
    await prisma.organization.delete({ where: { id: old.id } });
  }
  const org = await prisma.organization.create({
    data: { name: "Volume Test Org", slug: VOLUME_SLUG },
  });

  const partyRows = Array.from({ length: PARTIES }, (_, i) => ({
    organizationId: org.id,
    type: "CUSTOMER" as const,
    name: `Volume Party ${String(i).padStart(4, "0")}`,
    email: `vp${i}@example.com`,
    creditDays: 30,
  }));
  for (let i = 0; i < partyRows.length; i += 1000) {
    await prisma.party.createMany({ data: partyRows.slice(i, i + 1000) });
  }
  const partyIds = (
    await prisma.party.findMany({ where: { organizationId: org.id }, select: { id: true } })
  ).map((p) => p.id);

  const now = Date.now();
  const invoiceRows = Array.from({ length: INVOICES }, (_, i) => {
    const dueOffsetDays = (i % 240) - 60; // due dates spread -60..+180 days
    const status = i % 3 === 0 ? "PAID" : dueOffsetDays < 0 ? "OVERDUE" : "PENDING";
    const total = 1000 + (i % 5000);
    return {
      organizationId: org.id,
      partyId: partyIds[i % PARTIES],
      invoiceNumber: `VOL-${String(i).padStart(5, "0")}`,
      type: "RECEIVABLE" as const,
      status,
      issueDate: new Date(now - (dueOffsetDays + 30) * 86_400_000),
      dueDate: new Date(now - dueOffsetDays * 86_400_000),
      subtotal: new Prisma.Decimal(total),
      taxAmount: new Prisma.Decimal(total * 0.18),
      totalAmount: new Prisma.Decimal(total * 1.18),
      currency: "INR",
    };
  });
  for (let i = 0; i < invoiceRows.length; i += 1000) {
    await prisma.invoice.createMany({ data: invoiceRows.slice(i, i + 1000) });
    console.log(`invoices: ${Math.min(i + 1000, INVOICES)}/${INVOICES}`);
  }
  console.log(`Done. org=${org.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

(As in Task 5: enum literals/field names reconciled against the real schema at implementation time.)

- [ ] **Step 2: Write `scripts/explain-checks.ts`** — runs `EXPLAIN (ANALYZE, FORMAT JSON)` on the exact query shapes the app issues, and fails (exit 1) if a sequential scan on `invoices` sneaks in or a check exceeds its time budget:

```typescript
/**
 * EXPLAIN checks for the hot paths at 10k invoices / 1k parties.
 * Run AFTER seed-volume.ts on the staging DB.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Check = { name: string; sql: string; maxMs: number };

// $1 substituted below with the volume org id.
const CHECKS: Check[] = [
  {
    // Invoice list page: org-scoped, status-filtered, due-date sorted, paginated
    name: "invoice-list",
    sql: `SELECT * FROM invoices
          WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'OVERDUE'
          ORDER BY due_date ASC LIMIT 50 OFFSET 0`,
    maxMs: 50,
  },
  {
    // Dashboard headline tiles (Phase 5 analytics.service shape)
    name: "dashboard-tiles",
    sql: `SELECT status, count(*), sum(total_amount)
          FROM invoices
          WHERE organization_id = $1 AND deleted_at IS NULL
          GROUP BY status`,
    maxMs: 100,
  },
  {
    // Aging buckets
    name: "aging-buckets",
    sql: `SELECT width_bucket(EXTRACT(day FROM now() - due_date), 0, 90, 3) AS bucket,
                 count(*), sum(total_amount)
          FROM invoices
          WHERE organization_id = $1 AND deleted_at IS NULL AND status != 'PAID'
          GROUP BY bucket`,
    maxMs: 100,
  },
  {
    // Party ledger drill-down
    name: "party-invoices",
    sql: `SELECT * FROM invoices
          WHERE organization_id = $1 AND party_id = (
            SELECT id FROM parties WHERE organization_id = $1 LIMIT 1)
          ORDER BY issue_date DESC LIMIT 50`,
    maxMs: 50,
  },
];

function hasSeqScanOnInvoices(node: Record<string, unknown>): boolean {
  if (node["Node Type"] === "Seq Scan" && node["Relation Name"] === "invoices") return true;
  const children = (node["Plans"] as Record<string, unknown>[]) ?? [];
  return children.some(hasSeqScanOnInvoices);
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: "volume-test-org" },
  });
  let failed = false;
  for (const check of CHECKS) {
    const sql = check.sql.replaceAll("$1", `'${org.id}'`);
    const rows = await prisma.$queryRawUnsafe<{ "QUERY PLAN": unknown }[]>(
      `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`,
    );
    const plan = (rows[0]["QUERY PLAN"] as Record<string, unknown>[])[0];
    const root = plan["Plan"] as Record<string, unknown>;
    const ms = plan["Execution Time"] as number;
    const seq = hasSeqScanOnInvoices(root);
    const ok = !seq && ms <= check.maxMs;
    console.log(`${ok ? "PASS" : "FAIL"} ${check.name}: ${ms.toFixed(1)}ms, seqScanOnInvoices=${seq}`);
    if (!ok) failed = true;
  }
  if (failed) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Add npm scripts** to `package.json`:

```json
"seed:volume": "tsx scripts/seed-volume.ts",
"explain:check": "tsx scripts/explain-checks.ts"
```

- [ ] **Step 4: Run against staging and fix failures with indexes.**

Run: `SEED_ALLOW=staging DATABASE_URL=<staging-url> DIRECT_URL=<staging-url> npm run seed:volume && DATABASE_URL=<staging-url> DIRECT_URL=<staging-url> npm run explain:check`
Expected: 4× PASS. If any FAIL, add the missing composite index to `prisma/schema.prisma` — the expected set (add only what EXPLAIN proves missing):

```prisma
// on Invoice
@@index([organizationId, status, dueDate])
@@index([organizationId, partyId, issueDate])
@@index([organizationId, deletedAt])
```

Then `npx prisma migrate dev --name add_load_indexes`, re-run `npm run explain:check` → all PASS.

- [ ] **Step 5: Browser-level sanity:** against staging with the volume org, load `/dashboard` and `/invoices` while signed into the volume org; both render in under 3s (network tab, uncached). Record timings + EXPLAIN output summary in `docs/setup/PROVISIONING.md` ("Load sanity" section).
- [ ] **Step 6: Commit**

```bash
git add scripts/seed-volume.ts scripts/explain-checks.ts package.json prisma/ docs/setup/PROVISIONING.md
git commit -m "feat: volume seed and EXPLAIN index checks for 10k/1k load sanity"
```

---

### Task 9: Documentation — RUNBOOK, TALLY final, README, Onboarding

**Files:**
- Create: `docs/RUNBOOK.md`
- Create: `docs/ONBOARDING.md`
- Modify: `docs/TALLY.md` (finalize from Phase 0/2 drafts)
- Modify: `README.md`

**Interfaces:**
- Consumes: everything provisioned in Tasks 1–8; Phase 2's import wizard; Phase 4's channels.
- Produces: the operator + user documentation the launch checklist (Task 11) requires signed off.

- [ ] **Step 1: Write `docs/RUNBOOK.md`** with exactly these sections (each with real values/links from `PROVISIONING.md`, no placeholders left in the committed file):
  1. **Service map** — prod URL, Vercel project link, Supabase project link, Sentry project link, Inngest app link, Upstash console link, Clerk dashboard link, uptime monitor link, who owns each (name/email).
  2. **Deploy & rollback** — deploys happen on merge to `main` (Vercel auto + CI `migrate` job); rollback = Vercel dashboard → Deployments → Promote previous; caveat: rollback does *not* revert migrations, hence rule 3.
  3. **Migrations** — expand/contract policy (every migration must run safely against the previous app version because CI `migrate` and the Vercel build are not strictly ordered); how to check migration status (`npx prisma migrate status` with `PROD_DIRECT_URL`); how to resolve drift (`prisma migrate resolve`).
  4. **Backups & restore** — schedule/retention/PITR settings, the exact restore-drill procedure from Task 5 Step 2, last drill date, and the rule: re-drill quarterly.
  5. **Monitoring & alerts** — where each alert comes from (Sentry issues, uptime monitor, Inngest failure emails), what each means, first-response steps for each.
  6. **Common incidents** — one subsection each with diagnosis + fix:
     - Email bounce spike (Resend dashboard → check DNS/DKIM, suppress list, pause affected sequence)
     - WhatsApp webhook failures / template quality drop (Meta Business Manager quality rating, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` mismatch symptoms)
     - Assistant misbehaving or cost spike → **flip `ASSISTANT_KILL_SWITCH=true` in Vercel env + redeploy**; check per-org budgets in Upstash
     - DB connection exhaustion (pooler vs direct URL, Vercel function concurrency)
     - Stuck reminders (Inngest dashboard → replay run; `CommunicationLog` rows stuck in `QUEUED`)
  7. **Secrets rotation** — per provider: where to mint a new key, which Vercel envs and GitHub secrets to update (`PROD_DIRECT_URL`!), and the redeploy step.
  8. **Escalation & contacts** — owner, provider support links, status pages (Vercel, Supabase, Meta, Resend, Anthropic).
- [ ] **Step 2: Finalize `docs/TALLY.md`.** Phase 0 Task 9 wrote the export runbook; Phase 2 item 6 extended it. Final pass: verify every menu path against the user's actual Tally Prime version (USER ACTION: user confirms on their machine), add a troubleshooting table (common import warnings from `ImportBatch` UI → meaning → fix), and the "optional LAN HTTP-XML auto-sync" section clearly marked *future enhancement, not built*.
- [ ] **Step 3: Update `README.md`:** project description (receivables/payables + inventory platform, not just reminders), tech stack with version floors, local setup (`npm ci`, `.env` from `.env.example`, `npm run db:migrate`, `npm run dev`), test commands (`npm run test`, `npx playwright test`, smoke: see Task 10), links to `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`, `docs/TALLY.md`, `docs/ENVIRONMENT.md`.
- [ ] **Step 4: Write `docs/ONBOARDING.md`** — the user walkthrough, in order: sign up / sign in → create organization → Settings (email sender, WhatsApp opt-in, reminder defaults, quiet hours) → run first Tally import (link to `docs/TALLY.md`, expect the wizard's preview step) → review imported parties (fill missing emails/phones the wizard flagged) → send a first reminder (both channels) from an invoice detail page → read the dashboard tiles → meet the assistant (what it can do, that every write needs your approval, how to reject). One screenshot placeholder per step is acceptable *only* as an `<!-- screenshot: ... -->` comment; the text must stand alone.
- [ ] **Step 5: USER ACTION —** user reads `ONBOARDING.md` end-to-end and confirms each step matches the real UI; fix mismatches inline.
- [ ] **Step 6: Commit**

```bash
git add docs/RUNBOOK.md docs/ONBOARDING.md docs/TALLY.md README.md
git commit -m "docs: runbook, onboarding walkthrough, final Tally guide, README refresh"
```

---

### Task 10: Production Smoke Suite (`@smoke`)

**Files:**
- Modify: `playwright.config.ts` (baseURL from env)
- Modify: existing Playwright specs under `tests/e2e/` (add `@smoke` tags)
- Modify: `package.json` (add `test:smoke` script)
- Modify: `.github/workflows/ci.yml` (optional manual-dispatch smoke job)

**Interfaces:**
- Consumes: Playwright suite from Phase 3 (one spec per screen) + Task 2's headers spec (already tagged `@smoke`); `$PROD_URL` from Task 3; `/api/health` from Task 7.
- Produces: `npm run test:smoke` — the exact command Task 12's phase gate runs post-deploy.

- [ ] **Step 1: Tag convention.** The smoke suite is the *tagged subset* of existing Playwright tests — no separate suite is written. Add ` @smoke` to the title of exactly one happy-path test per critical surface (grep-visible in titles, per Playwright's `--grep` convention):
  - auth: sign-in page renders (`tests/e2e/auth.spec.ts`)
  - dashboard: tiles render with numbers (`tests/e2e/dashboard.spec.ts`)
  - invoices: list renders + detail opens (`tests/e2e/invoices.spec.ts`)
  - imports: wizard step 1 renders (`tests/e2e/imports.spec.ts`)
  - reminders: schedule editor renders (`tests/e2e/reminders.spec.ts`)
  - assistant: drawer opens (`tests/e2e/assistant.spec.ts`)
  - health: `GET /api/health` returns 200 (add to `tests/e2e/security-headers.spec.ts` or a tiny `tests/e2e/health.spec.ts`)
  - security headers (Task 2, already tagged)

Example tag edit (pattern for each file above):

```typescript
test("dashboard shows headline tiles @smoke", async ({ page }) => {
  // ...existing body unchanged...
});
```

Rules: `@smoke` tests must be **read-only against production** — no test that creates/mutates data gets the tag; they must pass against a signed-in state using a dedicated smoke-test user in a dedicated smoke org (USER ACTION: create `smoke@<domain>` Clerk user + "Smoke Test Org" in prod; store credentials as `SMOKE_USER_EMAIL`/`SMOKE_USER_PASSWORD` in GitHub secrets and local `.env`, names recorded in `docs/ENVIRONMENT.md`).

- [ ] **Step 2: Make `baseURL` env-driven** in `playwright.config.ts`:

```typescript
use: {
  baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
  // ...existing use options unchanged...
},
```

- [ ] **Step 3: Add the command** to `package.json` `scripts`:

```json
"test:smoke": "playwright test --grep @smoke"
```

Run against production:

```bash
PLAYWRIGHT_BASE_URL=https://<domain> npm run test:smoke
```

- [ ] **Step 4: Run locally first.**

Run: `npm run test:smoke` (dev server)
Expected: all tagged tests PASS; count matches the surfaces listed in Step 1 (8 minimum).

- [ ] **Step 5: Add a manually-triggered smoke job** to `.github/workflows/ci.yml` (append after the `migrate` job):

```yaml
  smoke:
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:smoke
        env:
          PLAYWRIGHT_BASE_URL: ${{ vars.PROD_URL }}
          SMOKE_USER_EMAIL: ${{ secrets.SMOKE_USER_EMAIL }}
          SMOKE_USER_PASSWORD: ${{ secrets.SMOKE_USER_PASSWORD }}
```

and extend the workflow trigger block:

```yaml
on:
  push: { branches: [main] }
  pull_request:
  workflow_dispatch:
```

USER ACTION: add `PROD_URL` repo variable + the two smoke secrets in GitHub settings.

- [ ] **Step 6: Run against the deployed production URL:** `PLAYWRIGHT_BASE_URL=https://<domain> npm run test:smoke` → all PASS. Record the run in `docs/setup/PROVISIONING.md`.
- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e/ package.json .github/workflows/ci.yml docs/ENVIRONMENT.md docs/setup/PROVISIONING.md
git commit -m "test: tag @smoke subset and wire production smoke command"
```

---

### Task 11: Launch Checklist + 1-Week Hypercare Plan

**Files:**
- Create: `docs/LAUNCH.md`

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: the checklist Task 12's gate walks, plus the daily hypercare log the user/agent fills for 7 days.

- [ ] **Step 1: Write `docs/LAUNCH.md`** with two parts.

**Part A — Launch checklist** (each item: owner + evidence link, ticked at gate time):

```markdown
- [ ] Env audit complete (Task 1, PROVISIONING.md §Phase 7 env audit)
- [ ] Security headers live on prod (curl output attached)
- [ ] Custom domain + HTTPS + Clerk live keys verified (Task 3)
- [ ] CI migrate job green on latest main (Actions run link)
- [ ] Backup schedule on + restore drill dated within 30 days (Task 5)
- [ ] Sentry receiving prod events with source maps (event link)
- [ ] Uptime monitor green for 48h pre-launch (monitor link)
- [ ] Inngest failure alert test fired and received (Task 7 Step 6)
- [ ] EXPLAIN checks pass at 10k/1k (Task 8 output in PROVISIONING.md)
- [ ] RUNBOOK / TALLY / README / ONBOARDING reviewed by user (Task 9)
- [ ] Smoke suite green against production URL (Task 10 Step 6)
- [ ] ASSISTANT_KILL_SWITCH=false confirmed, flip procedure known to user
- [ ] WhatsApp templates status APPROVED in Meta Business Manager
- [ ] USER SIGN-OFF: name + date
```

**Part B — Hypercare: 7 daily checks** (a table with one row per day, columns = the checks below, filled in each morning; agent can run the SQL/CLI ones, user checks the dashboards):

1. **Email deliverability** — Resend dashboard: delivered rate ≥ 95%, bounce rate < 2%, zero spam complaints; any bounced address gets its party flagged in-app.
2. **WhatsApp health** — Meta Business Manager: template quality rating still Green, messaging limits not reduced; delivered/read rates on yesterday's sends.
3. **Webhook health** — zero Sentry errors on `/api/webhooks/resend` and `/api/webhooks/whatsapp`; and no stuck deliveries:

```sql
SELECT channel, count(*) FROM communication_logs
WHERE status = 'QUEUED' AND created_at < now() - interval '1 hour'
GROUP BY channel;  -- expected: 0 rows
```

4. **Job health** — Inngest dashboard: zero failed runs in last 24h (any failure already emailed by Task 7; confirm each was handled).
5. **Assistant cost & safety** — Anthropic console spend for the day vs expectation; per-org token budget consumption in Upstash; and zero unapproved writes:

```sql
SELECT count(*) FROM assistant_actions
WHERE status = 'EXECUTED' AND approved_by IS NULL;  -- expected: 0, always
```

6. **Errors & uptime** — Sentry: triage all new issue groups (assign or resolve, none left untriaged); uptime monitor: no downtime events.
7. **Data sanity** — receivables total on the dashboard matches `SELECT sum(total_amount - amount_paid) FROM invoices WHERE status != 'PAID' AND deleted_at IS NULL AND organization_id = '<user org>'`; report any drift immediately.

Exit criteria for hypercare (end of day 7): all seven checks green for 3 consecutive days; otherwise extend day-by-day until they are.

- [ ] **Step 2: USER ACTION —** user reviews Part A owners and confirms availability for the 7 daily check-ins (or delegates dashboard checks to the agent where API access exists).
- [ ] **Step 3: Commit**

```bash
git add docs/LAUNCH.md
git commit -m "docs: launch checklist and 1-week hypercare plan"
```

---

### Task 12: Phase Gate — **USER ACTION (final sign-off)**

**Files:**
- Modify: `docs/LAUNCH.md` (tick Part A with evidence)
- Modify: `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (mark Phase 7 gate met)
- Create: `docs/setup/PHASE-7-GATE.md`

The parent plan's gate, verbatim: *"production smoke suite green post-deploy; user completes a real Tally import + sends a real reminder on both channels."*

- [ ] **Step 1: Deploy and smoke.** Merge everything to `main`, let CI (`checks` → `test` → `migrate`) and the Vercel deploy finish, then:

```bash
PLAYWRIGHT_BASE_URL=https://<domain> npm run test:smoke
```

Expected: all `@smoke` tests PASS against production. Attach the run output to `PHASE-7-GATE.md`.

- [ ] **Step 2: USER ACTION — real Tally import on production.** User follows `docs/TALLY.md` + `docs/ONBOARDING.md` on their real account: exports from their Tally Prime, imports via the wizard. Success = `ImportBatch` completes with 0 unexplained errors and receivables total matches Tally's outstanding report (the Phase 2 gate criterion, now on prod data).
- [ ] **Step 3: USER ACTION — real reminder on both channels.** User picks a real (or self-addressed test) invoice and sends a reminder now via email *and* WhatsApp. Success = both messages arrive, and both show `DELIVERED` (WhatsApp: `READ` acceptable) on the invoice timeline within 10 minutes — proving send path *and* webhook path end-to-end.
- [ ] **Step 4: Walk `docs/LAUNCH.md` Part A** — every box ticked with evidence, user signs (name + date).
- [ ] **Step 5: Write `docs/setup/PHASE-7-GATE.md`:** status table of Tasks 1–11, smoke output, import + reminder evidence (message IDs, timeline screenshots noted by path), hypercare start date, go decision.
- [ ] **Step 6: Commit and begin hypercare** (Task 11 Part B, day 1 starts the morning after launch).

```bash
git add docs/LAUNCH.md docs/setup/PHASE-7-GATE.md docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md
git commit -m "docs: phase 7 gate — production launched"
```

---

## Self-Review Notes

- **Spec coverage** (parent plan Phase 7 items → tasks): (1) env audit→Task 1, custom domain + Clerk prod→Task 3, headers/CSP→Task 2; (2) migrate-in-CI→Task 4, backups + restore drill + staging seed→Task 5; (3) Sentry→Task 6, structured logs + uptime + Inngest alerts→Task 7; (4) load sanity 10k/1k + EXPLAIN→Task 8; (5) RUNBOOK/TALLY/README/onboarding→Task 9; (6) launch checklist + hypercare→Task 11; gate→Task 12; smoke suite (gate prerequisite)→Task 10.
- **Placeholder scan:** the two `<sentry-org-slug>`/`<sentry-project-slug>` and `<domain>` markers are deliberate — they are values recorded in `docs/setup/PROVISIONING.md` during Phase 0/Task 3 that the implementer copies in; each is annotated with exactly where to find the value. Seed scripts carry an explicit reconcile-against-schema instruction because Phase 1's final field names land before this phase runs.
- **Type/name consistency:** `SEED_ALLOW=staging` guard shared by Tasks 5 and 8; `createLogger(context)` matches `src/lib/logger/index.ts` as it exists today; `@smoke` grep convention consistent across Tasks 2, 10, 12; `PROD_DIRECT_URL` secret named identically in Tasks 4 and 9(RUNBOOK §7); `/api/health` produced in Task 7 and consumed in Tasks 10–11; `communication_logs`/`assistant_actions` table names follow the snake_case `@@map` convention used throughout the schema.
- **Ordering:** Task 3 (DNS, up to 24h) and Task 5 Step 1 (backup provider) should start early; Tasks 2, 4, 6, 7, 8 are agent-parallelizable after Task 1; Task 2 before Task 6 (both edit `next.config.ts`); Tasks 9–11 after all infra tasks; Task 12 last.
- **Deviation from bite-size TDD:** Tasks 1, 3, 5, 9, 11, 12 are provisioning/docs tasks with no unit-testable code — their "tests" are the explicit verification commands with expected output (per the Phase 0 precedent). Code-bearing tasks (2, 6, 7, 8, 10) carry test-first steps where a test is meaningful; Sentry (6) and the seed/EXPLAIN scripts (8) are verified by observable behavior (event in Sentry, PASS/FAIL script output) because unit-mocking them would test the mock.
