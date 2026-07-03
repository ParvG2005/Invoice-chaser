# Phase 3: Stitch Frontend Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent plan:** `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (read its Phase 3 section and Global Constraints before starting).
>
> **Design-first hard rule:** every screen batch has a **USER ACTION design-review gate**. No implementation code for a batch may be written until the user has approved that batch's Stitch designs. Batches are independent — while waiting on a review, the next batch's *design* tasks may proceed.

**Goal:** Redesign every screen in Stitch, then rebuild the frontend as shadcn/Tailwind pages so that every user-facing action in the product is available as an explicit button/flow, with a Playwright smoke test per screen, responsive and dark-mode verified.

**Architecture:** Pages live under `src/app/dashboard/*` (App Router, client pages calling `/api/*` via TanStack Query), feature components under `src/modules/<domain>/components/`, shared primitives under `src/components/ui/` (shadcn) and `src/components/shared/`. Every new API route follows the existing layering: `app/api` route → `lib/api/handler` (`withApiHandler`) → `src/server/services/*` → repositories → Prisma. Stitch is the source of visual truth: screens are generated/iterated in the Stitch project created in Phase 0, and only approved designs get implemented.

**Tech Stack:** Next.js ≥16.2, React ≥19.2, TypeScript ≥6, Tailwind ≥4.3, shadcn (new-york style, zinc base, lucide icons — see `components.json`), TanStack Query + TanStack Table, Zustand, sonner, Playwright, Stitch MCP.

## Global Constraints

(Copied from the parent plan — every task implicitly includes these.)

- Version floors: Node >= 26 (LTS), Next.js >= 16.2, React >= 19.2, TypeScript >= 6.0, Prisma >= 7.8, Tailwind >= 4.3. Pin Node via `.nvmrc`/`engines`; keep dependencies on latest stable at each phase start.
- Multi-tenant: every new table carries `organization_id`; every query is org-scoped at the repository layer. No cross-org data access, ever.
- All money columns `Decimal(12,2)`; all quantities `Decimal(12,3)`; currency INR-first but stored with a `currency` code.
- Soft deletes (`deleted_at`) on all business entities.
- Existing layered convention preserved: `app/api` route → `lib/api/handler` → `server/services` → `server/repositories` → Prisma.
- Secrets only in env vars / provider credential stores; never in code, prompts, or logs.
- TDD for all service/parser/tool code; Playwright smoke tests for each new page (this phase: spec written and failing *before* the page is built).
- Phase-3 specific: no visual implementation before the batch's Stitch designs are user-approved.
- Note: the parent plan's `graphify update .` constraint is dropped — `graphify-out/` was removed from the repo on 2026-07-03 (see Phase 0 plan self-review notes).

## Cross-Phase Interface Contract

Phases 1/2 are being planned/built in parallel. This plan **consumes these exact names** — do not invent alternatives:

- **Models (Prisma):** `Party`, `Item`, `StockMovement`, `InvoiceLineItem`, `Bill`, `Payment`, `PaymentAllocation`, `CommunicationLog`. `Invoice` gains `partyId`, `type` (`RECEIVABLE`/`PAYABLE`), `subtotal`/`taxAmount`/`totalAmount`, `amountPaid`, `currency`, and status values `PENDING | OVERDUE | PAID | PARTIALLY_PAID | WRITTEN_OFF`.
- **Services (Phase 1 deliverables):** `src/server/services/party.service.ts`, `item.service.ts`, `stock.service.ts`, `payment.service.ts`, `bill.service.ts` — every public method takes `organizationId: string` as its **first** parameter (same convention as the existing `invoice.service.ts`).
- **Phase 2 deliverables consumed by the Imports wizard:** `POST /api/import/tally` (upload + parse), `ImportBatch`/`ImportRecord` models, batch status/undo endpoints.
- Where this plan adds an API route whose service method is a Phase 1/2 deliverable, the expected method signature is stated in the task's **Interfaces** block. If the method does not exist yet when the task runs, the task is **blocked** — do not stub services; reorder to an unblocked task instead.

**Dependency map (from parent plan sequencing):**

| Batch | Screens | Blocked on |
|---|---|---|
| A | App shell, Dashboard | Phase 1 complete (upgrade + models exist; dashboard uses existing stats API) |
| B | Invoices list / detail / create-edit | Phase 1 (`Party`, `InvoiceLineItem`, `Item`, `Payment`) |
| C | Parties & Agents, Payments, Bills | Phase 1 (`party/payment/bill` services) |
| D | Stock, Imports wizard | Phase 1 (`Item`, `StockMovement`); Imports also Phase 2 |
| E | Reminders, Settings | Phase 1 only (WhatsApp *sending* is Phase 4 — channel toggle ships disabled behind readiness flag) |

Phase 3 may run in parallel with Phase 4 once Phase 1 is done. The Analytics screen and Assistant drawer from the screen inventory are **out of scope here** (Phase 5 and Phase 6 respectively) — the app shell reserves nav slots for them.

---

### Task 1: Playwright Infrastructure + Auth Fixture

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `playwright.config.ts`
- Create: `e2e/global.setup.ts`
- Create: `e2e/auth.setup.ts`
- Create: `e2e/helpers/nav.ts`
- Create: `e2e/.gitignore`
- Modify: `.github/workflows/ci.yml` (add `e2e` job)
- Modify: `docs/ENVIRONMENT.md` (add `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD` rows)

**Interfaces:**
- Produces: `npm run test:e2e`; storage-state auth reused by every spec in Tasks 6–26; Playwright projects `chromium`, `chromium-dark`, `mobile` that every spec runs under.
- Consumes: Clerk dev-instance test user (USER ACTION below).

- [ ] **Step 1: Install dependencies**

```bash
npm install -D @playwright/test @clerk/testing
npx playwright install chromium
```

- [ ] **Step 2: Add scripts to `package.json`:**

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 3: Write `playwright.config.ts`:**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "global setup", testMatch: /global\.setup\.ts/ },
    {
      name: "auth setup",
      testMatch: /auth\.setup\.ts/,
      dependencies: ["global setup"],
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["auth setup"],
    },
    {
      name: "chromium-dark",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "dark",
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["auth setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: "e2e/.auth/user.json" },
      dependencies: ["auth setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 4: Write `e2e/global.setup.ts`** (obtains a Clerk testing token so bot detection doesn't block sign-in):

```ts
import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

setup("global setup", async () => {
  await clerkSetup();
});
```

- [ ] **Step 5: Write `e2e/auth.setup.ts`** (signs in once, saves storage state):

```ts
import { clerk } from "@clerk/testing/playwright";
import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_USER_EMAIL!,
      password: process.env.E2E_CLERK_USER_PASSWORD!,
    },
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  await page.context().storageState({ path: authFile });
});
```

- [ ] **Step 6: Write `e2e/helpers/nav.ts`** (one shared helper, used by every screen spec):

```ts
import { Page, expect } from "@playwright/test";

/** Navigate via the sidebar link and wait for the page heading. */
export async function gotoScreen(page: Page, linkName: string, heading: RegExp) {
  await page.goto("/dashboard");
  await page.getByRole("navigation").getByRole("link", { name: linkName }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}
```

- [ ] **Step 7: Write `e2e/.gitignore`** containing exactly:

```
.auth/
```

- [ ] **Step 8: USER ACTION —** create a dedicated test user in the Clerk dev instance (email+password auth enabled), put `E2E_CLERK_USER_EMAIL` / `E2E_CLERK_USER_PASSWORD` in local `.env` and in GitHub Actions secrets. Record both variable names in `docs/ENVIRONMENT.md`.

- [ ] **Step 9: Verify the fixture works.** Run: `npx playwright test e2e/auth.setup.ts --project="auth setup"`
Expected: PASS, and `e2e/.auth/user.json` exists.

- [ ] **Step 10: Add an `e2e` job to `.github/workflows/ci.yml`** (after the existing `checks` job):

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: checks
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
        env:
          DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
          DIRECT_URL: ${{ secrets.E2E_DATABASE_URL }}
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CI_CLERK_PUBLISHABLE_KEY }}
          CLERK_SECRET_KEY: ${{ secrets.CI_CLERK_SECRET_KEY }}
          E2E_CLERK_USER_EMAIL: ${{ secrets.E2E_CLERK_USER_EMAIL }}
          E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}
```

(`E2E_DATABASE_URL` points at a disposable preview/branch database seeded by CI — USER ACTION to add the secret.)

- [ ] **Step 11: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json .github/workflows/ci.yml docs/ENVIRONMENT.md
git commit -m "test: add Playwright infra with Clerk auth fixture and dark/mobile projects"
```

---

### Task 2: E2E Seed Data

Smoke tests need deterministic data (an invoice to mark paid, a party with a ledger, an item with stock). A seed script gives every spec a known world.

**Files:**
- Create: `prisma/seed-e2e.ts`
- Modify: `package.json` (script `db:seed:e2e`)

