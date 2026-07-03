# Manual Email Compose-Link (Send From Your Own Email) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the signed-in user send a reminder email from their *own* email address with zero setup, by opening a prefilled Gmail/mailto compose window instead of the platform sending it on their behalf.

**Architecture:** Two pure URL-builder functions (`buildGmailComposeUrl`, `buildMailtoUrl`) plus two new buttons in the existing AI reminder preview modal (`src/app/dashboard/invoices/page.tsx`). This is a client-only feature — no server call, no database write, no new environment variables. It mirrors the existing "Send via WhatsApp Web" button in the same modal (`src/app/dashboard/invoices/page.tsx:236-244`), which already opens `https://api.whatsapp.com/send?phone=...&text=...` in a new tab with no backend involvement.

**Tech Stack:** Next.js App Router (client component), TypeScript, Vitest, `lucide-react` icons (already a dependency).

## Global Constraints

- No new npm dependencies.
- No Prisma schema changes — this path is intentionally not logged to `EmailLog`, exactly like the existing WhatsApp Web button isn't. This is a deliberate scope decision (see "Explicitly out of scope" below), not an oversight.
- No new environment variables, no new API routes.
- Follow the existing code style in `src/app/dashboard/invoices/page.tsx` (inline Tailwind, existing `Button` component from `@/components/ui/button`).

**Explicitly out of scope (deferred, revisit only once sending needs to scale beyond one person manually clicking send):**
- OAuth-based per-user automatic sending (Gmail API with stored refresh tokens) — this would let scheduled/automated reminders send from each user's own address unattended. Not built here because it requires a Google Cloud OAuth consent screen, encrypted token storage, and token refresh logic — real scope, deferred until the app needs industrial-scale automated sending per user rather than one person manually dispatching reminders.
- Automated scheduled reminders continue to use the existing shared Gmail SMTP path (`src/lib/email/providers/nodemailer.ts`) unchanged. This plan only adds a manual, human-in-the-loop alternative alongside the existing "Dispatch Now" (platform-sent) button — it does not replace or modify automated sending.

---

### Task 1: Compose-link URL builders

**Files:**
- Create: `src/lib/email/compose-link.ts`
- Test: `tests/unit/lib/email/compose-link.test.ts`

**Interfaces:**
- Produces: `buildGmailComposeUrl(input: ComposeLinkInput): string`, `buildMailtoUrl(input: ComposeLinkInput): string`, `interface ComposeLinkInput { to: string; subject: string; body: string }`. Task 2 consumes both.

- [ ] **Step 1: Write the failing test** `tests/unit/lib/email/compose-link.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildGmailComposeUrl, buildMailtoUrl } from "@/lib/email/compose-link";

describe("compose-link", () => {
  const input = {
    to: "client@example.com",
    subject: "Payment reminder: INV-1",
    body: "Hi there,\n\nYour invoice is overdue.",
  };

  it("builds a Gmail compose URL with encoded params", () => {
    const url = buildGmailComposeUrl(input);
    expect(url).toContain("https://mail.google.com/mail/?view=cm&fs=1");
    expect(url).toContain(`to=${encodeURIComponent(input.to)}`);
    expect(url).toContain(`su=${encodeURIComponent(input.subject)}`);
    expect(url).toContain(`body=${encodeURIComponent(input.body)}`);
  });

  it("builds a mailto URL with encoded subject and body", () => {
    const url = buildMailtoUrl(input);
    expect(url).toBe(
      `mailto:${input.to}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(input.body)}`,
    );
  });

  it("safely encodes special characters (&, newlines)", () => {
    const special = { to: "a@b.co", subject: "Invoice & Reminder", body: "Line1\nLine2" };
    const gmailUrl = buildGmailComposeUrl(special);
    expect(gmailUrl).toContain(encodeURIComponent("Invoice & Reminder"));
    expect(gmailUrl).toContain(encodeURIComponent("Line1\nLine2"));

    const mailtoUrl = buildMailtoUrl(special);
    expect(mailtoUrl).toContain(encodeURIComponent("Invoice & Reminder"));
    expect(mailtoUrl).toContain(encodeURIComponent("Line1\nLine2"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/email/compose-link.test.ts`