**Interfaces:**
- Consumes: Phase 1 models (`Party`, `Item`, `InvoiceLineItem`, `Payment`, `PaymentAllocation`, `Bill`, `StockMovement`) and the e2e test user's organization.
- Produces: fixed seed constants exported for specs: `E2E_SEED = { partyName: "Acme Traders", agentName: "Ravi Kumar", supplierName: "Bharat Suppliers", itemName: "Steel Rod 12mm", invoiceNumbers: ["E2E-INV-001", "E2E-INV-002", "E2E-INV-003"], billNumber: "E2E-BILL-001" }`.

- [ ] **Step 1: Write `prisma/seed-e2e.ts`.** Idempotent (upsert by unique business keys, keyed to the org owned by `E2E_CLERK_USER_EMAIL`'s user). Creates: 1 agent `Party` ("Ravi Kumar", type `AGENT`), 1 customer `Party` ("Acme Traders", type `CUSTOMER`, `agentId` → Ravi, email + phone set), 1 supplier `Party` ("Bharat Suppliers", type `SUPPLIER`), 1 `Item` ("Steel Rod 12mm", unit `NOS`, reorderLevel 10, opening stock 50 via a `StockMovement` of sourceType `OPENING`), 3 `Invoice`s for Acme (`E2E-INV-001` PENDING due +14d ₹10,000 with one `InvoiceLineItem` of the item; `E2E-INV-002` OVERDUE due −30d ₹18,500; `E2E-INV-003` PAID with a `Payment` IN ₹5,000 fully allocated via `PaymentAllocation`), 1 `Bill` (`E2E-BILL-001` from Bharat Suppliers, PENDING, ₹7,250). Export the `E2E_SEED` constant from the same file (specs import it with a relative path).
- [ ] **Step 2: Add script** `"db:seed:e2e": "tsx prisma/seed-e2e.ts"` (add `tsx` to devDependencies if Phase 1 hasn't already).
- [ ] **Step 3: Run it twice:** `npm run db:seed:e2e && npm run db:seed:e2e` — second run must not error or duplicate (verify counts in `prisma studio` or a quick `psql` count).
- [ ] **Step 4: Wire into CI:** in the `e2e` job add `- run: npm run db:seed:e2e` before the Playwright step.
- [ ] **Step 5: Commit**

```bash
git add prisma/seed-e2e.ts package.json package-lock.json .github/workflows/ci.yml
git commit -m "test: add idempotent e2e seed data"
```

---

### Task 3: Design System Finalization (Stitch + tokens)

**Files:**
- Modify: `src/app/globals.css` (complete the shadcn variable set)
- Modify: `docs/design/DESIGN_SYSTEM.md` (final tokens + component inventory + approval record)

**Interfaces:**
- Consumes: Stitch project ID + design-system ID recorded in `docs/design/DESIGN_SYSTEM.md` by Phase 0 Task 8; the `stitch-first-design` skill (read it before any Stitch MCP call).
- Produces: the finalized design system every Batch task generates screens against; complete CSS variable set (`--secondary`, `--destructive`, `--accent`, `--popover`, chart colors) that all new components may use.

- [ ] **Step 1: Read the `stitch-first-design` skill**, then load the Phase 0 design system with `mcp__stitch__get_project` (project ID from `docs/design/DESIGN_SYSTEM.md`).
- [ ] **Step 2: Finalize the design system in Stitch** via `mcp__stitch__update_design_system`: confirm light+dark palettes (base zinc per `components.json`, emerald accent matching the existing sidebar brand mark), Geist type scale, radius `0.75rem`, and component states (buttons, inputs, table rows, status chips for `PENDING/OVERDUE/PAID/PARTIALLY_PAID/WRITTEN_OFF`, toasts, empty states). Add anything the Phase 0 pilot review feedback requested.
- [ ] **Step 3: Extend `src/app/globals.css`** — the current file defines only a partial shadcn set. Add to `:root`:

```css
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --success: 152 69% 31%;
  --warning: 38 92% 50%;
```

to `.dark`:

```css
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;
  --popover: 240 10% 3.9%;
  --popover-foreground: 0 0% 98%;
  --success: 152 60% 45%;
  --warning: 38 92% 60%;
```

and to `@theme inline` the matching `--color-*` mappings:

```css
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-success: hsl(var(--success));
  --color-warning: hsl(var(--warning));
```

(If the design-system review in Step 2 lands different hues, transcribe the approved values instead — the *set of variables* is what's fixed.)

- [ ] **Step 4: Update `docs/design/DESIGN_SYSTEM.md`** with the final token table (light+dark), the design-system ID, and the status-chip color mapping (PENDING=warning, OVERDUE=destructive, PAID=success, PARTIALLY_PAID=accent/blue, WRITTEN_OFF=muted).
- [ ] **Step 5: Verify:** `npm run build` passes; toggle dark mode in the running app and confirm no unstyled regressions on existing pages.
- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css docs/design/DESIGN_SYSTEM.md
git commit -m "design: finalize design system tokens (Stitch + globals.css)"
```

---

### Task 4: Shared UI Primitives

Everything the screens reuse, built once. No screen task may re-implement these.

**Files:**
- Create (via shadcn CLI): `src/components/ui/table.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `checkbox.tsx`, `popover.tsx`, `command.tsx`, `calendar.tsx`, `sheet.tsx`, `tooltip.tsx`, `separator.tsx`, `alert-dialog.tsx`, `tabs.tsx`
- Create: `src/components/shared/status-chip.tsx`
- Create: `src/components/shared/money.tsx`
- Create: `src/components/shared/page-header.tsx`
- Create: `src/components/shared/empty-state.tsx`
- Create: `src/components/shared/confirm-dialog.tsx`
- Create: `src/components/shared/data-table.tsx`
- Test: `e2e/` none (primitives are covered through screen specs); type-level check via `npm run typecheck`

**Interfaces:**
- Produces (exact exports consumed by Tasks 7–26):
  - `StatusChip({ status }: { status: "PENDING" | "OVERDUE" | "PAID" | "PARTIALLY_PAID" | "WRITTEN_OFF" | "DRAFT" })`
  - `Money({ amount, currency = "INR" }: { amount: number | string; currency?: string })`
  - `PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode })`
  - `EmptyState({ icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode })`
  - `ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, onConfirm }: ...)` (props exactly as coded below)
  - `DataTable<TData>({ columns, data, isLoading, onRowClick, selection }: ...)` (TanStack Table wrapper, props exactly as coded below)

- [ ] **Step 1: Add shadcn components and TanStack Table:**

```bash
npx shadcn@latest add table dialog dropdown-menu checkbox popover command calendar sheet tooltip separator alert-dialog tabs
npm install @tanstack/react-table
```

(Existing `badge/button/card/input/label/select/skeleton/switch/textarea` stay. Review the generated files compile with `npm run typecheck`.)

- [ ] **Step 2: Write `src/components/shared/status-chip.tsx`:**

```tsx
import { cn } from "@/lib/utils/cn";

export type ChipStatus =
  | "PENDING"
  | "OVERDUE"
  | "PAID"
  | "PARTIALLY_PAID"
  | "WRITTEN_OFF"
  | "DRAFT";

const styles: Record<ChipStatus, string> = {
  PENDING: "bg-warning/15 text-warning border-warning/30",
  OVERDUE: "bg-destructive/15 text-destructive border-destructive/30",
  PAID: "bg-success/15 text-success border-success/30",
  PARTIALLY_PAID: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  WRITTEN_OFF: "bg-muted text-muted-foreground border-border",
  DRAFT: "bg-secondary text-secondary-foreground border-border",
};

const labels: Record<ChipStatus, string> = {
  PENDING: "Pending",
  OVERDUE: "Overdue",
  PAID: "Paid",
  PARTIALLY_PAID: "Partially paid",
  WRITTEN_OFF: "Written off",
  DRAFT: "Draft",
};

export function StatusChip({ status }: { status: ChipStatus }) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {labels[status]}
    </span>
  );
}
```

- [ ] **Step 3: Write `src/components/shared/money.tsx`:**

```tsx
const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | string, currency = "INR"): string {
  let fmt = formatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, fmt);
  }
  return fmt.format(typeof amount === "string" ? Number(amount) : amount);
}

export function Money({ amount, currency = "INR" }: { amount: number | string; currency?: string }) {
  return <span className="tabular-nums">{formatMoney(amount, currency)}</span>;
}
```

- [ ] **Step 4: Write `src/components/shared/page-header.tsx`:**

```tsx
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/components/shared/empty-state.tsx`:**

```tsx
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 6: Write `src/components/shared/confirm-dialog.tsx`:**

```tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 7: Write `src/components/shared/data-table.tsx`** (generic table with optional row selection; every list screen uses this):

```tsx
"use client";

import {
  ColumnDef,
  RowSelectionState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  onRowClick,
  selection,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  isLoading?: boolean;
  onRowClick?: (row: TData) => void;
  selection?: {
    state: RowSelectionState;
    onChange: (state: RowSelectionState) => void;
    getRowId: (row: TData) => string;
  };
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: !!selection,
    state: { rowSelection: selection?.state ?? {} },
    onRowSelectionChange: (updater) => {
      if (!selection) return;
      const next = typeof updater === "function" ? updater(selection.state) : updater;
      selection.onChange(next);
    },
    getRowId: selection?.getRowId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id}>
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
              onClick={() => onRowClick?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 8: Verify:** `npm run typecheck && npm run lint && npm run build` — all pass.
- [ ] **Step 9: Commit**

```bash
git add src/components package.json package-lock.json
git commit -m "feat: add shared UI primitives (status chip, money, data table, dialogs)"
```

---

## Batch A — App Shell & Dashboard

### Task 5: Stitch Designs — App Shell + Dashboard

**Files:**
- Modify: `docs/design/SCREEN_INVENTORY.md` (record Stitch screen IDs + iteration notes per screen)

**Interfaces:**
- Consumes: Stitch project/design-system IDs from `docs/design/DESIGN_SYSTEM.md`; `stitch-first-design` skill.
- Produces: approved-candidate Stitch screens `shell`, `dashboard` whose IDs are recorded in `SCREEN_INVENTORY.md` for the Task 6/8 implementers.

- [ ] **Step 1: Read the `stitch-first-design` skill.** Then generate the app shell with `mcp__stitch__generate_screen_from_text`, prompt covering: fixed left sidebar (collapsible to icons on tablet, bottom sheet/hamburger on mobile) with nav — Dashboard, Invoices, Bills, Parties, Stock, Payments, Imports, Reminders, Settings, plus reserved disabled slots "Analytics (soon)" and "Assistant (soon)"; top bar with page title, org name, theme toggle, user button; content area `max-w-7xl` padding.
- [ ] **Step 2: Generate the Dashboard screen:** 4 headline tiles (Money to come, Money to pay, Pending invoices count+value, Overdue value), a receivables-by-status chart placeholder, a "Recent activity" list (last reminders/payments), and quick actions (New invoice, Record payment, Import from Tally). Light and dark variants (`mcp__stitch__generate_variants` if useful).
- [ ] **Step 3: Iterate** with `mcp__stitch__edit_screens` until the screens conform to the design system (spacing/tokens); pull renders with `mcp__stitch__get_screen` and eyeball against `DESIGN_SYSTEM.md` tokens.
- [ ] **Step 4: Record screen IDs + a one-line description of each accepted design decision** in `docs/design/SCREEN_INVENTORY.md`; commit.

```bash
git add docs/design/SCREEN_INVENTORY.md
git commit -m "design: Stitch screens for app shell and dashboard (Batch A)"
```

### Task 6: **USER ACTION — Design Review Gate A**

- [ ] **Step 1:** Present the Batch A Stitch screens (links/renders) to the user.
- [ ] **Step 2:** If feedback: iterate via `mcp__stitch__edit_screens`, re-present. Repeat until approved.
- [ ] **Step 3:** Record approval (name, date, screen IDs) in `docs/design/SCREEN_INVENTORY.md`; commit with message `design: Batch A approved by user`. **No Batch A implementation before this commit exists.**

### Task 7: Implement App Shell

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Create: `src/components/layout/top-bar.tsx`
- Create: `src/components/layout/mobile-nav.tsx`
- Modify: `src/app/dashboard/layout.tsx`
- Test: `e2e/shell.spec.ts`

**Interfaces:**
- Consumes: approved Stitch `shell` screen (fetch markup/spec with `mcp__stitch__get_screen`); `ThemeProvider` from `src/components/providers/theme-provider.tsx` (next-themes, already wired).
- Produces: the nav landmark and link names (`Dashboard, Invoices, Bills, Parties, Stock, Payments, Imports, Reminders, Settings`) that `e2e/helpers/nav.ts` and every later spec rely on. New routes referenced must exist as pages by the end of their own batch; until then the sidebar renders the link but the page 404s — acceptable inside this phase only if the corresponding batch is not yet merged; the phase gate (Task 27) requires all nine to resolve.

- [ ] **Step 1: Write the failing spec `e2e/shell.spec.ts`:**

```ts
import { test, expect } from "@playwright/test";

const NAV_LINKS = [
  "Dashboard",
  "Invoices",
  "Bills",
  "Parties",
  "Stock",
  "Payments",
  "Imports",
  "Reminders",
  "Settings",
];

test.describe("app shell", () => {
  test("sidebar shows all nav links", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation");
    for (const name of NAV_LINKS) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
  });

  test("active link is highlighted", async ({ page }) => {
    await page.goto("/dashboard/invoices");
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Invoices" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("theme toggle switches dark class", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /toggle theme/i }).click();
    await page.getByRole("menuitem", { name: /dark/i }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("mobile shows hamburger nav", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile project only");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /open menu/i }).click();
    await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify failure:** `npx playwright test e2e/shell.spec.ts --project=chromium` — expected FAIL (missing links/toggle).
- [ ] **Step 3: Rebuild `app-sidebar.tsx`** per the approved Stitch design: extend `links` to all nine entries with lucide icons (`LayoutDashboard, FileText, ReceiptText, Users, Package, Wallet, Upload, BellRing, Settings`), add the two disabled "soon" slots, set `aria-current="page"` on the active link (keep the existing `pathname.startsWith` logic), keep the InvoicePilot brand block and sign-out.
- [ ] **Step 4: Write `top-bar.tsx`:** client component with page-title slot, theme toggle (dropdown: Light/Dark/System via `useTheme` from next-themes, trigger button `aria-label="Toggle theme"`), Clerk `UserButton`. Write `mobile-nav.tsx`: `Sheet`-based drawer triggered by a hamburger button `aria-label="Open menu"`, rendering the same links; visible only below `md`.
- [ ] **Step 5: Update `src/app/dashboard/layout.tsx`:** sidebar hidden below `md` (`hidden md:flex`), `MobileNav` + `TopBar` in a header, main content `p-6 max-w-7xl`. Match the approved Stitch spacing.
- [ ] **Step 6: Run the spec on all three projects:** `npx playwright test e2e/shell.spec.ts` — expected PASS (chromium, chromium-dark, mobile).
- [ ] **Step 7: Commit**

```bash
git add src/components/layout src/app/dashboard/layout.tsx e2e/shell.spec.ts
git commit -m "feat: rebuild app shell per approved Stitch design (nav, top bar, mobile drawer)"
```

### Task 8: Implement Dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/modules/dashboard/components/stats-cards.tsx`
- Modify: `src/modules/dashboard/components/status-chart.tsx`
- Create: `src/modules/dashboard/components/quick-actions.tsx`
- Create: `src/modules/dashboard/components/recent-activity.tsx`
- Modify: `src/app/api/dashboard/stats/route.ts` (extend response)
- Test: `e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: existing `GET /api/dashboard/stats`; `bill.service.ts` → `billService.outstandingTotal(organizationId: string): Promise<{ amount: string; count: number }>` (Phase 1); `Money`, `PageHeader`, `EmptyState` from Task 4.
- Produces: stats payload extension `{ moneyToCome: string; moneyToPay: string; pendingCount: number; pendingValue: string; overdueValue: string }` merged into the existing stats response (additive — existing keys unchanged). Full analytics (aging, DSO) remain Phase 5; this task only restyles + adds the payable tile.

- [ ] **Step 1: Write the failing spec `e2e/dashboard.spec.ts`:**

```ts
import { test, expect } from "@playwright/test";

test.describe("dashboard", () => {
  test("headline tiles render with rupee values", async ({ page }) => {
    await page.goto("/dashboard");
    for (const tile of ["Money to come", "Money to pay", "Pending invoices", "Overdue"]) {
      const card = page.getByTestId(`tile-${tile.toLowerCase().replace(/ /g, "-")}`);
      await expect(card).toBeVisible();
      await expect(card).toContainText("₹");
    }
  });

  test("quick actions navigate", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "New invoice" }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/new/);
  });

  test("recent activity section renders", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /recent activity/i })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify failure:** `npx playwright test e2e/dashboard.spec.ts --project=chromium` — expected FAIL.
- [ ] **Step 3: Extend the stats route/service** additively: in the dashboard service add `moneyToPay` from `billService.outstandingTotal(ctx.organizationId)` and the other new keys from existing invoice aggregates. (If Phase 1's `bill.service.ts` isn't merged yet, return `moneyToPay: "0"` from the service with a `// TODO(phase-1)` and file it in Task 27's gate checklist — the tile still renders.)
- [ ] **Step 4: Rebuild the components** per the approved Stitch dashboard: `stats-cards.tsx` renders the four tiles (each `Card` gets `data-testid="tile-money-to-come"` etc., value via `<Money/>`), `quick-actions.tsx` renders three link-buttons (`New invoice` → `/dashboard/invoices/new`, `Record payment` → `/dashboard/payments?record=1`, `Import from Tally` → `/dashboard/imports`), `recent-activity.tsx` lists the 10 latest reminders/payments from the stats payload (heading "Recent activity", `EmptyState` when none), `status-chart.tsx` restyled to token colors.
- [ ] **Step 5: Run spec, all projects:** `npx playwright test e2e/dashboard.spec.ts` — expected PASS.
- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/page.tsx src/modules/dashboard src/app/api/dashboard e2e/dashboard.spec.ts
git commit -m "feat: rebuild dashboard per approved Stitch design with payable tile and quick actions"
```

---

## Batch B — Invoices (list, detail, create/edit)

### Task 9: Stitch Designs — Invoice Screens

**Files:**
- Modify: `docs/design/SCREEN_INVENTORY.md`

**Interfaces:**
- Produces: Stitch screens `invoices-list`, `invoice-detail`, `invoice-editor` (IDs recorded).

- [ ] **Step 1:** `mcp__stitch__generate_screen_from_text` — **Invoices list:** filter bar (status chips as toggles, party picker, date range, search), saved-filter tabs ("All / Overdue / Due this week / +saved"), selectable table (number, party, issue/due dates, total, balance due, status chip, row-action menu), bulk-action bar appearing on selection (Send reminders, Mark paid, Export CSV, Delete), primary buttons "New invoice" and "Export CSV".
- [ ] **Step 2:** **Invoice detail:** header (number, party link, status chip, balance due), action row (Mark paid, Record partial payment, Send reminder now ▾ Email/WhatsApp, Snooze, Duplicate, Write off, Download PDF), line-items table, and a **unified timeline** interleaving `CommunicationLog` entries (email/WhatsApp sent/delivered/read) and `Payment` allocations, newest first with channel icons.
- [ ] **Step 3:** **Invoice create/edit:** party combobox (with inline "create party"), dates, line-items editor (item stock-picker combobox per row, description, qty, rate, discount %, tax %, computed amount, remove row, "Add line"), totals footer (subtotal/tax/total), notes, Save / Save & send.
- [ ] **Step 4:** Iterate with `mcp__stitch__edit_screens` against design-system tokens; record all three screen IDs in `SCREEN_INVENTORY.md`; commit (`design: Stitch screens for invoices (Batch B)`).

### Task 10: **USER ACTION — Design Review Gate B**

- [ ] **Step 1:** Present the three Batch B screens to the user; iterate in Stitch until approved.
- [ ] **Step 2:** Record approval in `SCREEN_INVENTORY.md`; commit `design: Batch B approved by user`. **No Batch B implementation before this commit.**

### Task 11: Invoice Mutation API Routes

The list/detail screens need mutation endpoints beyond the existing CRUD. Route → handler → service, per convention.

**Files:**
- Create: `src/app/api/invoices/[id]/duplicate/route.ts`
- Create: `src/app/api/invoices/[id]/write-off/route.ts`
- Create: `src/app/api/invoices/[id]/snooze/route.ts`
- Create: `src/app/api/invoices/[id]/timeline/route.ts`
- Modify: `src/lib/validations/invoice.ts` (add `snoozeSchema`)
- Test: `src/server/services/__tests__/invoice.service.test.ts` (extend Phase 1's Vitest suite)

**Interfaces:**
- Consumes (service methods; add to `invoice.service.ts` TDD-style if Phase 1 hasn't — they're invoice-domain, owned by this task if absent):
  - `invoiceService.duplicate(organizationId: string, invoiceId: string): Promise<InvoiceDto>` — copies invoice + `InvoiceLineItem`s as a new DRAFT/PENDING invoice with next number, today's issue date.
  - `invoiceService.writeOff(organizationId: string, invoiceId: string, reason?: string): Promise<InvoiceDto>` — sets status `WRITTEN_OFF`.
  - `invoiceService.snooze(organizationId: string, invoiceId: string, days: number): Promise<InvoiceDto>` — shifts pending `Reminder` rows by `days`.
  - `invoiceService.timeline(organizationId: string, invoiceId: string): Promise<TimelineEntry[]>` where `TimelineEntry = { id: string; at: string; kind: "COMMUNICATION" | "PAYMENT"; channel?: "EMAIL" | "WHATSAPP"; status?: string; amount?: string; summary: string }` — merges `CommunicationLog` (falling back to legacy `EmailLog` rows) and `PaymentAllocation`s, sorted desc.
- Produces: `POST /api/invoices/[id]/duplicate` → 201 `InvoiceDto`; `POST /api/invoices/[id]/write-off` → 200; `POST /api/invoices/[id]/snooze` body `{ days: number }` (zod: `z.object({ days: z.number().int().min(1).max(90) })`) → 200; `GET /api/invoices/[id]/timeline` → 200 `TimelineEntry[]`. Consumed by Tasks 12–13.

- [ ] **Step 1: Write failing Vitest tests** for the four service methods (duplicate copies line items & zeroes `amountPaid`; write-off sets status; snooze shifts only unsent reminders; timeline merge-sorts and maps both kinds). Run `npx vitest run src/server/services/__tests__/invoice.service.test.ts` — expected FAIL.
- [ ] **Step 2: Implement the service methods** (org-scoped queries only, soft-delete respected). Run tests — PASS.
- [ ] **Step 3: Write the four routes.** Pattern (duplicate shown; the others differ only in method call / schema):

```ts
// src/app/api/invoices/[id]/duplicate/route.ts
import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { invoiceService } from "@/server/services/invoice.service";

export const POST = withApiHandler(
  async (_request, ctx, params) => {
    const invoice = await invoiceService.duplicate(ctx.organizationId, params.id);
    return successResponse(invoice, 201);
  },
  { rateLimit: { limit: 30, windowMs: 60_000 } },
);
```

`write-off` parses `z.object({ reason: z.string().max(500).optional() })`; `snooze` parses `snoozeSchema`; `timeline` is a `GET` returning `successResponse(entries)`.

- [ ] **Step 4:** `npm run typecheck && npx vitest run` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/app/api/invoices src/server/services src/lib/validations/invoice.ts
git commit -m "feat: invoice duplicate/write-off/snooze/timeline endpoints"
```

### Task 12: Implement Invoices List

**Files:**
- Modify: `src/app/dashboard/invoices/page.tsx`
- Modify: `src/modules/invoices/components/invoice-table.tsx`
- Create: `src/modules/invoices/components/invoice-filters.tsx`
- Create: `src/modules/invoices/components/invoice-row-actions.tsx`
- Create: `src/modules/invoices/components/bulk-actions-bar.tsx`
- Create: `src/store/invoice-filters.ts`
- Create: `src/lib/utils/csv.ts`
- Test: `e2e/invoices-list.spec.ts`

**Interfaces:**
- Consumes: `GET /api/invoices` (existing, extend query params `partyId`, `dueBefore`, `dueAfter`, `search` in the service additively), `POST /api/invoices/bulk` (existing), Task 11 routes, Task 4 primitives, seed data from Task 2.
- Produces: `useInvoiceFilters` Zustand store (persisted to localStorage key `invoicepilot.saved-filters`): `{ filters: InvoiceFilters; savedFilters: { name: string; filters: InvoiceFilters }[]; setFilters; saveCurrent(name); applySaved(name); deleteSaved(name) }` with `InvoiceFilters = { status?: string[]; partyId?: string; dueBefore?: string; dueAfter?: string; search?: string }`. `exportCsv(rows: Record<string, unknown>[], filename: string)` in `src/lib/utils/csv.ts` (uses `papaparse.unparse` + Blob download) — reused by Bills/Parties/Stock exports.

- [ ] **Step 1: Write the failing spec `e2e/invoices-list.spec.ts`** (uses seeded `E2E-INV-*`):

```ts
import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";

test.describe("invoices list", () => {
  test("renders seeded invoices with status chips", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    const row = page.getByRole("row", { name: /E2E-INV-002/ });
    await expect(row).toBeVisible();
    await expect(row.locator('[data-status="OVERDUE"]')).toBeVisible();
  });

  test("status filter narrows the table", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("button", { name: /^overdue$/i }).click();
    await expect(page.getByRole("row", { name: /E2E-INV-002/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /E2E-INV-003/ })).toHaveCount(0);
  });

  test("saved filter round-trips", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("button", { name: /^overdue$/i }).click();
    await page.getByRole("button", { name: /save filter/i }).click();
    await page.getByLabel(/filter name/i).fill("Chase these");
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.reload();
    await page.getByRole("tab", { name: "Chase these" }).click();
    await expect(page.getByRole("row", { name: /E2E-INV-002/ })).toBeVisible();
  });

  test("bulk select shows action bar", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("row", { name: /E2E-INV-001/ }).getByRole("checkbox").check();
    const bar = page.getByTestId("bulk-actions-bar");
    await expect(bar).toContainText("1 selected");
    for (const action of ["Send reminders", "Mark paid", "Export CSV", "Delete"]) {
      await expect(bar.getByRole("button", { name: action })).toBeVisible();
    }
  });

  test("row menu lists every mutation affordance", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("row", { name: /E2E-INV-001/ }).getByRole("button", { name: /actions/i }).click();
    for (const item of [
      "Mark paid",
      "Record partial payment",
      "Send reminder now",
      "Snooze",
      "Duplicate",
      "Write off",
      "Export PDF",
    ]) {
      await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
    }
  });

  test("duplicate creates a new invoice", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("row", { name: /E2E-INV-001/ }).getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(page.getByText(/invoice duplicated/i)).toBeVisible(); // sonner toast
  });
});
```

- [ ] **Step 2: Run to verify failure:** `npx playwright test e2e/invoices-list.spec.ts --project=chromium` — FAIL.
- [ ] **Step 3: Build `src/store/invoice-filters.ts`** (Zustand + `persist` middleware, shape per Interfaces) and `src/lib/utils/csv.ts`:

```ts
import Papa from "papaparse";

export function exportCsv(rows: Record<string, unknown>[], filename: string) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Build the components** per the approved Stitch design: `invoice-filters.tsx` (status toggle chips, party combobox fed by `GET /api/parties?query=`, date-range popover calendar, search input, "Save filter" dialog, saved-filter `Tabs`); `invoice-table.tsx` rewritten on `DataTable` with a selection checkbox column (header checkbox = select page) and `StatusChip`/`Money` cells; `invoice-row-actions.tsx` (`DropdownMenu`, trigger `aria-label="Actions"`) wiring: Mark paid → `PATCH /api/invoices/[id]` status PAID (existing route) after `ConfirmDialog`; Record partial payment → navigates `/dashboard/payments?record=1&invoiceId=...`; Send reminder now → submenu Email (`POST /api/reminders/trigger` existing) / WhatsApp (disabled with tooltip "Available after Phase 4" until `NEXT_PUBLIC_WHATSAPP_ENABLED=true`); Snooze → dialog with 3/7/14-day options → `POST .../snooze`; Duplicate → `POST .../duplicate` then toast "Invoice duplicated"; Write off → destructive `ConfirmDialog` → `POST .../write-off`; Export PDF → opens `/dashboard/invoices/[id]/print` (Task 13). All mutations invalidate the `["invoices"]` query and toast. `bulk-actions-bar.tsx` (fixed bottom bar, `data-testid="bulk-actions-bar"`, "N selected", four buttons; Export CSV calls `exportCsv` on the selected rows; Delete/Mark paid/Send reminders hit `POST /api/invoices/bulk`).
- [ ] **Step 5: Extend list filtering** additively in `invoiceService.list` + route (`partyId`, `dueBefore`, `dueAfter`, `search` params) with a Vitest case for each. Run `npx vitest run` — PASS.
- [ ] **Step 6: Run spec, all projects:** `npx playwright test e2e/invoices-list.spec.ts` — PASS.
- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/invoices src/modules/invoices src/store src/lib/utils/csv.ts src/server/services e2e/invoices-list.spec.ts
git commit -m "feat: invoices list with saved filters, bulk actions, and full row-action menu"
```

### Task 13: Implement Invoice Detail + Print View

**Files:**
- Create: `src/app/dashboard/invoices/[id]/page.tsx`
- Create: `src/app/dashboard/invoices/[id]/print/page.tsx`
- Create: `src/modules/invoices/components/invoice-summary-card.tsx`
- Create: `src/modules/invoices/components/invoice-timeline.tsx`
- Create: `src/modules/invoices/components/invoice-actions.tsx`
- Test: `e2e/invoice-detail.spec.ts`

**Interfaces:**
- Consumes: `GET /api/invoices/[id]` (existing detail route — extend to include `party`, `lineItems` relations additively), `GET /api/invoices/[id]/timeline` (Task 11), row-action endpoints (Task 11), `StatusChip`/`Money`/`ConfirmDialog`.
- Produces: route `/dashboard/invoices/[id]`; print route `/dashboard/invoices/[id]/print` (minimal layout, `@media print` styles, auto-`window.print()` on load) — this is the "Export PDF" affordance (browser print-to-PDF; a server-side PDF lib is YAGNI at this phase and can slot behind the same URL later).

- [ ] **Step 1: Write the failing spec `e2e/invoice-detail.spec.ts`.** Exact assertions:
  - navigating from the list row `E2E-INV-002` lands on URL matching `/dashboard\/invoices\/[a-z0-9]+/` and shows heading `E2E-INV-002`;
  - header shows `data-status="OVERDUE"` chip, party link "Acme Traders" (navigates to the party page), and a "Balance due" figure containing `₹`;
  - action buttons visible: `Mark paid`, `Record payment`, `Send reminder now`, `Snooze`, `Duplicate`, `Write off`, `Download PDF`;
  - line-items table shows a row containing `Steel Rod 12mm`;
  - timeline region (`data-testid="invoice-timeline"`) is visible; for seeded `E2E-INV-003` it contains a payment entry with text matching `/payment .* ₹5,000/i`;
  - clicking `Mark paid` → confirm dialog → confirm → chip becomes `data-status="PAID"` (run against `E2E-INV-001`; re-seed restores);
  - `Download PDF` opens a popup whose URL ends `/print`.
- [ ] **Step 2: Run to verify failure**, `--project=chromium` — FAIL.
- [ ] **Step 3: Build the page** per approved Stitch detail design: server component fetching nothing (client page using TanStack Query, matching existing pages' client-fetch convention); `invoice-summary-card` (number, `StatusChip`, party `Link`, issue/due dates, subtotal/tax/total/`amountPaid`/balance via `Money`); `invoice-actions` (buttons reusing the same mutation hooks as Task 12 — extract shared hooks to `src/modules/invoices/hooks.ts` rather than duplicating fetch logic); line-items `DataTable`; `invoice-timeline` rendering `TimelineEntry[]` with channel icons (`Mail`, `MessageCircle`, `IndianRupee`) and status text, `EmptyState` when empty.
- [ ] **Step 4: Build the print view:** standalone page (no dashboard chrome) rendering a classic invoice document (org block, party block, line-item table, totals, notes), `useEffect(() => window.print(), [])`, print CSS hiding the "Print" button.
- [ ] **Step 5: Run spec, all projects** — PASS. **Step 6: Commit** (`feat: invoice detail with communications+payments timeline and print view`).

### Task 14: Implement Invoice Create/Edit with Line Items + Stock Picker

**Files:**
- Create: `src/app/dashboard/invoices/new/page.tsx`
- Create: `src/app/dashboard/invoices/[id]/edit/page.tsx`
- Create: `src/modules/invoices/components/invoice-form.tsx`
- Create: `src/modules/invoices/components/line-items-editor.tsx`
- Create: `src/modules/invoices/components/item-picker.tsx`
- Create: `src/modules/invoices/components/party-picker.tsx`
- Create: `src/modules/invoices/line-items.ts` (pure reducer + totals)
- Test: `src/modules/invoices/__tests__/line-items.test.ts` (Vitest)
- Test: `e2e/invoice-editor.spec.ts`

**Interfaces:**
- Consumes: `GET /api/items?query=` → `{ id, name, sku, unit, salePrice, taxRate, stockOnHand }[]` (thin route over `itemService.search(organizationId: string, query: string)`, Phase 1; create the route file here if absent following the Task 11 route pattern); `GET/POST /api/parties` (`partyService.search(organizationId, query)`, `partyService.create(organizationId, input)`); existing `POST /api/invoices` + `PATCH /api/invoices/[id]` extended additively to accept `lineItems: LineItemInput[]`.
- Produces: `LineItemInput = { itemId?: string; description: string; qty: number; rate: number; discountPct: number; taxRatePct: number }`; pure functions `lineAmount(li: LineItemInput): number` (`qty*rate*(1-discountPct/100)*(1+taxRatePct/100)`, rounded 2dp) and `totals(items: LineItemInput[]): { subtotal: number; taxAmount: number; total: number }` — the same math the Phase 1 service must apply server-side (documented in the service's test).

- [ ] **Step 1: Write failing Vitest tests for `line-items.ts`** (lineAmount with discount+tax, rounding to 2dp, totals over 3 rows, empty list → zeros). Run — FAIL. **Step 2:** implement the pure module. Run — PASS. Commit (`feat: invoice line-item math`).
- [ ] **Step 3: Write the failing spec `e2e/invoice-editor.spec.ts`.** Exact assertions:
  - `/dashboard/invoices/new` shows heading "New invoice";
  - party combobox: typing `Acme` shows option "Acme Traders"; selecting it fills the field;
  - "Add line" appends a row; the item picker on that row, given `Steel`, offers "Steel Rod 12mm" showing its stock on hand (`50` badge); selecting fills description/rate/tax;
  - setting qty `2` updates the row amount and the totals footer (subtotal/tax/total all contain `₹`, total > subtotal);
  - removing the row updates totals back to `₹0.00`;
  - re-adding a line and clicking "Save" POSTs and redirects to the new invoice's detail page (URL `/dashboard/invoices/<id>`), toast "Invoice created";
  - `/dashboard/invoices/<seeded E2E-INV-001 id>/edit` loads with the existing line item present and "Save changes" enabled.
- [ ] **Step 4: Run to verify failure** — FAIL. **Step 5: Build** `party-picker` and `item-picker` as `Command`-in-`Popover` comboboxes (debounced query, item picker renders `stockOnHand` badge, party picker has a "Create ‘{query}’" footer action opening a minimal create-party dialog: name/email/phone → `POST /api/parties`); `line-items-editor` (controlled array state via `useReducer` over `LineItemInput[]`, actions `add/update/remove`, totals from `totals()`); `invoice-form` (zod client validation mirroring `createInvoiceSchema`, mutation + redirect); wire both pages (edit page hydrates from `GET /api/invoices/[id]`).
- [ ] **Step 6: Run spec, all projects** — PASS. **Step 7: Commit** (`feat: invoice editor with line items and stock picker`).

---

## Batch C — Parties & Agents, Payments, Bills

### Task 15: Stitch Designs — Parties, Payments, Bills

**Files:**
- Modify: `docs/design/SCREEN_INVENTORY.md`

- [ ] **Step 1:** Generate **Parties & Agents**: directory table (name, type badge CUSTOMER/SUPPLIER/AGENT, agent, outstanding, credit limit usage bar, last payment), type filter tabs, "New party"; **Party detail**: contact card + credit terms, ledger statement table (date, doc, debit, credit, running balance), "Download statement (CSV/PDF)" split button, invoices/bills/payments tabs; **Agent rollup** section on agent-type parties: managed-parties table with per-party outstanding and a total row.
- [ ] **Step 2:** Generate **Payments**: payments register table (date, party, direction IN/OUT, mode, amount, allocation status), "Record payment" primary button opening a two-step sheet — step 1 party/direction/amount/mode/date, step 2 allocation table of that party's open invoices (or bills for OUT) with per-row "allocate" amount inputs, an "Auto-allocate oldest first" button, unallocated remainder indicator.
- [ ] **Step 3:** Generate **Bills**: list mirroring invoices (supplier, number, due, total, balance, status chips) with row actions (Mark paid, Record payment, Duplicate, Write off, Export CSV) and a simple detail view (header + line items + payments applied).
- [ ] **Step 4:** Iterate via `mcp__stitch__edit_screens`; record screen IDs; commit (`design: Stitch screens for parties, payments, bills (Batch C)`).

### Task 16: **USER ACTION — Design Review Gate C**

- [ ] **Step 1:** Present Batch C screens; iterate until approved.
- [ ] **Step 2:** Record approval in `SCREEN_INVENTORY.md`; commit `design: Batch C approved by user`. **No Batch C implementation before this commit.**

### Task 17: Implement Parties & Agents

**Files:**
- Create: `src/app/dashboard/parties/page.tsx`
- Create: `src/app/dashboard/parties/[id]/page.tsx`
- Create: `src/modules/parties/components/party-table.tsx`
- Create: `src/modules/parties/components/party-form-dialog.tsx`
- Create: `src/modules/parties/components/party-ledger.tsx`
- Create: `src/modules/parties/components/agent-rollup.tsx`
- Create: `src/app/api/parties/route.ts`, `src/app/api/parties/[id]/route.ts`, `src/app/api/parties/[id]/ledger/route.ts`, `src/app/api/parties/[id]/statement/route.ts` (any that Phase 1 hasn't created — follow the Task 11 route pattern exactly)
- Test: `e2e/parties.spec.ts`

**Interfaces:**
- Consumes (`party.service.ts`, Phase 1): `partyService.list(organizationId, { type?, query?, cursor?, take? })`, `partyService.get(organizationId, id)`, `partyService.create/update(organizationId, ...)`, `partyService.ledger(organizationId, partyId): Promise<LedgerEntry[]>` with `LedgerEntry = { date: string; docType: "INVOICE" | "BILL" | "PAYMENT"; docNumber: string; debit: string | null; credit: string | null; balance: string }`, `partyService.agentRollup(organizationId, agentPartyId): Promise<{ party: { id; name }; outstanding: string }[]>`.
- Produces: `GET /api/parties/[id]/statement?format=csv` streams a CSV attachment (`Content-Disposition: attachment; filename="statement-<partyName>.csv"`) built from `partyService.ledger`; `format=pdf` redirects to `/dashboard/parties/[id]/statement/print` (print view like Task 13's). Routes `/dashboard/parties`, `/dashboard/parties/[id]` consumed by party links in Tasks 12–14.

- [ ] **Step 1: Write the failing spec `e2e/parties.spec.ts`.** Exact assertions:
  - directory lists rows "Acme Traders" (badge `Customer`, agent cell "Ravi Kumar"), "Bharat Suppliers" (badge `Supplier`), "Ravi Kumar" (badge `Agent`);
  - type filter tab `Customers` hides "Bharat Suppliers", keeps "Acme Traders";
  - "New party" opens a dialog; submitting name "Test Co" + type Customer adds a "Test Co" row and toasts "Party created";
  - clicking "Acme Traders" opens the detail page: heading "Acme Traders", contact card shows the seeded email, ledger table (`data-testid="party-ledger"`) has ≥3 rows and a "Balance" column whose last cell contains `₹`;
  - "Download statement" menu shows items `CSV` and `PDF`; clicking `CSV` triggers a download event with suggested filename matching `/statement-.*\.csv/`;
  - navigating to "Ravi Kumar" shows section heading "Managed parties" with a row "Acme Traders" and a total row containing `₹`.
- [ ] **Step 2: Run — FAIL.** **Step 3:** Add any missing API routes (list/get/ledger/statement per Interfaces; statement CSV route builds `Papa.unparse` server-side — import from `papaparse` directly, not the client helper). Vitest the statement CSV formatting (header row `Date,Document,Debit,Credit,Balance`).
- [ ] **Step 4: Build the components** per approved Stitch designs (`DataTable` + `Badge` for types; credit-usage bar = simple `div` width %; `party-form-dialog` zod-validated: name, type, email, phone/WhatsApp, GSTIN, address, creditLimit, creditDays, agent picker for customers; ledger + rollup tables; statement print view page).
- [ ] **Step 5: Run spec, all projects — PASS.** **Step 6: Commit** (`feat: parties directory, ledger statement with CSV/PDF download, agent rollup`).

### Task 18: Implement Payments (record + allocate)

**Files:**
- Create: `src/app/dashboard/payments/page.tsx`
- Create: `src/modules/payments/components/payment-table.tsx`
- Create: `src/modules/payments/components/record-payment-sheet.tsx`
- Create: `src/modules/payments/components/allocation-editor.tsx`
- Create: `src/modules/payments/allocation.ts` (pure auto-allocate)
- Create: `src/app/api/payments/route.ts` (if Phase 1 hasn't)
- Test: `src/modules/payments/__tests__/allocation.test.ts`
- Test: `e2e/payments.spec.ts`

**Interfaces:**
- Consumes (`payment.service.ts`, Phase 1): `paymentService.list(organizationId, { partyId?, direction?, cursor? })`, `paymentService.record(organizationId, input: { partyId: string; direction: "IN" | "OUT"; amount: number; mode: "CASH" | "BANK" | "UPI" | "CHEQUE" | "OTHER"; date: string; allocations: { targetType: "INVOICE" | "BILL"; targetId: string; amount: number }[] })` → creates `Payment` + `PaymentAllocation`s and updates target `amountPaid`/status; open docs via `GET /api/invoices?partyId=&status=PENDING,OVERDUE,PARTIALLY_PAID` and the Bills equivalent.
- Produces: pure `autoAllocate(amount: number, openDocs: { id: string; balanceDue: number; dueDate: string }[]): { targetId: string; amount: number }[]` (oldest due first, greedy, 2dp); `?record=1&invoiceId=` deep link consumed by Tasks 8 and 12.

- [ ] **Step 1: Vitest `autoAllocate` failing tests** (exact fills oldest first; partial fill of last doc; amount exceeding total leaves remainder unallocated; empty docs → `[]`). Run — FAIL. **Step 2:** implement; PASS; commit (`feat: payment auto-allocation`).
- [ ] **Step 3: Write the failing spec `e2e/payments.spec.ts`.** Exact assertions:
  - payments register shows the seeded ₹5,000 IN payment row for "Acme Traders" with allocation status "Allocated";
  - "Record payment" opens the sheet; choosing party "Acme Traders", direction In, amount `1000`, mode UPI advances to step 2 listing open docs `E2E-INV-001` and `E2E-INV-002` with balance-due figures;
  - "Auto-allocate oldest first" fills `E2E-INV-002`'s input with `1000.00` and remainder indicator shows `₹0.00 unallocated`;
  - editing the allocation to `600` shows `₹400.00 unallocated` and Save stays enabled (partial allocation allowed);
  - Save toasts "Payment recorded", closes the sheet, table gains the new row, and `E2E-INV-002` on the invoices list now shows `data-status="PARTIALLY_PAID"`;
  - deep link `/dashboard/payments?record=1&invoiceId=<E2E-INV-001 id>` opens the sheet pre-filled with party "Acme Traders" and that invoice's allocation row focused.
- [ ] **Step 4: Run — FAIL. Step 5: Build** the page/components per the approved design (sheet with two-step state machine, allocation inputs clamped to balance due, `Money` everywhere), plus the `POST /api/payments` route (zod `recordPaymentSchema`, calls `paymentService.record`).
- [ ] **Step 6: Run spec, all projects — PASS. Step 7: Commit** (`feat: payments register with record + allocate flow`).

### Task 19: Implement Bills

**Files:**
- Create: `src/app/dashboard/bills/page.tsx`
- Create: `src/app/dashboard/bills/[id]/page.tsx`
- Create: `src/modules/bills/components/bill-table.tsx`
- Create: `src/modules/bills/components/bill-form.tsx`
- Create: `src/app/api/bills/route.ts`, `src/app/api/bills/[id]/route.ts` (if Phase 1 hasn't)
- Test: `e2e/bills.spec.ts`

**Interfaces:**
- Consumes (`bill.service.ts`, Phase 1): `billService.list(organizationId, { status?, partyId?, cursor? })`, `billService.get/create/update(organizationId, ...)`, `billService.markPaid(organizationId, billId)`, `billService.writeOff(organizationId, billId)`. Reuses `DataTable`, `StatusChip`, `exportCsv`, and the payments deep link (`?record=1&direction=OUT&billId=`).
- Produces: routes `/dashboard/bills`, `/dashboard/bills/[id]`.

- [ ] **Step 1: Write the failing spec `e2e/bills.spec.ts`.** Exact assertions:
  - list shows row `E2E-BILL-001` with supplier "Bharat Suppliers", `data-status="PENDING"` chip, and amount `₹7,250`;
  - "Export CSV" button triggers a download named matching `/bills.*\.csv/`;
  - row action menu contains `Mark paid`, `Record payment`, `Write off`;
  - `Record payment` navigates to `/dashboard/payments?record=1&direction=OUT&billId=...` with the sheet open;
  - clicking the row opens the detail page: heading `E2E-BILL-001`, supplier link, line items/notes section, "Payments applied" section (empty state text "No payments yet");
  - "New bill" opens the form (supplier picker reusing `party-picker` filtered to suppliers, amount, due date); submitting adds a row and toasts "Bill created".
- [ ] **Step 2: Run — FAIL. Step 3: Build** pages/components mirroring the invoices patterns (reuse `party-picker` with a `type` prop — extend it, don't fork it), plus missing API routes per convention.
- [ ] **Step 4: Run spec, all projects — PASS. Step 5: Commit** (`feat: bills list and detail with payable actions`).

---

## Batch D — Stock & Imports

### Task 20: Stitch Designs — Stock + Imports Wizard

**Files:**
- Modify: `docs/design/SCREEN_INVENTORY.md`

- [ ] **Step 1:** Generate **Stock**: items table (name, SKU, unit, stock on hand, reorder level, low-stock warning badge, valuation), search + "Low stock only" toggle, "New item"; **Item detail**: info card + movements table (date, type IN/OUT/ADJUSTMENT/OPENING, qty, rate, source doc link) + "Adjust stock" dialog (qty ±, reason).
- [ ] **Step 2:** Generate **Imports wizard**: 3-step flow — Step 1 upload (Tally Masters XML / Tally Vouchers XML / CSV, drag-drop), Step 2 preview table with per-row status (create/update/skip/error) and warnings panel (e.g. "12 parties missing email"), Step 3 result summary (created/updated/skipped/errored counts) with downloadable mapping report and "Undo batch"; plus a batch-history table below.
- [ ] **Step 3:** Iterate; record IDs; commit (`design: Stitch screens for stock and imports (Batch D)`).

### Task 21: **USER ACTION — Design Review Gate D**

- [ ] **Step 1:** Present Batch D screens; iterate until approved.
- [ ] **Step 2:** Record approval; commit `design: Batch D approved by user`. **No Batch D implementation before this commit.**

### Task 22: Implement Stock

**Files:**
- Create: `src/app/dashboard/stock/page.tsx`
- Create: `src/app/dashboard/stock/[id]/page.tsx`
- Create: `src/modules/stock/components/item-table.tsx`
- Create: `src/modules/stock/components/item-form-dialog.tsx`
- Create: `src/modules/stock/components/movement-table.tsx`
- Create: `src/modules/stock/components/adjust-stock-dialog.tsx`
- Create: `src/app/api/items/route.ts`, `src/app/api/items/[id]/route.ts`, `src/app/api/items/[id]/movements/route.ts`, `src/app/api/items/[id]/adjust/route.ts` (if Phase 1 hasn't)
- Test: `e2e/stock.spec.ts`

**Interfaces:**
- Consumes (`item.service.ts` / `stock.service.ts`, Phase 1): `itemService.list(organizationId, { query?, lowStockOnly?, cursor? })` (rows include computed `stockOnHand`, `valuation`), `itemService.create/update(organizationId, ...)`, `stockService.movements(organizationId, itemId)`, `stockService.adjust(organizationId, itemId, { qty: number; reason: string })` (creates `StockMovement` sourceType `ADJUSTMENT`).
- Produces: routes `/dashboard/stock`, `/dashboard/stock/[id]`.

- [ ] **Step 1: Write the failing spec `e2e/stock.spec.ts`.** Exact assertions:
  - items table shows "Steel Rod 12mm" with stock on hand `50` and unit `NOS`;
  - "Low stock only" toggle hides it (50 > reorder 10); toggling back restores it;
  - item detail shows heading "Steel Rod 12mm" and a movements table whose first row has type `Opening` and qty `50`;
  - "Adjust stock" dialog: qty `-5`, reason "damaged" → toast "Stock adjusted", movements gain an `Adjustment` row `-5`, stock on hand shows `45`;
  - "New item" dialog: name "Test Widget", unit "NOS", sale price `100` → row appears, toast "Item created".
- [ ] **Step 2: Run — FAIL. Step 3: Build** pages/components per approved design (low-stock badge when `stockOnHand <= reorderLevel`, valuation via `Money`), plus missing routes per convention.
- [ ] **Step 4: Run spec, all projects — PASS. Step 5: Commit** (`feat: stock items and movements with adjust flow`).

### Task 23: Implement Imports Wizard

**Blocked on Phase 2** (`POST /api/import/tally`, `ImportBatch` endpoints). If Phase 2 isn't merged, skip to Batch E and return.

**Files:**
- Create: `src/app/dashboard/imports/page.tsx`
- Create: `src/modules/imports/components/import-wizard.tsx`
- Create: `src/modules/imports/components/upload-step.tsx`
- Create: `src/modules/imports/components/preview-step.tsx`
- Create: `src/modules/imports/components/result-step.tsx`
- Create: `src/modules/imports/components/batch-history.tsx`
- Move/absorb: `src/modules/invoices/components/csv-upload.tsx` and `import-dialog.tsx` (legacy CSV import folds into the wizard; delete the dialog after the wizard ships)
- Test: `e2e/imports.spec.ts`
- Test fixture: reuse `tests/fixtures/tally/*.xml` (Phase 0 Task 9)

**Interfaces:**
- Consumes (Phase 2): `POST /api/import/tally` multipart `{ file, kind: "MASTERS" | "VOUCHERS" }` → `{ batchId }`; `GET /api/import/batches` and `GET /api/import/batches/[id]` → `{ id; source; status: "PREVIEW" | "RUNNING" | "DONE" | "FAILED"; counts: { created; updated; skipped; errored }; records: { row; entity; action; message? }[] }`; `POST /api/import/batches/[id]/commit`; `POST /api/import/batches/[id]/undo`. Poll batch status with TanStack Query `refetchInterval: 2000` while `RUNNING`.
- Produces: route `/dashboard/imports`; the "Import from Tally" quick action target (Task 8).

- [ ] **Step 1: Write the failing spec `e2e/imports.spec.ts`.** Exact assertions:
  - `/dashboard/imports` shows heading "Imports", a stepper with steps `Upload`, `Preview`, `Done`, and a "Batch history" table region;
  - uploading `tests/fixtures/tally/masters-ledgers.xml` (via `setInputFiles`) as kind Masters advances to Preview showing a table with ≥1 row and per-row action badges (`Create`/`Update`/`Skip`/`Error`);
  - a warnings panel is visible when any record has a message (fixture-dependent; assert the panel container `data-testid="import-warnings"` exists);
  - "Commit import" advances to Done showing four count tiles labeled `Created`, `Updated`, `Skipped`, `Errored`;
  - "Download mapping report" triggers a CSV download matching `/import-.*\.csv/` (client `exportCsv` over the records);
  - "Undo batch" shows a destructive confirm; confirming toasts "Batch reverted" and batch history marks the row "Reverted";
  - batch history lists the batch with source `TALLY_MASTERS` and its counts.
- [ ] **Step 2: Run — FAIL. Step 3: Build** the wizard per approved design (single client component with a `step` state machine `upload → preview → done`, file dropzone, preview `DataTable`, count tiles, undo via `ConfirmDialog`); fold CSV invoice import in as a third upload kind hitting the existing CSV endpoint; delete `import-dialog.tsx` and update `invoices/page.tsx` to link "Import" → `/dashboard/imports`.
- [ ] **Step 4: Run spec, all projects — PASS. Step 5: Commit** (`feat: guided imports wizard with preview, commit, undo, and batch history`).

---

## Batch E — Reminders & Settings

### Task 24: Stitch Designs — Reminders + Settings

**Files:**
- Modify: `docs/design/SCREEN_INVENTORY.md`

- [ ] **Step 1:** Generate **Reminders**: org-level sequence editor (steps like "3 days before due — friendly", "+7 overdue — professional", "+14 — firm", add/remove/reorder steps, per-step tone picker and channel toggles Email/WhatsApp), quiet-hours setting, upcoming-reminders queue table (invoice, party, channel icons, scheduled date, Send now / Snooze row actions), and a per-invoice schedule editor panel (reached from invoice detail).
- [ ] **Step 2:** Generate **Settings**: restyled existing settings (org profile, sender identity, reminder defaults, WhatsApp connection status card reading "Connects in Phase 4" until enabled, theme, danger zone) in the new design system.
- [ ] **Step 3:** Iterate; record IDs; commit (`design: Stitch screens for reminders and settings (Batch E)`).

### Task 25: **USER ACTION — Design Review Gate E**

- [ ] **Step 1:** Present Batch E screens; iterate until approved.
- [ ] **Step 2:** Record approval; commit `design: Batch E approved by user`. **No Batch E implementation before this commit.**

### Task 26: Implement Reminders + Settings

**Files:**
- Create: `src/app/dashboard/reminders/page.tsx`
- Create: `src/modules/reminders/components/sequence-editor.tsx`
- Create: `src/modules/reminders/components/reminder-queue.tsx`
- Create: `src/modules/reminders/components/invoice-schedule-editor.tsx` (also embedded in invoice detail as a "Reminders" tab)
- Modify: `src/app/dashboard/settings/page.tsx` (restyle onto new primitives)
- Modify: `src/app/api/reminders/settings/route.ts` + `src/lib/validations/` (extend settings schema additively with `sequence: { offsetDays: number; tone: "FRIENDLY" | "PROFESSIONAL" | "FIRM" | "FINAL"; channels: { email: boolean; whatsapp: boolean } }[]` and `quietHours: { start: string; end: string }`)
- Create: `src/app/api/reminders/route.ts` `GET` (upcoming queue via existing reminder service, org-scoped)
- Test: `e2e/reminders.spec.ts`, `e2e/settings.spec.ts`

**Interfaces:**
- Consumes: existing `GET/PUT /api/reminders/settings`, `POST /api/reminders/trigger`, `POST /api/invoices/[id]/snooze` (Task 11); env flag `NEXT_PUBLIC_WHATSAPP_ENABLED` (default unset → WhatsApp toggles render disabled with tooltip "Available after Phase 4"; Phase 4 flips the flag).
- Produces: sequence/quiet-hours settings shape that Phase 4's scheduler consumes (documented in the validation schema file).

- [ ] **Step 1: Write the failing spec `e2e/reminders.spec.ts`.** Exact assertions:
  - heading "Reminders"; sequence editor shows ≥1 step row with an offset input, tone `Select` (options Friendly/Professional/Firm/Final notice), and Email + WhatsApp switches;
  - WhatsApp switch is disabled and hovering shows tooltip text "Available after Phase 4";
  - "Add step" appends a row; setting offset `21`, tone Firm, then "Save sequence" toasts "Reminder settings saved"; reload preserves the row;
  - upcoming queue table shows the seeded overdue invoice `E2E-INV-002` with a scheduled date and row actions `Send now`, `Snooze`;
  - `Send now` → confirm → toast "Reminder sent" (email path; asserts the trigger endpoint returns 2xx);
  - invoice detail (`E2E-INV-002`) has a "Reminders" tab showing that invoice's schedule with per-step skip toggles.
- [ ] **Step 2: Write the failing spec `e2e/settings.spec.ts`.** Exact assertions:
  - heading "Settings" with sections (accessible headings) `Organization`, `Sender identity`, `Reminder defaults`, `WhatsApp`, `Appearance`;
  - WhatsApp card shows status text "Connects in Phase 4";
  - changing org name and saving toasts "Settings saved" and persists across reload;
  - Appearance section's theme select switches `html` class to `dark`.
- [ ] **Step 3: Run both — FAIL. Step 4: Build:** extend the reminder-settings zod schema + service additively (Vitest for schema defaults/roundtrip); build `sequence-editor` (array field editor over the settings mutation), `reminder-queue` (`DataTable`, actions reuse Task 12 hooks), `invoice-schedule-editor` (per-invoice overrides stored on the existing `Reminder` rows), and restyle `settings/page.tsx` onto `PageHeader`/`Card`/new tokens without changing its API calls.
- [ ] **Step 5: Run both specs, all projects — PASS. Step 6: Commit** (`feat: reminders sequence editor, queue, and restyled settings`).

---

### Task 27: Phase Gate — Full Sweep + Sign-off

**Files:**
- Create: `docs/setup/PHASE-3-GATE.md`
- Modify: `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (tick Phase 3 items)

- [ ] **Step 1: Full e2e sweep:** `npx playwright test` — every spec green on `chromium`, `chromium-dark`, and `mobile`. Fix any failures before proceeding (use `superpowers:systematic-debugging`).
- [ ] **Step 2: Route completeness check:** every sidebar link resolves (no 404): Dashboard, Invoices, Bills, Parties, Stock, Payments, Imports, Reminders, Settings. Verify by clicking through in the running app and via the shell spec.
- [ ] **Step 3: Affordance audit** — walk this checklist against the running app; each item must be a visible button/flow (all were asserted in specs; this is the human double-check): mark paid ✓(T12/13/19), mark partial ✓(T18), send reminder now email ✓(T12/26) / WhatsApp toggle present-disabled ✓(T12/26), snooze ✓(T12/26), write-off ✓(T12/19), duplicate invoice ✓(T12), export CSV ✓(T12/17/19/23), export/download PDF ✓(T13), party statement download ✓(T17).
- [ ] **Step 4: Manual responsive + dark pass:** at 375px and 1440px, light and dark, skim every screen for overflow/contrast bugs; fix inline.
- [ ] **Step 5: Write `docs/setup/PHASE-3-GATE.md`:** status table of Tasks 1–26 (including which design gates were approved and on what date), deferred items (e.g. `moneyToPay` stub if Phase 1's bill service slipped, Imports if Phase 2 slipped), e2e run summary, go/no-go recommendation.
- [ ] **Step 6: USER ACTION — user signs off** (name + date in the gate doc). Per parent plan: the *design* reviews already happened per batch; this gate confirms the implemented product matches them and all smoke tests are green.
- [ ] **Step 7: Commit**

```bash
git add docs/setup/PHASE-3-GATE.md docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md
git commit -m "docs: Phase 3 gate review and sign-off"
```

---

## Self-Review Notes

- **Spec coverage vs parent Phase 3:** (1) design system finalized → Task 3; (2) all listed screens → shell/dashboard T5–8, invoices list/detail/editor T9–14, bills T19, parties/agents+ledger+rollup T17, stock T22, payments record+allocate T18, imports wizard T23, reminders (schedule editor, sequence, tone, channels) + settings T24–26; (3) every mutation affordance → asserted in specs and audited in T27 Step 3; (4) Playwright per screen + responsive + dark → Task 1 projects (`chromium-dark`, `mobile`) run every spec, T27 sweeps. Per-batch USER ACTION design gates → Tasks 6, 10, 16, 21, 25; phase gate → Task 27. Analytics/Assistant screens intentionally excluded (Phases 5/6) with reserved nav slots.
- **Placeholder scan:** later screens carry itemized exact assertions instead of full spec code (per the phase brief) and component specs with exact props/endpoints instead of full JSX — the visual markup is deliberately sourced from the *approved Stitch design* (`mcp__stitch__get_screen`), which is the Stitch-first process, not a placeholder. Shared logic that would otherwise be hand-waved is given as complete code (auth fixture, CSV, money, chips, data table, line-item math, auto-allocate contract, route pattern).
- **Type consistency:** service-first-param `organizationId: string` used everywhere; contract model names (`Party`, `PaymentAllocation`, `CommunicationLog`, …) match the interface contract; `StatusChip` statuses match the Invoice status union incl. `PARTIALLY_PAID`/`WRITTEN_OFF` used in T18's assertion; `exportCsv` defined T12, reused T17/19/23; `party-picker` defined T14, reused (extended, not forked) T19.
- **Blocked-task policy:** Batch D's imports (T23) is the only Phase 2-blocked task and is explicitly skippable/returnable; dashboard's `moneyToPay` has a defined graceful stub recorded at the gate.