Expected: FAIL — cannot resolve `@/lib/email/compose-link`.

- [ ] **Step 3: Implement** `src/lib/email/compose-link.ts`:

```ts
export interface ComposeLinkInput {
  to: string;
  subject: string;
  body: string;
}

/** Opens Gmail's web compose UI prefilled — reliable for Gmail users regardless of OS default mail handler. */
export function buildGmailComposeUrl({ to, subject, body }: ComposeLinkInput): string {
  const params = [
    "view=cm",
    "fs=1",
    `to=${encodeURIComponent(to)}`,
    `su=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ].join("&");
  return `https://mail.google.com/mail/?${params}`;
}

/** Opens the OS/browser default mail client — works for any provider, but requires one to be configured as default. */
export function buildMailtoUrl({ to, subject, body }: ComposeLinkInput): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/email/compose-link.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/compose-link.ts tests/unit/lib/email/compose-link.test.ts
git commit -m "feat: add Gmail/mailto compose-link URL builders"
```

---

### Task 2: Wire "Open in Gmail" / "Open in Mail App" buttons into the reminder preview modal

**Files:**
- Modify: `src/app/dashboard/invoices/page.tsx`
- Modify: `docs/superpowers/plans/2026-07-03-phase-4-communications.md` (add a note under Task 3, see Step 4 below)

**Interfaces:**
- Consumes: `buildGmailComposeUrl`, `buildMailtoUrl` (Task 1); existing `preview` state of type `GenerateEmailResult & { invoiceId: string }` (`src/types/index.ts:57`); existing `invoices` array (each item typed `InvoiceDto`, has `.clientEmail`).

- [ ] **Step 1: Import the builders and lucide icon.** In `src/app/dashboard/invoices/page.tsx`, change:

```ts
import { Send, X } from "lucide-react";
```

to:

```ts
import { Send, X, Mail } from "lucide-react";
```

and add near the top with the other imports:

```ts
import { buildGmailComposeUrl, buildMailtoUrl } from "@/lib/email/compose-link";
```

- [ ] **Step 2: Compute the compose URLs.** Inside the `{preview && (() => { ... })()}` IIFE in `src/app/dashboard/invoices/page.tsx` (around line 148-154, right after the existing `waUrl` computation), add:

```ts
const selectedInvoice = invoices.find((inv) => inv.id === preview.invoiceId);
const clientPhone = selectedInvoice?.clientPhone;
const waUrl =
  clientPhone && preview.whatsappText
    ? `https://api.whatsapp.com/send?phone=${encodeURIComponent(clientPhone)}&text=${encodeURIComponent(preview.whatsappText)}`
    : null;
const gmailUrl = selectedInvoice
  ? buildGmailComposeUrl({
      to: selectedInvoice.clientEmail,
      subject: preview.subject,
      body: preview.bodyText,
    })
  : null;
const mailtoUrl = selectedInvoice
  ? buildMailtoUrl({
      to: selectedInvoice.clientEmail,
      subject: preview.subject,
      body: preview.bodyText,
    })
  : null;
```

(The first three lines already exist — only `gmailUrl`/`mailtoUrl` are new.)

- [ ] **Step 3: Add the buttons.** In the Modal Footer's button group (around line 235-260), the existing WhatsApp button looks like:

```tsx
<div className="flex gap-3">
  {waUrl && (
    <Button
      variant="outline"
      onClick={() => window.open(waUrl, "_blank")}
      className="gap-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
    >
      Send via WhatsApp Web
    </Button>
  )}
  <Button variant="outline" onClick={() => setPreview(null)} disabled={sendEmail.isPending}>
    Close
  </Button>
  <Button onClick={() => sendEmail.mutate()} disabled={sendEmail.isPending} className="gap-2">
    <Send className="h-4 w-4" />
    {sendEmail.isPending ? "Sending..." : "Dispatch Now"}
  </Button>
</div>
```

Add two new buttons directly after the WhatsApp one (only shown on the "email" tab, since they send email, not WhatsApp):

```tsx
<div className="flex gap-3">
  {waUrl && (
    <Button
      variant="outline"
      onClick={() => window.open(waUrl, "_blank")}
      className="gap-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
    >
      Send via WhatsApp Web
    </Button>
  )}
  {previewTab === "email" && gmailUrl && (
    <Button
      variant="outline"
      onClick={() => window.open(gmailUrl, "_blank")}
      className="gap-2"
    >
      <Mail className="h-4 w-4" />
      Open in Gmail
    </Button>
  )}
  {previewTab === "email" && mailtoUrl && (
    <Button variant="outline" asChild className="gap-2">
      <a href={mailtoUrl}>
        <Mail className="h-4 w-4" />
        Open in Mail App
      </a>
    </Button>
  )}
  <Button variant="outline" onClick={() => setPreview(null)} disabled={sendEmail.isPending}>
    Close
  </Button>
  <Button onClick={() => sendEmail.mutate()} disabled={sendEmail.isPending} className="gap-2">
    <Send className="h-4 w-4" />
    {sendEmail.isPending ? "Sending..." : "Dispatch Now"}
  </Button>
</div>
```

Note: `Button` (`@/components/ui/button`) is a shadcn/Radix `Slot`-based component and already supports `asChild` — verify by checking `src/components/ui/button.tsx` exports a `Slot`-wrapped variant before this step; if `asChild` isn't supported, use a plain `<a>` styled with the same classes the `Button` component applies instead.

- [ ] **Step 4: Document the deferred OAuth path.** Append this note to `docs/superpowers/plans/2026-07-03-phase-4-communications.md` directly after the `### Task 3: Resend email provider` heading (before its **Files:** block):

```markdown
**Note (2026-07-04):** a manual, zero-setup alternative to server-side sending was added outside this task list — see `docs/superpowers/plans/2026-07-04-manual-email-compose-link.md`. It opens a prefilled Gmail/mailto compose window so the signed-in user can send from their own address with one click, with no OAuth or credential storage. True per-user *automated* sending (OAuth + Gmail API + token storage) remains deferred until automated reminders need to scale beyond the shared SMTP sender used today.
```

- [ ] **Step 5: Manual verification.** Run `npm run dev`, open an invoice's "Generate Email" preview, confirm on the "Email Template" tab you see three buttons: "Open in Gmail", "Open in Mail App", "Close", "Dispatch Now" (plus "Send via WhatsApp Web" if the invoice has a phone number). Click "Open in Gmail" — verify a new tab opens Gmail's compose UI with the recipient, subject, and body prefilled correctly (including any line breaks). Click "Open in Mail App" — verify your OS's default mail client (or a permission prompt) opens with the same content.

- [ ] **Step 6: Run full test suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/invoices/page.tsx docs/superpowers/plans/2026-07-03-phase-4-communications.md
git commit -m "feat: add manual Gmail/mailto compose-link buttons to reminder preview"
```

---

## Self-Review Notes

- **Spec coverage:** "user doesn't have to do anything" → satisfied, zero setup, no credentials (Task 1+2). "draft an email and give it to the user, open Gmail compose" → satisfied exactly (Task 2, "Open in Gmail" button). Hybrid requirement (manual compose-link now, automated OAuth sending deferred to a later "industrial scale" phase) → satisfied: automated reminders untouched, OAuth path explicitly documented as deferred (Global Constraints + Task 2 Step 4).
- **Placeholder scan:** no TBD/TODO markers; every step has literal code or an exact command with expected output.
- **Type consistency:** `ComposeLinkInput` used identically in both builder functions (Task 1) and both call sites (Task 2); `GenerateEmailResult`/`InvoiceDto` field names (`subject`, `bodyText`, `clientEmail`) match the actual types in `src/types/index.ts` — verified by reading the file directly, not assumed.
