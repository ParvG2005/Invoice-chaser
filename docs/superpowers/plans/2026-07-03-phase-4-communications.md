# Phase 4: Communications — Email + WhatsApp Side by Side — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent plan:** `docs/superpowers/plans/2026-07-03-invoice-chaser-state-of-the-art.md` (read its Phase 4 section and Global Constraints before starting).

**Goal:** A channel-abstracted dunning engine that sends reminders over email (Resend) and WhatsApp (Meta Cloud API) in parallel, with delivery webhooks, per-party channel preferences, quiet hours, a configurable escalation sequence, opt-out handling, payment-link blocks, and an automatic thank-you on payment.

**Architecture:** One `ChannelProvider` interface with two implementations (Resend, WhatsApp Cloud API), selected via a registry that mirrors the existing `getEmailProvider`/`setEmailProvider` injection pattern. All outbound/inbound traffic is recorded in `CommunicationLog` (created in Phase 1 per master plan §0.3) by a new `communication.service`, which the existing reminder engine and Phase 6's assistant tools call. Webhooks land at `/api/webhooks/resend` and `/api/webhooks/whatsapp` (paths reserved in Phase 0 Task 6) and update `CommunicationLog` by `providerId`. Existing layering preserved: `app/api` route → `lib/api/handler` → `server/services` → `server/repositories` → Prisma (webhook routes skip the auth handler — they authenticate by provider signature instead).

**Tech Stack:** Next.js App Router route handlers, Prisma, Inngest (existing `src/lib/jobs`), Resend REST API, Meta WhatsApp Cloud API (Graph API v20.0), Vitest (installed in Phase 1), Node `crypto` for webhook signatures, `date-fns` (already a dependency).

## Global Constraints

(Copied from parent plan; every task implicitly includes these.)

- Version floors: Node >= 26 (LTS), Next.js >= 16.2, React >= 19.2, TypeScript >= 6.0, Prisma >= 7.8, Tailwind >= 4.3. Keep dependencies on latest stable at phase start.
- Multi-tenant: every new table carries `organization_id`; every query is org-scoped at the repository layer. No cross-org data access, ever. (Webhook ingress resolves the org from the stored `providerId` / party phone — never from payload claims.)
- All money columns `Decimal(12,2)`; currency INR-first but stored with a `currency` code.
- Soft deletes (`deleted_at`) on all business entities.
- Existing layered convention preserved: `app/api` route → `lib/api/handler` → `server/services` → `server/repositories` → Prisma.
- Secrets only in env vars / provider credential stores; never in code, prompts, or logs.
- TDD for all service/parser/tool code.
- All mutating service methods wrapped with Phase 1's `withAudit`.

## Cross-Phase Interface Contract

**Consumes (produced by Phase 1 — verify these exist before starting; if a field is missing, stop and reconcile with the Phase 1 plan rather than inventing a substitute):**

- `prisma/schema.prisma` models per master plan §0.3:
  - `CommunicationLog`: `id`, `organizationId`, `channel` (enum `Channel`), `to`, `templateId String?`, `status` (enum `CommunicationStatus`: `QUEUED/SENT/DELIVERED/READ/FAILED/BOUNCED`), `providerId String?`, `invoiceId String?`, `reminderId String?`, `createdAt`. (Task 1 extends it with direction/body/timestamps.)
  - `Party`: `id`, `organizationId`, `name`, `email String?`, `phone String?`, `whatsapp String?`, `deletedAt`. (Task 1 adds opt-out + preferred-channel fields.)
  - `AuditLog` + `src/server/services/audit.service.ts` exporting `withAudit(actor: AuditActor, action: string, entity: { type: string; id: string }, fn: () => Promise<T>): Promise<T>` where `AuditActor = { type: "USER" | "ASSISTANT" | "SYSTEM"; id: string | null }`.
  - `src/server/services/party.service.ts` (all methods take `organizationId: string` first).
- Vitest test infrastructure (Phase 1): `npx vitest run <path>` works; tests live under `tests/unit/`.
- `Invoice.partyId String?` (Phase 1 backfill). Legacy `clientEmail`/`clientPhone` still present — this phase falls back to them when `partyId` is null.

**Produces (Phase 6's assistant tools `send_reminder` / `draft_whatsapp` and Phase 3's UI depend on these exact names):**

- `src/lib/channels/channel-provider.ts`:
  ```ts
  export type Channel = "EMAIL" | "WHATSAPP";
  export interface OutboundMessage {
    channel: Channel;
    to: string;                    // email address or E.164 phone
    subject?: string;              // EMAIL only
    bodyHtml?: string;             // EMAIL only
    bodyText?: string;             // EMAIL plaintext alt / WHATSAPP session text
    templateId?: string;           // WHATSAPP approved template name
    templateParams?: string[];     // ordered template body params {{1}}..{{n}}
    replyTo?: string;
  }
  export interface SendResult { providerId: string; success: boolean; error?: string; }
  export interface ChannelProvider {
    readonly name: string;
    readonly channel: Channel;
    send(msg: OutboundMessage): Promise<SendResult>;
  }
  ```
- `src/lib/channels/registry.ts`: `getChannelProvider(channel: Channel): ChannelProvider`, `setChannelProvider(channel: Channel, provider: ChannelProvider): void` (test injection).
- `src/lib/channels/resend-provider.ts`: `class ResendEmailProvider implements ChannelProvider`, `createResendProvider(): ResendEmailProvider`.
- `src/lib/channels/whatsapp-provider.ts`: `class WhatsAppCloudProvider implements ChannelProvider`, `createWhatsAppProvider(): WhatsAppCloudProvider`, `WHATSAPP_TEMPLATE_BY_TONE: Record<EmailTone, string>`.
- `src/server/services/communication.service.ts` — `communicationService` with:
  ```ts
  sendOutbound(organizationId: string, actor: AuditActor, input: SendOutboundInput): Promise<SendOutboundResult>
  handleProviderStatus(channel: Channel, providerId: string, status: CommunicationStatus, occurredAt: Date, errorMessage?: string): Promise<{ updated: boolean }>
  recordInbound(input: InboundMessageInput): Promise<{ logId: string | null; optOut: boolean }>
  setOptOut(organizationId: string, actor: AuditActor, partyId: string, channel: Channel, optedOut: boolean): Promise<void>
  listForInvoice(organizationId: string, invoiceId: string): Promise<CommunicationLogDto[]>
  resolveChannels(settings: ChannelSettings, party: PartyChannelInfo | null, contact: { email: string | null; phone: string | null }): Channel[]
  sendPaidThankYou(organizationId: string, invoiceId: string): Promise<{ sent: Channel[] }>
  ```
  with types `SendOutboundInput`, `SendOutboundResult`, `InboundMessageInput`, `ChannelSettings`, `PartyChannelInfo` defined in Task 5 and `CommunicationLogDto` in `src/types/index.ts`.
- Webhook routes: `src/app/api/webhooks/resend/route.ts` (POST), `src/app/api/webhooks/whatsapp/route.ts` (GET verify + POST).
- New env vars (add to `docs/ENVIRONMENT.md` + `.env.example` in the task that introduces each): `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`).

**WhatsApp template names** (drafted/submitted in Phase 0 Task 6, `docs/setup/WHATSAPP_TEMPLATES.md`): `payment_reminder_friendly`, `payment_reminder_professional`, `payment_reminder_firm`, `payment_received_thank_you`. Body params, in order: `{{1}} party_name, {{2}} invoice_number, {{3}} amount, {{4}} due_date, {{5}} payment_link` (thank-you template uses params 1–3 only). `FINAL_NOTICE` tone reuses `payment_reminder_firm` until a dedicated final-notice template is approved (tracked in Task 12).

---

### Task 1: Schema — channels, quiet hours, escalation, opt-out

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/validations/reminder.ts`
- Modify: `src/types/index.ts` (`ReminderSettingsDto`, add `CommunicationLogDto`)
- Create: `prisma/migrations/*_phase4_communications/migration.sql` (generated)

**Interfaces:**
- Consumes: Phase 1 models `CommunicationLog`, `Party`, enums `Channel`? — **Note:** if Phase 1 already defined a `Channel` or `CommunicationStatus` enum, reuse theirs and skip the duplicate definition below.
- Produces: enum `Channel { EMAIL WHATSAPP }`, enum `CommunicationDirection { OUTBOUND INBOUND }`, `EmailTone.FINAL_NOTICE`; `CommunicationLog` fields `direction`, `subject`, `body`, `errorMessage`, `partyId`, `sentAt`, `deliveredAt`, `readAt`; `ReminderSettings` fields `enabledChannels Channel[]`, `quietHoursStart String?`, `quietHoursEnd String?`, `timezone String`, `escalationTones EmailTone[]`, `upiId String?`, `paymentLink String?`; `Party` fields `preferredChannels Channel[]`, `emailOptOutAt DateTime?`, `whatsappOptOutAt DateTime?`.

- [ ] **Step 1: Edit `prisma/schema.prisma`.** Add/extend (adjust only if Phase 1 already created an identical enum — then reuse it):

```prisma
enum Channel {
  EMAIL
  WHATSAPP
}

enum CommunicationDirection {
  OUTBOUND
  INBOUND
}
```

Extend `EmailTone`:

```prisma
enum EmailTone {
  FRIENDLY
  PROFESSIONAL
  FIRM
  FINAL_NOTICE
}
```

Add to the Phase-1 `CommunicationLog` model (keep its existing fields untouched):

```prisma
  direction    CommunicationDirection @default(OUTBOUND)
  subject      String?
  body         String?                @db.Text
  errorMessage String?                @map("error_message")
  partyId      String?                @map("party_id")
  sentAt       DateTime?              @map("sent_at")
  deliveredAt  DateTime?              @map("delivered_at")
  readAt       DateTime?              @map("read_at")

  @@index([providerId])
  @@index([invoiceId, createdAt])
```

Add to `ReminderSettings`:

```prisma
  enabledChannels Channel[]   @default([EMAIL]) @map("enabled_channels")
  quietHoursStart String?     @map("quiet_hours_start") // "HH:mm" in org timezone
  quietHoursEnd   String?     @map("quiet_hours_end")
  timezone        String      @default("Asia/Kolkata")
  escalationTones EmailTone[] @default([FRIENDLY, PROFESSIONAL, FIRM, FINAL_NOTICE]) @map("escalation_tones")
  upiId           String?     @map("upi_id")
  paymentLink     String?     @map("payment_link")
```

Add to `Party`:

```prisma
  preferredChannels Channel[] @default([]) @map("preferred_channels") // empty = inherit org enabledChannels
  emailOptOutAt     DateTime? @map("email_opt_out_at")
  whatsappOptOutAt  DateTime? @map("whatsapp_opt_out_at")
```

- [ ] **Step 2: Generate the migration:**

Run: `npx prisma migrate dev --name phase4_communications`
Expected: migration created and applied; `npx prisma generate` succeeds.

- [ ] **Step 3: Seed `enabledChannels` from the legacy flag.** Append to the generated `migration.sql` (then re-apply with `npx prisma migrate dev`):

```sql
UPDATE "reminder_settings"
SET "enabled_channels" = ARRAY['EMAIL','WHATSAPP']::"Channel"[]
WHERE "whatsapp_enabled" = true;
```

- [ ] **Step 4: Update `src/lib/validations/reminder.ts`:**

```ts
import { z } from "zod";

export const emailToneSchema = z.enum(["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"]);
export const channelSchema = z.enum(["EMAIL", "WHATSAPP"]);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

export const reminderSettingsSchema = z.object({
  reminderDays: z.array(z.number().int().min(0).max(90)).min(1).max(10),
  emailTone: emailToneSchema,
  autoSend: z.boolean(),
  whatsappEnabled: z.boolean(), // legacy, kept for old clients; enabledChannels wins
  enabledChannels: z.array(channelSchema).min(1),
  quietHoursStart: hhmm.nullable(),
  quietHoursEnd: hhmm.nullable(),
  timezone: z.string().min(1),
  escalationTones: z.array(emailToneSchema).min(1).max(10),
  upiId: z.string().max(100).nullable(),
  paymentLink: z.string().url().nullable(),
});

export const generateEmailSchema = z.object({
  invoiceId: z.string().uuid(),
  tone: emailToneSchema.optional(),
});

export type ReminderSettingsInput = z.infer<typeof reminderSettingsSchema>;
```

- [ ] **Step 5: Update `src/types/index.ts`.** Extend `ReminderSettingsDto` and add `CommunicationLogDto`:

```ts
export interface ReminderSettingsDto {
  reminderDays: number[];
  emailTone: EmailTone;
  autoSend: boolean;
  whatsappEnabled: boolean; // legacy mirror of enabledChannels.includes("WHATSAPP")
  enabledChannels: Channel[];
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  escalationTones: EmailTone[];
  upiId: string | null;
  paymentLink: string | null;
}

export type Channel = "EMAIL" | "WHATSAPP";
export type CommunicationStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "BOUNCED";

export interface CommunicationLogDto {
  id: string;
  channel: Channel;
  direction: "OUTBOUND" | "INBOUND";
  to: string;
  subject: string | null;
  body: string | null;
  templateId: string | null;
  status: CommunicationStatus;
  providerId: string | null;
  invoiceId: string | null;
  reminderId: string | null;
  partyId: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
}
```

(If `EmailTone` here is imported from `@prisma/client`, nothing else changes; if it is a local union type, add `"FINAL_NOTICE"` to it.)

- [ ] **Step 6: Typecheck** — Run: `npm run typecheck`. Expected: failures only in files this plan rewrites later (e.g. settings service mapping); fix `reminder.service.ts` `getSettings`/`updateSettings` now with defaults:

```ts
  async getSettings(organizationId: string): Promise<ReminderSettingsDto> {
    const settings = await reminderRepository.getSettings(organizationId);
    const enabledChannels = settings?.enabledChannels?.length ? settings.enabledChannels : ["EMAIL" as const];
    return {
      reminderDays: settings?.reminderDays ?? [3, 7, 14],
      emailTone: settings?.emailTone ?? "PROFESSIONAL",
      autoSend: settings?.autoSend ?? true,
      whatsappEnabled: enabledChannels.includes("WHATSAPP"),
      enabledChannels,
      quietHoursStart: settings?.quietHoursStart ?? null,
      quietHoursEnd: settings?.quietHoursEnd ?? null,
      timezone: settings?.timezone ?? "Asia/Kolkata",
      escalationTones: settings?.escalationTones?.length
        ? settings.escalationTones
        : ["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"],
      upiId: settings?.upiId ?? null,
      paymentLink: settings?.paymentLink ?? null,
    };
  },
```

(`updateSettings` passes the whole validated input through to `reminderRepository.upsertSettings` and returns via `getSettings`; keep `whatsappEnabled` written as `input.enabledChannels.includes("WHATSAPP")` so the legacy column stays consistent.)

- [ ] **Step 7: Commit**

```bash
git add prisma/ src/lib/validations/reminder.ts src/types/index.ts src/server/services/reminder.service.ts
git commit -m "feat(phase4): schema for channels, quiet hours, escalation, opt-out"
```

---

### Task 2: `ChannelProvider` interface + registry

**Files:**
- Create: `src/lib/channels/channel-provider.ts`
- Create: `src/lib/channels/registry.ts`
- Test: `tests/unit/channels/registry.test.ts`

**Interfaces:**
- Produces: the contract types from the header (`Channel`, `OutboundMessage`, `SendResult`, `ChannelProvider`) and `getChannelProvider`/`setChannelProvider`. Tasks 3–5 and 7 consume these.

- [ ] **Step 1: Write the failing test** `tests/unit/channels/registry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { setChannelProvider, getChannelProvider, resetChannelProviders } from "@/lib/channels/registry";
import type { ChannelProvider, OutboundMessage, SendResult } from "@/lib/channels/channel-provider";

const mockProvider = (channel: "EMAIL" | "WHATSAPP"): ChannelProvider => ({
  name: `mock-${channel.toLowerCase()}`,
  channel,
  async send(_msg: OutboundMessage): Promise<SendResult> {
    return { providerId: "mock-1", success: true };
  },
});

describe("channel registry", () => {
  beforeEach(() => resetChannelProviders());

  it("returns an injected provider for its channel", async () => {
    setChannelProvider("EMAIL", mockProvider("EMAIL"));
    const p = getChannelProvider("EMAIL");
    expect(p.channel).toBe("EMAIL");
    await expect(p.send({ channel: "EMAIL", to: "a@b.co" })).resolves.toEqual({
      providerId: "mock-1",
      success: true,
    });
  });

  it("keeps providers independent per channel", () => {
    setChannelProvider("EMAIL", mockProvider("EMAIL"));
    setChannelProvider("WHATSAPP", mockProvider("WHATSAPP"));
    expect(getChannelProvider("WHATSAPP").name).toBe("mock-whatsapp");
    expect(getChannelProvider("EMAIL").name).toBe("mock-email");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/channels/registry.test.ts`
Expected: FAIL — cannot resolve `@/lib/channels/registry`.

- [ ] **Step 3: Implement** `src/lib/channels/channel-provider.ts`:

```ts
export type Channel = "EMAIL" | "WHATSAPP";

export interface OutboundMessage {
  channel: Channel;
  to: string;                // email address or E.164 phone
  subject?: string;          // EMAIL only
  bodyHtml?: string;         // EMAIL only
  bodyText?: string;         // EMAIL plaintext alt / WHATSAPP session text
  templateId?: string;       // WHATSAPP approved template name
  templateParams?: string[]; // ordered template body params {{1}}..{{n}}
  replyTo?: string;
}

export interface SendResult {
  providerId: string;
  success: boolean;
  error?: string;
}

export interface ChannelProvider {
  readonly name: string;
  readonly channel: Channel;
  send(msg: OutboundMessage): Promise<SendResult>;
}
```

and `src/lib/channels/registry.ts` (lazy defaults arrive in Tasks 3–4; for now only injection):

```ts
import type { Channel, ChannelProvider } from "@/lib/channels/channel-provider";

const providers = new Map<Channel, ChannelProvider>();

export function setChannelProvider(channel: Channel, provider: ChannelProvider): void {
  providers.set(channel, provider);
}

export function resetChannelProviders(): void {
  providers.clear();
}

export function getChannelProvider(channel: Channel): ChannelProvider {
  const existing = providers.get(channel);
  if (existing) return existing;
  const created = createDefaultProvider(channel);
  providers.set(channel, created);
  return created;
}

// Replaced with real factories in Tasks 3 and 4.
function createDefaultProvider(channel: Channel): ChannelProvider {
  throw new Error(`No provider registered for channel ${channel}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/channels/registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/channels tests/unit/channels/registry.test.ts
git commit -m "feat(phase4): ChannelProvider interface and provider registry"
```

---

### Task 3: Resend email provider (refactor email onto `ChannelProvider`)

**Files:**
- Create: `src/lib/channels/resend-provider.ts`
- Modify: `src/lib/channels/registry.ts` (real EMAIL factory + nodemailer fallback)
- Test: `tests/unit/channels/resend-provider.test.ts`

**Interfaces:**
- Consumes: `ChannelProvider` types (Task 2); existing `getEmailProvider()` from `src/lib/email` (nodemailer fallback when `RESEND_API_KEY` unset).
- Produces: `class ResendEmailProvider implements ChannelProvider`, `createResendProvider(): ResendEmailProvider`. Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

- [ ] **Step 1: Write the failing test** `tests/unit/channels/resend-provider.test.ts` (mock provider HTTP with a stubbed global `fetch`):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ResendEmailProvider } from "@/lib/channels/resend-provider";

describe("ResendEmailProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const provider = new ResendEmailProvider("re_test_key", "InvoicePilot <billing@example.com>");

  it("POSTs to the Resend API and returns the message id", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "re_msg_123" }), { status: 200 }),
    );

    const result = await provider.send({
      channel: "EMAIL",
      to: "client@example.com",
      subject: "Payment reminder",
      bodyHtml: "<p>Hi</p>",
      bodyText: "Hi",
    });

    expect(result).toEqual({ providerId: "re_msg_123", success: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body)).toMatchObject({
      from: "InvoicePilot <billing@example.com>",
      to: ["client@example.com"],
      subject: "Payment reminder",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });

  it("throws with the API error body on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid `to`" }), { status: 422 }),
    );
    await expect(
      provider.send({ channel: "EMAIL", to: "bad", subject: "x", bodyHtml: "<p>x</p>" }),
    ).rejects.toThrow(/Resend API error 422/);
  });

  it("rejects a message missing subject or html", async () => {
    await expect(provider.send({ channel: "EMAIL", to: "a@b.co" })).rejects.toThrow(
      /subject and bodyHtml are required/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/channels/resend-provider.test.ts`
Expected: FAIL — cannot resolve `@/lib/channels/resend-provider`.

- [ ] **Step 3: Implement** `src/lib/channels/resend-provider.ts`:

```ts
import { createLogger } from "@/lib/logger";
import type { ChannelProvider, OutboundMessage, SendResult } from "@/lib/channels/channel-provider";

const log = createLogger("resend-provider");

export class ResendEmailProvider implements ChannelProvider {
  readonly name = "resend";
  readonly channel = "EMAIL" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    if (!msg.subject || !msg.bodyHtml) {
      throw new Error("EMAIL messages require subject and bodyHtml are required");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [msg.to],
        subject: msg.subject,
        html: msg.bodyHtml,
        text: msg.bodyText,
        reply_to: msg.replyTo,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      log.error("Resend send failed", { status: response.status });
      throw new Error(`Resend API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as { id?: string };
    return { providerId: data.id ?? "unknown", success: true };
  }
}

export function createResendProvider(): ResendEmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ??
    process.env.SMTP_FROM_EMAIL ??
    "InvoicePilot <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  return new ResendEmailProvider(apiKey, fromEmail);
}
```

- [ ] **Step 4: Wire the EMAIL factory in `src/lib/channels/registry.ts`** — replace `createDefaultProvider` with:

```ts
import { createResendProvider } from "@/lib/channels/resend-provider";
import { getEmailProvider } from "@/lib/email";
import type { OutboundMessage, SendResult } from "@/lib/channels/channel-provider";

function createDefaultProvider(channel: Channel): ChannelProvider {
  if (channel === "EMAIL") {
    if (process.env.RESEND_API_KEY) return createResendProvider();
    return createLegacySmtpAdapter(); // dev fallback until Resend is configured
  }
  throw new Error(`No provider registered for channel ${channel}`);
}

/** Adapts the legacy nodemailer EmailProvider to ChannelProvider for local dev. */
function createLegacySmtpAdapter(): ChannelProvider {
  return {
    name: "smtp-legacy",
    channel: "EMAIL",
    async send(msg: OutboundMessage): Promise<SendResult> {
      if (!msg.subject || !msg.bodyHtml) {
        throw new Error("EMAIL messages require subject and bodyHtml are required");
      }
      const result = await getEmailProvider().send({
        to: msg.to,
        subject: msg.subject,
        html: msg.bodyHtml,
        text: msg.bodyText,
        replyTo: msg.replyTo,
      });
      return { providerId: result.id, success: result.success };
    },
  };
}
```

(Note: `resend-provider.ts` uses raw `fetch` against the Resend REST API rather than the `resend` npm SDK so unit tests mock the HTTP boundary directly, per the phase contract.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/unit/channels && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Record env vars** — add `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` rows to `docs/ENVIRONMENT.md` and names to `.env.example` (values blank).

- [ ] **Step 7: Commit**

```bash
git add src/lib/channels tests/unit/channels docs/ENVIRONMENT.md .env.example
git commit -m "feat(phase4): Resend ChannelProvider with SMTP dev fallback"
```

---

### Task 4: WhatsApp Cloud API provider

**Files:**
- Create: `src/lib/channels/whatsapp-provider.ts`
- Modify: `src/lib/channels/registry.ts` (WHATSAPP factory)
- Test: `tests/unit/channels/whatsapp-provider.test.ts`

**Interfaces:**
- Consumes: `ChannelProvider` types (Task 2).
- Produces: `class WhatsAppCloudProvider implements ChannelProvider`, `createWhatsAppProvider()`, `WHATSAPP_TEMPLATE_BY_TONE: Record<EmailTone, string>`. Env: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_LANGUAGE`.

- [ ] **Step 1: Write the failing test** `tests/unit/channels/whatsapp-provider.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WhatsAppCloudProvider, WHATSAPP_TEMPLATE_BY_TONE } from "@/lib/channels/whatsapp-provider";

describe("WhatsAppCloudProvider", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const provider = new WhatsAppCloudProvider("123456789", "test-token", "en");

  it("sends a template message with ordered body params", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [{ id: "wamid.ABC" }] }), { status: 200 }),
    );

    const result = await provider.send({
      channel: "WHATSAPP",
      to: "+919876543210",
      templateId: "payment_reminder_friendly",
      templateParams: ["Acme Traders", "INV-042", "₹18,500.00", "28 Jun 2026", "https://pay.example/inv042"],
    });

    expect(result).toEqual({ providerId: "wamid.ABC", success: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v20.0/123456789/messages");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "template",
      template: {
        name: "payment_reminder_friendly",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Acme Traders" },
              { type: "text", text: "INV-042" },
              { type: "text", text: "₹18,500.00" },
              { type: "text", text: "28 Jun 2026" },
              { type: "text", text: "https://pay.example/inv042" },
            ],
          },
        ],
      },
    });
  });

  it("sends a session text message when no templateId is given", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [{ id: "wamid.DEF" }] }), { status: 200 }),
    );
    const result = await provider.send({
      channel: "WHATSAPP",
      to: "919876543210",
      bodyText: "Thanks, we received your message.",
    });
    expect(result.providerId).toBe("wamid.DEF");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "text",
      text: { body: "Thanks, we received your message." },
    });
  });

  it("throws with the Graph error body on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Template not found" } }), { status: 400 }),
    );
    await expect(
      provider.send({ channel: "WHATSAPP", to: "919876543210", templateId: "nope", templateParams: [] }),
    ).rejects.toThrow(/WhatsApp API error 400/);
  });

  it("maps every EmailTone to an approved template name", () => {
    expect(WHATSAPP_TEMPLATE_BY_TONE).toEqual({
      FRIENDLY: "payment_reminder_friendly",
      PROFESSIONAL: "payment_reminder_professional",
      FIRM: "payment_reminder_firm",
      FINAL_NOTICE: "payment_reminder_firm",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/channels/whatsapp-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `src/lib/channels/whatsapp-provider.ts`:

```ts
import type { EmailTone } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import type { ChannelProvider, OutboundMessage, SendResult } from "@/lib/channels/channel-provider";

const log = createLogger("whatsapp-provider");

/** Approved template names from docs/setup/WHATSAPP_TEMPLATES.md (Phase 0 Task 6).
 *  FINAL_NOTICE reuses the firm template until a dedicated one is approved. */
export const WHATSAPP_TEMPLATE_BY_TONE: Record<EmailTone, string> = {
  FRIENDLY: "payment_reminder_friendly",
  PROFESSIONAL: "payment_reminder_professional",
  FIRM: "payment_reminder_firm",
  FINAL_NOTICE: "payment_reminder_firm",
};

export const WHATSAPP_THANK_YOU_TEMPLATE = "payment_received_thank_you";

/** Cloud API wants digits only (E.164 without the +). */
function normalizePhone(to: string): string {
  return to.replace(/[^\d]/g, "");
}

export class WhatsAppCloudProvider implements ChannelProvider {
  readonly name = "whatsapp-cloud";
  readonly channel = "WHATSAPP" as const;

  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly templateLanguage: string,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const payload = msg.templateId
      ? {
          messaging_product: "whatsapp",
          to: normalizePhone(msg.to),
          type: "template",
          template: {
            name: msg.templateId,
            language: { code: this.templateLanguage },
            components: [
              {
                type: "body",
                parameters: (msg.templateParams ?? []).map((text) => ({ type: "text", text })),
              },
            ],
          },
        }
      : {
          messaging_product: "whatsapp",
          to: normalizePhone(msg.to),
          type: "text",
          text: { body: msg.bodyText ?? "" },
        };

    const response = await fetch(
      `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      log.error("WhatsApp send failed", { status: response.status });
      throw new Error(`WhatsApp API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as { messages?: { id: string }[] };
    return { providerId: data.messages?.[0]?.id ?? "unknown", success: true };
  }
}

export function createWhatsAppProvider(): WhatsAppCloudProvider {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en";
  if (!phoneNumberId || !accessToken) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN are not configured");
  }
  return new WhatsAppCloudProvider(phoneNumberId, accessToken, language);
}
```

- [ ] **Step 4: Wire the WHATSAPP factory** in `registry.ts` `createDefaultProvider`:

```ts
  if (channel === "WHATSAPP") return createWhatsAppProvider();
```

(import `createWhatsAppProvider` at top; remove the trailing `throw` only if unreachable — keep it as the default case).

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/unit/channels && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Record env vars** — add `WHATSAPP_APP_SECRET` and `WHATSAPP_TEMPLATE_LANGUAGE` to `docs/ENVIRONMENT.md` + `.env.example` (the other three WhatsApp vars were listed in Phase 0). Note in ENVIRONMENT.md: `WHATSAPP_APP_SECRET` is the Meta App Secret used to verify `X-Hub-Signature-256` on the webhook.

- [ ] **Step 7: Commit**

```bash
git add src/lib/channels tests/unit/channels docs/ENVIRONMENT.md .env.example
git commit -m "feat(phase4): WhatsApp Cloud API ChannelProvider (template + session messages)"
```

---

### Task 5: `communication.service` + `communication-log.repository`

**Files:**
- Create: `src/server/repositories/communication-log.repository.ts`
- Create: `src/server/services/communication.service.ts`
- Test: `tests/unit/services/communication.service.test.ts`

**Interfaces:**
- Consumes: registry + providers (Tasks 2–4); Phase 1 `withAudit(actor, action, entity, fn)` from `@/server/services/audit.service`; Prisma models from Task 1.
- Produces (Phase 6 assistant tools call these — signatures are contractual):

```ts
export interface SendOutboundInput {
  channel: Channel;
  to: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  templateId?: string;
  templateParams?: string[];
  partyId?: string;
  invoiceId?: string;
  reminderId?: string;
}
export interface SendOutboundResult { id: string; status: "SENT" | "FAILED"; providerId: string | null; }
export interface InboundMessageInput { channel: Channel; from: string; body: string; providerId: string; receivedAt: Date; }
export interface ChannelSettings { enabledChannels: Channel[]; }
export interface PartyChannelInfo {
  preferredChannels: Channel[];
  emailOptOutAt: Date | null;
  whatsappOptOutAt: Date | null;
}
```

- [ ] **Step 1: Implement the repository** `src/server/repositories/communication-log.repository.ts` (repositories are thin Prisma wrappers in this codebase — see `email-log.repository.ts` — and are covered via service tests):

```ts
import type { Prisma, CommunicationStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const STATUS_RANK: Record<CommunicationStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4,
  BOUNCED: 4,
};

export const communicationLogRepository = {
  create(data: Prisma.CommunicationLogUncheckedCreateInput) {
    return prisma.communicationLog.create({ data });
  },

  update(id: string, data: Prisma.CommunicationLogUncheckedUpdateInput) {
    return prisma.communicationLog.update({ where: { id }, data });
  },

  findByProviderId(channel: "EMAIL" | "WHATSAPP", providerId: string) {
    return prisma.communicationLog.findFirst({ where: { channel, providerId } });
  },

  /** Never downgrade status (e.g. a late DELIVERED after READ). */
  canTransition(from: CommunicationStatus, to: CommunicationStatus): boolean {
    return STATUS_RANK[to] > STATUS_RANK[from];
  },

  listForInvoice(organizationId: string, invoiceId: string) {
    return prisma.communicationLog.findMany({
      where: { organizationId, invoiceId },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Webhook ingress: resolve a party from an inbound WhatsApp phone (last 10 digits). */
  findPartyByPhone(phoneLast10: string) {
    return prisma.party.findFirst({
      where: {
        deletedAt: null,
        OR: [{ whatsapp: { endsWith: phoneLast10 } }, { phone: { endsWith: phoneLast10 } }],
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        emailOptOutAt: true,
        whatsappOptOutAt: true,
      },
    });
  },

  findLatestOpenInvoiceForParty(organizationId: string, partyId: string) {
    return prisma.invoice.findFirst({
      where: { organizationId, partyId, deletedAt: null, status: { not: "PAID" } },
      orderBy: { dueDate: "desc" },
      select: { id: true },
    });
  },

  setPartyOptOut(
    organizationId: string,
    partyId: string,
    field: "emailOptOutAt" | "whatsappOptOutAt",
    value: Date | null,
  ) {
    return prisma.party.updateMany({
      where: { id: partyId, organizationId, deletedAt: null },
      data: { [field]: value },
    });
  },
};
```

- [ ] **Step 2: Write the failing service test** `tests/unit/services/communication.service.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/server/repositories/communication-log.repository", () => ({
  communicationLogRepository: {
    create: vi.fn(),
    update: vi.fn(),
    findByProviderId: vi.fn(),
    canTransition: (from: string, to: string) => {
      const rank: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, BOUNCED: 4 };
      return rank[to] > rank[from];
    },
    listForInvoice: vi.fn(),
    findPartyByPhone: vi.fn(),
    findLatestOpenInvoiceForParty: vi.fn(),
    setPartyOptOut: vi.fn(),
  },
}));

vi.mock("@/server/services/audit.service", () => ({
  withAudit: (_actor: unknown, _action: string, _entity: unknown, fn: () => Promise<unknown>) => fn(),
}));

import { communicationService } from "@/server/services/communication.service";
import { communicationLogRepository } from "@/server/repositories/communication-log.repository";
import { setChannelProvider, resetChannelProviders } from "@/lib/channels/registry";

const repo = vi.mocked(communicationLogRepository);
const SYSTEM = { type: "SYSTEM" as const, id: null };

describe("communicationService.sendOutbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChannelProviders();
    repo.create.mockResolvedValue({ id: "log-1" } as never);
    repo.update.mockResolvedValue({ id: "log-1" } as never);
  });

  it("creates a QUEUED log, sends via the channel provider, marks SENT", async () => {
    const send = vi.fn().mockResolvedValue({ providerId: "re_1", success: true });
    setChannelProvider("EMAIL", { name: "mock", channel: "EMAIL", send });

    const result = await communicationService.sendOutbound("org-1", SYSTEM, {
      channel: "EMAIL",
      to: "a@b.co",
      subject: "Reminder",
      bodyHtml: "<p>hi</p>",
      invoiceId: "inv-1",
      reminderId: "rem-1",
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", channel: "EMAIL", status: "QUEUED", invoiceId: "inv-1" }),
    );
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.co", subject: "Reminder" }));
    expect(repo.update).toHaveBeenCalledWith("log-1", expect.objectContaining({ status: "SENT", providerId: "re_1" }));
    expect(result).toEqual({ id: "log-1", status: "SENT", providerId: "re_1" });
  });

  it("marks the log FAILED and rethrows when the provider throws", async () => {
    setChannelProvider("EMAIL", {
      name: "mock",
      channel: "EMAIL",
      send: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await expect(
      communicationService.sendOutbound("org-1", SYSTEM, { channel: "EMAIL", to: "a@b.co", subject: "x", bodyHtml: "y" }),
    ).rejects.toThrow("boom");
    expect(repo.update).toHaveBeenCalledWith("log-1", expect.objectContaining({ status: "FAILED", errorMessage: "boom" }));
  });
});

describe("communicationService.handleProviderStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upgrades status by providerId and stamps the timestamp", async () => {
    repo.findByProviderId.mockResolvedValue({ id: "log-1", status: "SENT" } as never);
    const at = new Date("2026-07-03T10:00:00Z");
    const res = await communicationService.handleProviderStatus("EMAIL", "re_1", "DELIVERED", at);
    expect(res).toEqual({ updated: true });
    expect(repo.update).toHaveBeenCalledWith("log-1", expect.objectContaining({ status: "DELIVERED", deliveredAt: at }));
  });

  it("ignores unknown providerIds and downgrades", async () => {
    repo.findByProviderId.mockResolvedValue(null);
    expect(await communicationService.handleProviderStatus("EMAIL", "nope", "DELIVERED", new Date())).toEqual({ updated: false });

    repo.findByProviderId.mockResolvedValue({ id: "log-1", status: "READ" } as never);
    expect(await communicationService.handleProviderStatus("EMAIL", "re_1", "DELIVERED", new Date())).toEqual({ updated: false });
  });
});

describe("communicationService.recordInbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.create.mockResolvedValue({ id: "log-in-1" } as never);
  });

  it("logs an inbound reply linked to the party's latest open invoice", async () => {
    repo.findPartyByPhone.mockResolvedValue({ id: "p1", organizationId: "org-1", name: "Acme" } as never);
    repo.findLatestOpenInvoiceForParty.mockResolvedValue({ id: "inv-9" } as never);

    const res = await communicationService.recordInbound({
      channel: "WHATSAPP",
      from: "+91 98765 43210",
      body: "Will pay Friday",
      providerId: "wamid.IN1",
      receivedAt: new Date(),
    });

    expect(repo.findPartyByPhone).toHaveBeenCalledWith("9876543210");
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "INBOUND", organizationId: "org-1", partyId: "p1", invoiceId: "inv-9", body: "Will pay Friday" }),
    );
    expect(res).toEqual({ logId: "log-in-1", optOut: false });
  });

  it("treats STOP as a WhatsApp opt-out", async () => {
    repo.findPartyByPhone.mockResolvedValue({ id: "p1", organizationId: "org-1", name: "Acme" } as never);
    repo.findLatestOpenInvoiceForParty.mockResolvedValue(null);
    repo.setPartyOptOut.mockResolvedValue({ count: 1 } as never);

    const res = await communicationService.recordInbound({
      channel: "WHATSAPP",
      from: "919876543210",
      body: "  STOP ",
      providerId: "wamid.IN2",
      receivedAt: new Date(),
    });

    expect(repo.setPartyOptOut).toHaveBeenCalledWith("org-1", "p1", "whatsappOptOutAt", expect.any(Date));
    expect(res.optOut).toBe(true);
  });

  it("drops messages from unknown numbers", async () => {
    repo.findPartyByPhone.mockResolvedValue(null);
    const res = await communicationService.recordInbound({
      channel: "WHATSAPP", from: "10000000000", body: "hi", providerId: "wamid.IN3", receivedAt: new Date(),
    });
    expect(res).toEqual({ logId: null, optOut: false });
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("communicationService.resolveChannels", () => {
  const settings = { enabledChannels: ["EMAIL", "WHATSAPP"] as const };
  const contact = { email: "a@b.co", phone: "+919876543210" };

  it("returns org channels when party has no preference", () => {
    expect(
      communicationService.resolveChannels({ enabledChannels: [...settings.enabledChannels] }, null, contact),
    ).toEqual(["EMAIL", "WHATSAPP"]);
  });

  it("intersects party preference, drops opted-out and address-less channels", () => {
    const party = { preferredChannels: ["WHATSAPP" as const], emailOptOutAt: null, whatsappOptOutAt: null };
    expect(communicationService.resolveChannels({ enabledChannels: ["EMAIL", "WHATSAPP"] }, party, contact)).toEqual(["WHATSAPP"]);

    const optedOut = { preferredChannels: [], emailOptOutAt: new Date(), whatsappOptOutAt: null };
    expect(communicationService.resolveChannels({ enabledChannels: ["EMAIL", "WHATSAPP"] }, optedOut, contact)).toEqual(["WHATSAPP"]);

    expect(
      communicationService.resolveChannels({ enabledChannels: ["EMAIL", "WHATSAPP"] }, null, { email: "a@b.co", phone: null }),
    ).toEqual(["EMAIL"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/services/communication.service.test.ts`
Expected: FAIL — cannot resolve `@/server/services/communication.service`.

- [ ] **Step 4: Implement** `src/server/services/communication.service.ts`:

```ts
import type { CommunicationStatus, EmailTone } from "@prisma/client";
import { getChannelProvider } from "@/lib/channels/registry";
import type { Channel } from "@/lib/channels/channel-provider";
import { WHATSAPP_THANK_YOU_TEMPLATE } from "@/lib/channels/whatsapp-provider";
import { createLogger } from "@/lib/logger";
import { NotFoundError } from "@/lib/api/errors";
import { communicationLogRepository } from "@/server/repositories/communication-log.repository";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { withAudit, type AuditActor } from "@/server/services/audit.service";
import { renderBaseEmailTemplate, textToHtmlParagraphs } from "@/lib/email/templates/base";
import { decimalToNumber, formatInr } from "@/lib/utils/currency";
import type { CommunicationLogDto } from "@/types";

const log = createLogger("communication-service");

export interface SendOutboundInput {
  channel: Channel;
  to: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  templateId?: string;
  templateParams?: string[];
  partyId?: string;
  invoiceId?: string;
  reminderId?: string;
}

export interface SendOutboundResult {
  id: string;
  status: "SENT" | "FAILED";
  providerId: string | null;
}

export interface InboundMessageInput {
  channel: Channel;
  from: string;
  body: string;
  providerId: string;
  receivedAt: Date;
}

export interface ChannelSettings { enabledChannels: Channel[]; }

export interface PartyChannelInfo {
  preferredChannels: Channel[];
  emailOptOutAt: Date | null;
  whatsappOptOutAt: Date | null;
}

const OPT_OUT_KEYWORDS = new Set(["stop", "unsubscribe", "opt out", "optout", "stop all"]);

const TIMESTAMP_FIELD: Partial<Record<CommunicationStatus, "sentAt" | "deliveredAt" | "readAt">> = {
  SENT: "sentAt",
  DELIVERED: "deliveredAt",
  READ: "readAt",
};

function phoneLast10(raw: string): string {
  return raw.replace(/[^\d]/g, "").slice(-10);
}

function toDto(row: {
  id: string; channel: Channel; direction: "OUTBOUND" | "INBOUND"; to: string;
  subject: string | null; body: string | null; templateId: string | null;
  status: CommunicationStatus; providerId: string | null; invoiceId: string | null;
  reminderId: string | null; partyId: string | null; errorMessage: string | null;
  createdAt: Date; sentAt: Date | null; deliveredAt: Date | null; readAt: Date | null;
}): CommunicationLogDto {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
  };
}

export const communicationService = {
  async sendOutbound(
    organizationId: string,
    actor: AuditActor,
    input: SendOutboundInput,
  ): Promise<SendOutboundResult> {
    const entry = await communicationLogRepository.create({
      organizationId,
      channel: input.channel,
      direction: "OUTBOUND",
      to: input.to,
      subject: input.subject ?? null,
      body: input.bodyText ?? input.bodyHtml ?? null,
      templateId: input.templateId ?? null,
      status: "QUEUED",
      partyId: input.partyId ?? null,
      invoiceId: input.invoiceId ?? null,
      reminderId: input.reminderId ?? null,
    });

    return withAudit(actor, "communication.send", { type: "CommunicationLog", id: entry.id }, async () => {
      try {
        const provider = getChannelProvider(input.channel);
        const result = await provider.send({
          channel: input.channel,
          to: input.to,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          bodyText: input.bodyText,
          templateId: input.templateId,
          templateParams: input.templateParams,
        });
        await communicationLogRepository.update(entry.id, {
          status: "SENT",
          providerId: result.providerId,
          sentAt: new Date(),
        });
        return { id: entry.id, status: "SENT" as const, providerId: result.providerId };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Send failed";
        await communicationLogRepository.update(entry.id, { status: "FAILED", errorMessage: message });
        throw error;
      }
    });
  },

  async handleProviderStatus(
    channel: Channel,
    providerId: string,
    status: CommunicationStatus,
    occurredAt: Date,
    errorMessage?: string,
  ): Promise<{ updated: boolean }> {
    const entry = await communicationLogRepository.findByProviderId(channel, providerId);
    if (!entry) {
      log.warn("Webhook for unknown providerId", { channel, providerId });
      return { updated: false };
    }
    if (!communicationLogRepository.canTransition(entry.status, status)) {
      return { updated: false };
    }
    const tsField = TIMESTAMP_FIELD[status];
    await communicationLogRepository.update(entry.id, {
      status,
      ...(tsField ? { [tsField]: occurredAt } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    });
    return { updated: true };
  },

  async recordInbound(input: InboundMessageInput): Promise<{ logId: string | null; optOut: boolean }> {
    const party = await communicationLogRepository.findPartyByPhone(phoneLast10(input.from));
    if (!party) {
      log.warn("Inbound message from unknown number", { channel: input.channel });
      return { logId: null, optOut: false };
    }

    const isOptOut = OPT_OUT_KEYWORDS.has(input.body.trim().toLowerCase());
    if (isOptOut) {
      await communicationLogRepository.setPartyOptOut(
        party.organizationId,
        party.id,
        input.channel === "WHATSAPP" ? "whatsappOptOutAt" : "emailOptOutAt",
        new Date(),
      );
    }

    const invoice = await communicationLogRepository.findLatestOpenInvoiceForParty(
      party.organizationId,
      party.id,
    );

    const entry = await communicationLogRepository.create({
      organizationId: party.organizationId,
      channel: input.channel,
      direction: "INBOUND",
      to: input.from,
      body: input.body,
      status: "DELIVERED",
      providerId: input.providerId,
      partyId: party.id,
      invoiceId: invoice?.id ?? null,
      createdAt: input.receivedAt,
    });

    return { logId: entry.id, optOut: isOptOut };
  },

  async setOptOut(
    organizationId: string,
    actor: AuditActor,
    partyId: string,
    channel: Channel,
    optedOut: boolean,
  ): Promise<void> {
    await withAudit(actor, "communication.opt-out", { type: "Party", id: partyId }, async () => {
      const result = await communicationLogRepository.setPartyOptOut(
        organizationId,
        partyId,
        channel === "WHATSAPP" ? "whatsappOptOutAt" : "emailOptOutAt",
        optedOut ? new Date() : null,
      );
      if (result.count === 0) throw new NotFoundError("Party not found");
    });
  },

  async listForInvoice(organizationId: string, invoiceId: string): Promise<CommunicationLogDto[]> {
    const rows = await communicationLogRepository.listForInvoice(organizationId, invoiceId);
    return rows.map(toDto);
  },

  resolveChannels(
    settings: ChannelSettings,
    party: PartyChannelInfo | null,
    contact: { email: string | null; phone: string | null },
  ): Channel[] {
    let channels = [...settings.enabledChannels];
    if (party?.preferredChannels.length) {
      channels = channels.filter((c) => party.preferredChannels.includes(c));
    }
    return channels.filter((c) => {
      if (c === "EMAIL") return !party?.emailOptOutAt && !!contact.email;
      return !party?.whatsappOptOutAt && !!contact.phone;
    });
  },

  async sendPaidThankYou(organizationId: string, invoiceId: string): Promise<{ sent: Channel[] }> {
    const invoice = await invoiceRepository.findById(organizationId, invoiceId);
    if (!invoice) throw new NotFoundError("Invoice not found");
    const org = await organizationRepository.findById(organizationId);
    if (!org) throw new NotFoundError("Organization not found");

    const settings = org.reminderSettings;
    const enabledChannels: Channel[] = settings?.enabledChannels?.length
      ? settings.enabledChannels
      : ["EMAIL"];
    const party = invoice.party ?? null; // Phase 1 relation; null for legacy invoices
    const contact = {
      email: party?.email ?? invoice.clientEmail ?? null,
      phone: party?.whatsapp ?? party?.phone ?? invoice.clientPhone ?? null,
    };
    const channels = this.resolveChannels(
      { enabledChannels },
      party
        ? {
            preferredChannels: party.preferredChannels ?? [],
            emailOptOutAt: party.emailOptOutAt ?? null,
            whatsappOptOutAt: party.whatsappOptOutAt ?? null,
          }
        : null,
      contact,
    );

    const amount = formatInr(decimalToNumber(invoice.amount));
    const clientName = party?.name ?? invoice.clientName;
    const sent: Channel[] = [];
    const actor: AuditActor = { type: "SYSTEM", id: null };

    for (const channel of channels) {
      try {
        if (channel === "EMAIL") {
          const bodyText = `Hi ${clientName},\n\nThank you! We have received your payment of ${amount} for invoice ${invoice.invoiceNumber}.\n\nRegards,\n${org.name}`;
          await this.sendOutbound(organizationId, actor, {
            channel,
            to: contact.email!,
            subject: `Payment received — ${invoice.invoiceNumber}`,
            bodyHtml: renderBaseEmailTemplate({
              title: "Payment received",
              bodyHtml: textToHtmlParagraphs(bodyText),
            }),
            bodyText,
            invoiceId,
            partyId: party?.id,
          });
        } else {
          await this.sendOutbound(organizationId, actor, {
            channel,
            to: contact.phone!,
            templateId: WHATSAPP_THANK_YOU_TEMPLATE,
            templateParams: [clientName, invoice.invoiceNumber, amount],
            invoiceId,
            partyId: party?.id,
          });
        }
        sent.push(channel);
      } catch (error) {
        log.error("Thank-you send failed", {
          channel,
          invoiceId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
    return { sent };
  },
};
```

- [ ] **Step 5: Add `formatInr` to `src/lib/utils/currency.ts`** (append; keep existing exports):

```ts
export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}
```

(If `invoiceRepository.findById` does not already `include: { party: true }`, add `party: true` to its include — check `src/server/repositories/invoice.repository.ts` and extend the select/include there.)

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/unit/services/communication.service.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/repositories/communication-log.repository.ts src/server/services/communication.service.ts src/lib/utils/currency.ts src/server/repositories/invoice.repository.ts tests/unit/services/communication.service.test.ts
git commit -m "feat(phase4): communication service over ChannelProvider with CommunicationLog"
```

---

### Task 6: Quiet hours + escalation utilities (pure functions)

**Files:**
- Create: `src/lib/channels/quiet-hours.ts`
- Create: `src/lib/channels/escalation.ts`
- Test: `tests/unit/channels/quiet-hours.test.ts`
- Test: `tests/unit/channels/escalation.test.ts`

**Interfaces:**
- Produces: `nextAllowedSendTime(now: Date, cfg: QuietHoursConfig): Date` and `toneForOffset(reminderDays: number[], escalationTones: EmailTone[], dayOffset: number): EmailTone` — consumed by Task 7.

- [ ] **Step 1: Write the failing tests.**

`tests/unit/channels/quiet-hours.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nextAllowedSendTime } from "@/lib/channels/quiet-hours";

// 2026-07-03T18:30:00Z == 2026-07-04 00:00 IST
const IST = "Asia/Kolkata";

describe("nextAllowedSendTime", () => {
  it("returns now when quiet hours are not configured", () => {
    const now = new Date("2026-07-03T18:30:00Z");
    expect(
      nextAllowedSendTime(now, { quietHoursStart: null, quietHoursEnd: null, timezone: IST }),
    ).toEqual(now);
  });

  it("returns now when outside quiet hours", () => {
    const now = new Date("2026-07-03T09:00:00Z"); // 14:30 IST
    expect(
      nextAllowedSendTime(now, { quietHoursStart: "21:00", quietHoursEnd: "09:00", timezone: IST }),
    ).toEqual(now);
  });

  it("defers to the end of an overnight quiet window", () => {
    const now = new Date("2026-07-03T18:30:00Z"); // 00:00 IST, inside 21:00→09:00
    const result = nextAllowedSendTime(now, {
      quietHoursStart: "21:00",
      quietHoursEnd: "09:00",
      timezone: IST,
    });
    // 09:00 IST == 03:30 UTC
    expect(result).toEqual(new Date("2026-07-04T03:30:00Z"));
  });

  it("defers within a same-day window", () => {
    const now = new Date("2026-07-03T08:00:00Z"); // 13:30 IST, inside 13:00→14:00
    const result = nextAllowedSendTime(now, {
      quietHoursStart: "13:00",
      quietHoursEnd: "14:00",
      timezone: IST,
    });
    expect(result).toEqual(new Date("2026-07-03T08:30:00Z")); // 14:00 IST
  });
});
```

`tests/unit/channels/escalation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toneForOffset } from "@/lib/channels/escalation";

const TONES = ["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"] as const;

describe("toneForOffset", () => {
  it("maps each reminder step to the escalation tone at the same index", () => {
    expect(toneForOffset([3, 7, 14, 30], [...TONES], 3)).toBe("FRIENDLY");
    expect(toneForOffset([3, 7, 14, 30], [...TONES], 7)).toBe("PROFESSIONAL");
    expect(toneForOffset([3, 7, 14, 30], [...TONES], 14)).toBe("FIRM");
    expect(toneForOffset([3, 7, 14, 30], [...TONES], 30)).toBe("FINAL_NOTICE");
  });

  it("clamps to the last tone when there are more steps than tones", () => {
    expect(toneForOffset([1, 2, 3], ["FRIENDLY", "FIRM"], 3)).toBe("FIRM");
  });

  it("sorts reminderDays before indexing and falls back for unknown offsets", () => {
    expect(toneForOffset([14, 3, 7], [...TONES], 3)).toBe("FRIENDLY");
    expect(toneForOffset([3, 7], [...TONES], 99)).toBe("PROFESSIONAL"); // unknown → last step's tone
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/channels/quiet-hours.test.ts tests/unit/channels/escalation.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement.**

`src/lib/channels/quiet-hours.ts`:

```ts
import { addMinutes } from "date-fns";

export interface QuietHoursConfig {
  quietHoursStart: string | null; // "HH:mm" in the org's timezone
  quietHoursEnd: string | null;
  timezone: string; // IANA name, e.g. "Asia/Kolkata"
}

function minutesOfDayInTz(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function parseHm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Returns `now` if sending is allowed, otherwise the moment the quiet window ends. */
export function nextAllowedSendTime(now: Date, cfg: QuietHoursConfig): Date {
  if (!cfg.quietHoursStart || !cfg.quietHoursEnd) return now;
  const start = parseHm(cfg.quietHoursStart);
  const end = parseHm(cfg.quietHoursEnd);
  if (start === end) return now; // degenerate config = no quiet hours

  const current = minutesOfDayInTz(now, cfg.timezone);
  const inQuiet = start < end ? current >= start && current < end : current >= start || current < end;
  if (!inQuiet) return now;

  const minutesUntilEnd = (end - current + 24 * 60) % (24 * 60);
  return addMinutes(now, minutesUntilEnd);
}
```

`src/lib/channels/escalation.ts`:

```ts
import type { EmailTone } from "@prisma/client";

const DEFAULT_TONES: EmailTone[] = ["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"];

/**
 * Escalation: the Nth reminder step (sorted reminderDays) uses the Nth tone.
 * More steps than tones → clamp to the last (most severe) tone.
 */
export function toneForOffset(
  reminderDays: number[],
  escalationTones: EmailTone[],
  dayOffset: number,
): EmailTone {
  const tones = escalationTones.length > 0 ? escalationTones : DEFAULT_TONES;
  const sorted = [...reminderDays].sort((a, b) => a - b);
  const index = sorted.indexOf(dayOffset);
  const effective = index === -1 ? sorted.length - 1 : index;
  return tones[Math.min(effective, tones.length - 1)];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/channels`
Expected: PASS.

- [ ] **Step 5: Add the FINAL_NOTICE prompt tone.** In `src/lib/ai/prompts/reminder-email.ts`, add to `toneInstructions`:

```ts
  FINAL_NOTICE:
    "Use a formal, serious final-notice tone. State clearly this is the final reminder before the matter is escalated (e.g. credit hold or collections), while remaining professional and lawful. No threats beyond stated business consequences.",
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/channels tests/unit/channels src/lib/ai/prompts/reminder-email.ts
git commit -m "feat(phase4): quiet-hours and escalation-tone pure utilities"
```

---

### Task 7: Reminder engine — per-channel fan-out, quiet hours, escalation

**Files:**
- Modify: `src/server/services/reminder.service.ts`
- Modify: `src/server/workflows/inngest/functions.ts` (`sendReminderWorkflow`)
- Modify: `src/server/repositories/reminder.repository.ts` (only if `findById` doesn't include `invoice.party` — add the include)
- Test: `tests/unit/services/reminder-fanout.test.ts`

**Interfaces:**
- Consumes: `communicationService.sendOutbound/resolveChannels` (Task 5), `toneForOffset` + `nextAllowedSendTime` (Task 6), `WHATSAPP_TEMPLATE_BY_TONE` (Task 4), `buildPaymentBlock` (Task 11 — until Task 11 lands, the payment-block call site is added there, not here).
- Produces: `reminderService.getQuietHoursDeferral(reminderId: string): Promise<string | null>` (ISO timestamp or null) and multi-channel `reminderService.sendReminder(reminderId)` — same public name as today, so callers don't change.

- [ ] **Step 1: Write the failing test** `tests/unit/services/reminder-fanout.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/server/repositories/reminder.repository", () => ({
  reminderRepository: {
    findById: vi.fn(),
    getSettings: vi.fn(),
    updateStatus: vi.fn(),
    claimForSending: vi.fn(),
    findExistingOffsets: vi.fn(),
    createManyScheduled: vi.fn(),
    findDueReminders: vi.fn(),
    upsertSettings: vi.fn(),
  },
}));
vi.mock("@/server/repositories/invoice.repository", () => ({
  invoiceRepository: { markOverdueBatch: vi.fn(), findOverdue: vi.fn(), findById: vi.fn(), findByInvoiceNumbers: vi.fn() },
}));
vi.mock("@/server/repositories/organization.repository", () => ({
  organizationRepository: { findById: vi.fn().mockResolvedValue({ id: "org-1", name: "My Org" }) },
}));
vi.mock("@/server/services/ai-email.service", () => ({
  aiEmailService: {
    generateReminderEmail: vi.fn().mockResolvedValue({
      subject: "Reminder INV-1",
      bodyHtml: "<p>pay up</p>",
      bodyText: "pay up",
      whatsappText: "pay up",
    }),
  },
}));
vi.mock("@/server/services/communication.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/communication.service")>();
  return {
    communicationService: {
      ...actual.communicationService,
      sendOutbound: vi.fn().mockResolvedValue({ id: "log-1", status: "SENT", providerId: "p1" }),
    },
  };
});
vi.mock("@/lib/jobs/inngest/scheduler", () => ({
  getJobScheduler: () => ({ enqueueReminders: vi.fn(), enqueueReminder: vi.fn() }),
}));

import { reminderService } from "@/server/services/reminder.service";
import { reminderRepository } from "@/server/repositories/reminder.repository";
import { communicationService } from "@/server/services/communication.service";

const repo = vi.mocked(reminderRepository);
const comms = vi.mocked(communicationService);

const baseReminder = {
  id: "rem-1",
  organizationId: "org-1",
  dayOffset: 3,
  tone: "FRIENDLY",
  invoice: {
    id: "inv-1",
    invoiceNumber: "INV-1",
    status: "OVERDUE",
    amount: 18500,
    dueDate: new Date("2026-06-28"),
    clientName: "Acme",
    clientEmail: "acme@example.com",
    clientPhone: "+919876543210",
    party: null,
  },
};

const settings = {
  reminderDays: [3, 7, 14],
  emailTone: "PROFESSIONAL",
  autoSend: true,
  whatsappEnabled: true,
  enabledChannels: ["EMAIL", "WHATSAPP"],
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: "Asia/Kolkata",
  escalationTones: ["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"],
  upiId: null,
  paymentLink: null,
};

describe("reminderService.sendReminder fan-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(baseReminder as never);
    repo.getSettings.mockResolvedValue(settings as never);
    repo.claimForSending.mockResolvedValue(true as never);
    repo.updateStatus.mockResolvedValue({} as never);
  });

  it("sends on every enabled channel and marks the reminder SENT", async () => {
    const result = await reminderService.sendReminder("rem-1");
    expect(result).toEqual({ sent: true, channels: ["EMAIL", "WHATSAPP"] });

    const channels = comms.sendOutbound.mock.calls.map(([, , input]) => input.channel);
    expect(channels).toEqual(["EMAIL", "WHATSAPP"]);
    const waCall = comms.sendOutbound.mock.calls[1][2];
    expect(waCall.templateId).toBe("payment_reminder_friendly");
    expect(waCall.templateParams).toHaveLength(5);
    expect(repo.updateStatus).toHaveBeenCalledWith("rem-1", "SENT", expect.any(Date));
  });

  it("still succeeds when one channel fails, and fails only when all do", async () => {
    comms.sendOutbound
      .mockRejectedValueOnce(new Error("email down"))
      .mockResolvedValueOnce({ id: "log-2", status: "SENT", providerId: "p2" });
    await expect(reminderService.sendReminder("rem-1")).resolves.toEqual({
      sent: true,
      channels: ["WHATSAPP"],
    });

    comms.sendOutbound.mockReset();
    comms.sendOutbound.mockRejectedValue(new Error("all down"));
    await expect(reminderService.sendReminder("rem-1")).rejects.toThrow();
    expect(repo.updateStatus).toHaveBeenLastCalledWith("rem-1", "FAILED");
  });

  it("cancels when the invoice is already paid", async () => {
    repo.findById.mockResolvedValue({
      ...baseReminder,
      invoice: { ...baseReminder.invoice, status: "PAID" },
    } as never);
    await expect(reminderService.sendReminder("rem-1")).resolves.toEqual({ skipped: true });
    expect(repo.updateStatus).toHaveBeenCalledWith("rem-1", "CANCELLED");
  });
});

describe("reminderService.getQuietHoursDeferral", () => {
  it("returns null when no quiet hours configured", async () => {
    repo.findById.mockResolvedValue(baseReminder as never);
    repo.getSettings.mockResolvedValue(settings as never);
    await expect(reminderService.getQuietHoursDeferral("rem-1")).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/services/reminder-fanout.test.ts`
Expected: FAIL — `sendReminder` returns `{ sent: true }` without `channels`; `getQuietHoursDeferral` undefined.

- [ ] **Step 3: Refactor `src/server/services/reminder.service.ts`.**

Replace the imports of `getEmailProvider`/`emailLogRepository` and the Twilio dynamic import with:

```ts
import { communicationService } from "@/server/services/communication.service";
import { toneForOffset } from "@/lib/channels/escalation";
import { nextAllowedSendTime } from "@/lib/channels/quiet-hours";
import { WHATSAPP_TEMPLATE_BY_TONE } from "@/lib/channels/whatsapp-provider";
import type { Channel } from "@/lib/channels/channel-provider";
import { formatInr, decimalToNumber } from "@/lib/utils/currency";
import { format } from "date-fns";
```

In `scheduleRemindersForOrganization`, replace `tone: settings.emailTone` with the escalation tone per step:

```ts
        toCreate.push({
          id: crypto.randomUUID(),
          organizationId,
          invoiceId: invoice.id,
          scheduledFor: new Date(),
          tone: toneForOffset(settings.reminderDays, settings.escalationTones ?? [], dayOffset),
          dayOffset,
          status: "SCHEDULED",
        });
```

Add `getQuietHoursDeferral`:

```ts
  /** Returns an ISO timestamp to sleep until, or null if sending is allowed now. */
  async getQuietHoursDeferral(reminderId: string): Promise<string | null> {
    const reminder = await reminderRepository.findById(reminderId);
    if (!reminder) return null;
    const settings = await reminderRepository.getSettings(reminder.organizationId);
    const now = new Date();
    const allowedAt = nextAllowedSendTime(now, {
      quietHoursStart: settings?.quietHoursStart ?? null,
      quietHoursEnd: settings?.quietHoursEnd ?? null,
      timezone: settings?.timezone ?? "Asia/Kolkata",
    });
    return allowedAt.getTime() > now.getTime() ? allowedAt.toISOString() : null;
  },
```

Replace the body of `sendReminder` from the claim onward (keep the existing not-found / PAID-cancel / `claimForSending` logic exactly as is):

```ts
    let emailContent: Awaited<ReturnType<typeof aiEmailService.generateReminderEmail>>;
    let settings: Awaited<ReturnType<typeof reminderRepository.getSettings>>;
    try {
      const org = await organizationRepository.findById(reminder.organizationId);
      if (!org) throw new NotFoundError("Organization not found");

      emailContent = await aiEmailService.generateReminderEmail(
        reminder.organizationId,
        reminder.invoice.id,
        reminder.tone,
        { reminderId: reminder.id },
      );
      settings = await reminderRepository.getSettings(reminder.organizationId);
    } catch (error) {
      await reminderRepository.updateStatus(reminder.id, "FAILED");
      throw error;
    }

    const party = reminder.invoice.party ?? null;
    const contact = {
      email: party?.email ?? reminder.invoice.clientEmail ?? null,
      phone: party?.whatsapp ?? party?.phone ?? reminder.invoice.clientPhone ?? null,
    };
    const enabledChannels: Channel[] = settings?.enabledChannels?.length
      ? settings.enabledChannels
      : ["EMAIL"];
    const channels = communicationService.resolveChannels(
      { enabledChannels },
      party
        ? {
            preferredChannels: party.preferredChannels ?? [],
            emailOptOutAt: party.emailOptOutAt ?? null,
            whatsappOptOutAt: party.whatsappOptOutAt ?? null,
          }
        : null,
      contact,
    );

    if (channels.length === 0) {
      log.warn("No sendable channel for reminder", { reminderId });
      await reminderRepository.updateStatus(reminder.id, "FAILED");
      return { sent: false, channels: [] };
    }

    const actor = { type: "SYSTEM" as const, id: null };
    const paymentLink = settings?.paymentLink ?? (settings?.upiId ? `upi://pay?pa=${settings.upiId}` : "—");
    const sentChannels: Channel[] = [];
    let lastError: unknown = null;

    for (const channel of channels) {
      try {
        if (channel === "EMAIL") {
          await communicationService.sendOutbound(reminder.organizationId, actor, {
            channel,
            to: contact.email!,
            subject: emailContent.subject,
            bodyHtml: emailContent.bodyHtml,
            bodyText: emailContent.bodyText,
            invoiceId: reminder.invoice.id,
            reminderId: reminder.id,
            partyId: party?.id,
          });
        } else {
          await communicationService.sendOutbound(reminder.organizationId, actor, {
            channel,
            to: contact.phone!,
            templateId: WHATSAPP_TEMPLATE_BY_TONE[reminder.tone],
            templateParams: [
              party?.name ?? reminder.invoice.clientName,
              reminder.invoice.invoiceNumber,
              formatInr(decimalToNumber(reminder.invoice.amount)),
              format(reminder.invoice.dueDate, "d MMM yyyy"),
              paymentLink,
            ],
            invoiceId: reminder.invoice.id,
            reminderId: reminder.id,
            partyId: party?.id,
          });
        }
        sentChannels.push(channel);
      } catch (error) {
        lastError = error;
        log.error("Channel send failed", {
          reminderId,
          channel,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    if (sentChannels.length === 0) {
      await reminderRepository.updateStatus(reminder.id, "FAILED");
      throw lastError instanceof Error ? lastError : new Error("All channels failed");
    }

    await reminderRepository.updateStatus(reminder.id, "SENT", new Date());
    return { sent: true, channels: sentChannels };
```

- [ ] **Step 4: Include party on the reminder query.** In `src/server/repositories/reminder.repository.ts`, ensure `findById` includes the invoice's party:

```ts
    include: { invoice: { include: { party: true } } },
```

- [ ] **Step 5: Quiet hours in the Inngest workflow.** In `src/server/workflows/inngest/functions.ts` replace `sendReminderWorkflow`:

```ts
export const sendReminderWorkflow = inngest.createFunction(
  { id: "send-reminder", name: "Send Reminder (email + WhatsApp)" },
  { event: JOB_EVENTS.SEND_REMINDER },
  async ({ event, step }) => {
    const reminderId = event.data.reminderId as string;

    const deferUntil = await step.run("check-quiet-hours", () =>
      reminderService.getQuietHoursDeferral(reminderId),
    );
    if (deferUntil) {
      await step.sleepUntil("wait-for-quiet-hours-end", new Date(deferUntil));
    }

    return step.run("send", () => reminderService.sendReminder(reminderId));
  },
);
```

- [ ] **Step 6: Run all tests + typecheck**

Run: `npx vitest run tests/unit && npm run typecheck && npm run lint`
Expected: PASS. (The old EmailLog write for reminders is gone — reminder traffic now lands in `CommunicationLog`. The manual `/api/ai/send-email` route still uses `EmailLog`; leave it — Phase 6 migrates it.)

- [ ] **Step 7: Commit**

```bash
git add src/server/services/reminder.service.ts src/server/workflows/inngest/functions.ts src/server/repositories/reminder.repository.ts tests/unit/services/reminder-fanout.test.ts
git commit -m "feat(phase4): reminder fan-out per channel with quiet hours and escalation"
```

---

### Task 8: Resend delivery webhook — `/api/webhooks/resend`

**Files:**
- Create: `src/lib/channels/webhook-signature.ts`
- Create: `src/app/api/webhooks/resend/route.ts`
- Test: `tests/unit/channels/webhook-signature.test.ts`
- Test: `tests/unit/api/resend-webhook.test.ts`

**Interfaces:**
- Consumes: `communicationService.handleProviderStatus` (Task 5). Env: `RESEND_WEBHOOK_SECRET` (svix `whsec_...` from the Resend dashboard).
- Produces: `verifySvixSignature(payload: string, headers: { id: string; timestamp: string; signature: string }, secret: string): boolean` (also reused nowhere else; WhatsApp uses its own HMAC in Task 9).

- [ ] **Step 1: Write the failing signature test** `tests/unit/channels/webhook-signature.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifySvixSignature } from "@/lib/channels/webhook-signature";

const secret = "whsec_" + Buffer.from("test-secret-bytes").toString("base64");

function sign(payload: string, id: string, timestamp: string): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return `v1,${mac}`;
}

describe("verifySvixSignature", () => {
  const payload = JSON.stringify({ type: "email.delivered" });
  const id = "msg_1";
  const timestamp = String(Math.floor(Date.now() / 1000));

  it("accepts a valid signature (including multi-signature headers)", () => {
    const sig = sign(payload, id, timestamp);
    expect(verifySvixSignature(payload, { id, timestamp, signature: sig }, secret)).toBe(true);
    expect(
      verifySvixSignature(payload, { id, timestamp, signature: `v1,AAAA ${sig}` }, secret),
    ).toBe(true);
  });

  it("rejects a tampered payload or wrong secret", () => {
    const sig = sign(payload, id, timestamp);
    expect(verifySvixSignature(payload + "x", { id, timestamp, signature: sig }, secret)).toBe(false);
    expect(
      verifySvixSignature(payload, { id, timestamp, signature: sig }, "whsec_" + Buffer.from("other").toString("base64")),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement** `src/lib/channels/webhook-signature.ts`:

Run: `npx vitest run tests/unit/channels/webhook-signature.test.ts` → FAIL (module not found), then:

```ts
import { createHmac, timingSafeEqual } from "crypto";

/** Verifies a Resend (svix) webhook signature: HMAC-SHA256 over `${id}.${timestamp}.${payload}`. */
export function verifySvixSignature(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
): boolean {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${payload}`)
    .digest();

  return headers.signature.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    const candidate = Buffer.from(sig, "base64");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}
```

Run again → PASS.

- [ ] **Step 3: Write the failing route test** `tests/unit/api/resend-webhook.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";

vi.mock("@/server/services/communication.service", () => ({
  communicationService: { handleProviderStatus: vi.fn().mockResolvedValue({ updated: true }) },
}));

import { POST } from "@/app/api/webhooks/resend/route";
import { communicationService } from "@/server/services/communication.service";

const secret = "whsec_" + Buffer.from("test-secret").toString("base64");

function makeRequest(body: object): Request {
  const payload = JSON.stringify(body);
  const id = "msg_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${sig}` },
    body: payload,
  });
}

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  });

  it("maps delivered/bounced/opened events to CommunicationLog statuses", async () => {
    for (const [type, status] of [
      ["email.delivered", "DELIVERED"],
      ["email.bounced", "BOUNCED"],
      ["email.opened", "READ"],
    ] as const) {
      const res = await POST(
        makeRequest({ type, created_at: "2026-07-03T10:00:00.000Z", data: { email_id: "re_1" } }),
      );
      expect(res.status).toBe(200);
      expect(communicationService.handleProviderStatus).toHaveBeenCalledWith(
        "EMAIL", "re_1", status, expect.any(Date), undefined,
      );
    }
  });

  it("returns 401 on a bad signature and 200 (ignored) on unknown event types", async () => {
    const bad = new Request("http://localhost/api/webhooks/resend", {
      method: "POST",
      headers: { "svix-id": "x", "svix-timestamp": "0", "svix-signature": "v1,bogus" },
      body: JSON.stringify({ type: "email.delivered", data: { email_id: "re_1" } }),
    });
    expect((await POST(bad)).status).toBe(401);

    const res = await POST(makeRequest({ type: "email.clicked", data: { email_id: "re_1" } }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 4: Run to verify it fails, then implement** `src/app/api/webhooks/resend/route.ts`:

```ts
import { NextResponse } from "next/server";
import { verifySvixSignature } from "@/lib/channels/webhook-signature";
import { communicationService } from "@/server/services/communication.service";
import { createLogger } from "@/lib/logger";
import type { CommunicationStatus } from "@prisma/client";

const log = createLogger("resend-webhook");

const EVENT_STATUS: Record<string, CommunicationStatus> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.opened": "READ",
  "email.complained": "BOUNCED",
};

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    log.error("RESEND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const payload = await request.text();
  const headers = {
    id: request.headers.get("svix-id") ?? "",
    timestamp: request.headers.get("svix-timestamp") ?? "",
    signature: request.headers.get("svix-signature") ?? "",
  };

  if (!verifySvixSignature(payload, headers, secret)) {
    log.warn("Invalid Resend webhook signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload) as {
    type: string;
    created_at?: string;
    data?: { email_id?: string; bounce?: { message?: string } };
  };

  const status = EVENT_STATUS[event.type];
  const providerId = event.data?.email_id;
  if (status && providerId) {
    await communicationService.handleProviderStatus(
      "EMAIL",
      providerId,
      status,
      event.created_at ? new Date(event.created_at) : new Date(),
      status === "BOUNCED" ? event.data?.bounce?.message : undefined,
    );
  }

  // Always 200 for verified payloads so Resend does not retry unknown event types.
  return NextResponse.json({ received: true });
}
```

Run: `npx vitest run tests/unit/api/resend-webhook.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/channels/webhook-signature.ts src/app/api/webhooks/resend tests/unit/channels/webhook-signature.test.ts tests/unit/api/resend-webhook.test.ts
git commit -m "feat(phase4): Resend delivery webhook with svix signature verification"
```

---

### Task 9: WhatsApp webhook — `/api/webhooks/whatsapp`

**Files:**
- Create: `src/app/api/webhooks/whatsapp/route.ts`
- Test: `tests/unit/api/whatsapp-webhook.test.ts`

**Interfaces:**
- Consumes: `communicationService.handleProviderStatus` + `recordInbound` (Task 5). Env: `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (GET handshake), `WHATSAPP_APP_SECRET` (POST `X-Hub-Signature-256`).
- Produces: `GET` (Meta verification handshake) and `POST` (statuses + inbound messages) handlers.

- [ ] **Step 1: Write the failing test** `tests/unit/api/whatsapp-webhook.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";

vi.mock("@/server/services/communication.service", () => ({
  communicationService: {
    handleProviderStatus: vi.fn().mockResolvedValue({ updated: true }),
    recordInbound: vi.fn().mockResolvedValue({ logId: "log-1", optOut: false }),
  },
}));

import { GET, POST } from "@/app/api/webhooks/whatsapp/route";
import { communicationService } from "@/server/services/communication.service";

const APP_SECRET = "app-secret";
const VERIFY_TOKEN = "verify-me";

function makePost(body: object): Request {
  const payload = JSON.stringify(body);
  const sig = createHmac("sha256", APP_SECRET).update(payload).digest("hex");
  return new Request("http://localhost/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${sig}` },
    body: payload,
  });
}

const statusPayload = (status: string) => ({
  object: "whatsapp_business_account",
  entry: [{
    changes: [{
      field: "messages",
      value: {
        statuses: [{ id: "wamid.X", status, timestamp: "1782000000" }],
      },
    }],
  }],
});

describe("GET /api/webhooks/whatsapp (verification)", () => {
  beforeEach(() => vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN));

  it("echoes hub.challenge for a valid token and 403s otherwise", async () => {
    const ok = await GET(new Request(
      `http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
    ));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");

    const bad = await GET(new Request(
      "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1",
    ));
    expect(bad.status).toBe(403);
  });
});

describe("POST /api/webhooks/whatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
  });

  it("maps sent/delivered/read/failed statuses", async () => {
    for (const [wa, ours] of [
      ["sent", "SENT"],
      ["delivered", "DELIVERED"],
      ["read", "READ"],
      ["failed", "FAILED"],
    ] as const) {
      const res = await POST(makePost(statusPayload(wa)));
      expect(res.status).toBe(200);
      expect(communicationService.handleProviderStatus).toHaveBeenCalledWith(
        "WHATSAPP", "wamid.X", ours, expect.any(Date), undefined,
      );
    }
  });

  it("records inbound text replies", async () => {
    const res = await POST(makePost({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            messages: [{
              id: "wamid.IN", from: "919876543210", timestamp: "1782000000",
              type: "text", text: { body: "Will pay Friday" },
            }],
          },
        }],
      }],
    }));
    expect(res.status).toBe(200);
    expect(communicationService.recordInbound).toHaveBeenCalledWith({
      channel: "WHATSAPP",
      from: "919876543210",
      body: "Will pay Friday",
      providerId: "wamid.IN",
      receivedAt: expect.any(Date),
    });
  });

  it("rejects an invalid signature", async () => {
    const req = new Request("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body: JSON.stringify(statusPayload("sent")),
    });
    expect((await POST(req)).status).toBe(401);
    expect(communicationService.handleProviderStatus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/api/whatsapp-webhook.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement** `src/app/api/webhooks/whatsapp/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { communicationService } from "@/server/services/communication.service";
import { createLogger } from "@/lib/logger";
import type { CommunicationStatus } from "@prisma/client";

const log = createLogger("whatsapp-webhook");

const STATUS_MAP: Record<string, CommunicationStatus> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

/** Meta webhook verification handshake. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

function verifyMetaSignature(payload: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const candidate = Buffer.from(header.slice("sha256=".length), "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

interface WhatsAppWebhookBody {
  entry?: {
    changes?: {
      field: string;
      value?: {
        statuses?: { id: string; status: string; timestamp: string; errors?: { message?: string }[] }[];
        messages?: { id: string; from: string; timestamp: string; type: string; text?: { body: string } }[];
      };
    }[];
  }[];
}

export async function POST(request: Request): Promise<Response> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    log.error("WHATSAPP_APP_SECRET not configured");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const payload = await request.text();
  if (!verifyMetaSignature(payload, request.headers.get("x-hub-signature-256"), appSecret)) {
    log.warn("Invalid WhatsApp webhook signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(payload) as WhatsAppWebhookBody;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      for (const s of change.value?.statuses ?? []) {
        const status = STATUS_MAP[s.status];
        if (!status) continue;
        await communicationService.handleProviderStatus(
          "WHATSAPP",
          s.id,
          status,
          new Date(Number(s.timestamp) * 1000),
          status === "FAILED" ? s.errors?.[0]?.message : undefined,
        );
      }

      for (const m of change.value?.messages ?? []) {
        if (m.type !== "text" || !m.text?.body) continue; // media replies: Phase 6 scope
        await communicationService.recordInbound({
          channel: "WHATSAPP",
          from: m.from,
          body: m.text.body,
          providerId: m.id,
          receivedAt: new Date(Number(m.timestamp) * 1000),
        });
      }
    }
  }

  // Meta requires a fast 200 or it retries/disables the webhook.
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/api/whatsapp-webhook.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/whatsapp tests/unit/api/whatsapp-webhook.test.ts
git commit -m "feat(phase4): WhatsApp Cloud webhook (statuses, replies, STOP opt-out)"
```

---

### Task 10: Communications on the invoice timeline (API + component)

**Files:**
- Create: `src/app/api/invoices/[id]/communications/route.ts`
- Create: `src/modules/invoices/components/communication-timeline.tsx`
- Modify: `src/modules/invoices/components/index.ts` (export)
- Test: `tests/unit/api/invoice-communications.test.ts`

**Interfaces:**
- Consumes: `communicationService.listForInvoice` (Task 5), `withApiHandler` from `@/lib/api/handler`, `successResponse` from `@/lib/api/response` (check its exact export name in `src/lib/api/response.ts` and match it — the codebase's existing invoice routes show the pattern).
- Produces: `GET /api/invoices/:id/communications` → `{ data: CommunicationLogDto[] }`; `<CommunicationTimeline invoiceId={...} />` component that Phase 3's invoice-detail screen mounts.

- [ ] **Step 1: Write the failing route test** `tests/unit/api/invoice-communications.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn().mockResolvedValue({ userId: "clerk-1" }) }));
vi.mock("@/server/services/organization.service", () => ({
  organizationService: {
    ensureUserOrganization: vi.fn().mockResolvedValue({ userId: "u1", organizationId: "org-1" }),
  },
}));
vi.mock("@/server/services/communication.service", () => ({
  communicationService: {
    listForInvoice: vi.fn().mockResolvedValue([
      { id: "c1", channel: "EMAIL", direction: "OUTBOUND", status: "DELIVERED" },
    ]),
  },
}));

import { GET } from "@/app/api/invoices/[id]/communications/route";
import { communicationService } from "@/server/services/communication.service";

describe("GET /api/invoices/:id/communications", () => {
  it("returns the org-scoped communication log for the invoice", async () => {
    const res = await GET(new Request("http://localhost/api/invoices/inv-1/communications"), {
      params: Promise.resolve({ id: "inv-1" }),
    });
    expect(res.status).toBe(200);
    expect(communicationService.listForInvoice).toHaveBeenCalledWith("org-1", "inv-1");
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement the route** `src/app/api/invoices/[id]/communications/route.ts` (match the success-response helper used by `src/app/api/invoices/[id]/route.ts` — assumed `successResponse(data)` below):

```ts
import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { communicationService } from "@/server/services/communication.service";

export const GET = withApiHandler(async (_request, context, params) => {
  const logs = await communicationService.listForInvoice(context.organizationId, params.id);
  return successResponse(logs);
});
```

Run: `npx vitest run tests/unit/api/invoice-communications.test.ts` → PASS.

- [ ] **Step 3: Implement the timeline component** `src/modules/invoices/components/communication-timeline.tsx` (client component in the existing TanStack Query style; Phase 3 mounts it on the invoice detail screen):

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Mail, MessageCircle, ArrowDownLeft } from "lucide-react";
import type { CommunicationLogDto } from "@/types";

const STATUS_LABEL: Record<CommunicationLogDto["status"], string> = {
  QUEUED: "Queued",
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
  FAILED: "Failed",
  BOUNCED: "Bounced",
};

async function fetchCommunications(invoiceId: string): Promise<CommunicationLogDto[]> {
  const res = await fetch(`/api/invoices/${invoiceId}/communications`);
  if (!res.ok) throw new Error("Failed to load communications");
  const json = (await res.json()) as { data: CommunicationLogDto[] };
  return json.data;
}

export function CommunicationTimeline({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["invoice-communications", invoiceId],
    queryFn: () => fetchCommunications(invoiceId),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading communications…</p>;
  if (isError) return <p className="text-sm text-destructive">Could not load communications.</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No communications yet.</p>;

  return (
    <ol className="space-y-3">
      {data.map((c) => (
        <li key={c.id} className="flex items-start gap-3 rounded-md border p-3">
          <span className="mt-0.5 shrink-0">
            {c.direction === "INBOUND" ? (
              <ArrowDownLeft className="h-4 w-4 text-emerald-600" aria-label="Reply" />
            ) : c.channel === "EMAIL" ? (
              <Mail className="h-4 w-4 text-muted-foreground" aria-label="Email" />
            ) : (
              <MessageCircle className="h-4 w-4 text-muted-foreground" aria-label="WhatsApp" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {c.direction === "INBOUND"
                  ? `Reply via ${c.channel === "EMAIL" ? "email" : "WhatsApp"}`
                  : (c.subject ?? c.templateId ?? "Message")}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {STATUS_LABEL[c.status]} · {new Date(c.createdAt).toLocaleString("en-IN")}
              </span>
            </div>
            {c.body && <p className="mt-1 truncate text-sm text-muted-foreground">{c.body}</p>}
            {c.errorMessage && <p className="mt-1 text-xs text-destructive">{c.errorMessage}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
```

Export it from `src/modules/invoices/components/index.ts`:

```ts
export { CommunicationTimeline } from "./communication-timeline";
```

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `npx vitest run tests/unit && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/invoices tests/unit/api/invoice-communications.test.ts src/modules/invoices/components
git commit -m "feat(phase4): invoice communications API and timeline component"
```

---

### Task 11: Payment-link/UPI block in templates + auto thank-you on paid

**Files:**
- Create: `src/lib/channels/payment-block.ts`
- Modify: `src/server/services/ai-email.service.ts` (append payment block to reminder emails)
- Modify: `src/lib/jobs/types.ts`, `src/lib/jobs/inngest/scheduler.ts` (new `INVOICE_PAID` event)
- Modify: `src/server/services/invoice.service.ts` (fire event on transition to PAID)
- Modify: `src/server/workflows/inngest/functions.ts` (new `invoicePaidWorkflow`)
- Test: `tests/unit/channels/payment-block.test.ts`

**Interfaces:**
- Consumes: `communicationService.sendPaidThankYou` (Task 5).
- Produces: `buildPaymentBlock(opts: { upiId: string | null; paymentLink: string | null }): { html: string; text: string }`; event `JOB_EVENTS.INVOICE_PAID = "invoicepilot/invoice.paid"`; `JobScheduler.enqueueInvoicePaid(organizationId: string, invoiceId: string): Promise<void>`.

- [ ] **Step 1: Write the failing test** `tests/unit/channels/payment-block.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPaymentBlock } from "@/lib/channels/payment-block";

describe("buildPaymentBlock", () => {
  it("renders UPI id and payment link when present", () => {
    const block = buildPaymentBlock({ upiId: "acme@okhdfcbank", paymentLink: "https://pay.example/inv042" });
    expect(block.html).toContain("acme@okhdfcbank");
    expect(block.html).toContain("https://pay.example/inv042");
    expect(block.text).toContain("UPI: acme@okhdfcbank");
    expect(block.text).toContain("Pay online: https://pay.example/inv042");
  });

  it("renders only the configured pieces", () => {
    const upiOnly = buildPaymentBlock({ upiId: "acme@upi", paymentLink: null });
    expect(upiOnly.text).toContain("UPI: acme@upi");
    expect(upiOnly.text).not.toContain("Pay online");
  });

  it("returns empty strings when nothing is configured", () => {
    expect(buildPaymentBlock({ upiId: null, paymentLink: null })).toEqual({ html: "", text: "" });
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement** `src/lib/channels/payment-block.ts`:

```ts
export interface PaymentBlockOptions {
  upiId: string | null;
  paymentLink: string | null;
}

/** Escape user-configured values before HTML interpolation. */
function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildPaymentBlock(opts: PaymentBlockOptions): { html: string; text: string } {
  const lines: { html: string; text: string }[] = [];
  if (opts.upiId) {
    lines.push({ html: `<strong>UPI:</strong> ${esc(opts.upiId)}`, text: `UPI: ${opts.upiId}` });
  }
  if (opts.paymentLink) {
    const safe = esc(opts.paymentLink);
    lines.push({
      html: `<strong>Pay online:</strong> <a href="${safe}">${safe}</a>`,
      text: `Pay online: ${opts.paymentLink}`,
    });
  }
  if (lines.length === 0) return { html: "", text: "" };
  return {
    html: `<div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;"><p style="margin:0 0 4px;font-weight:600;">How to pay</p>${lines.map((l) => `<p style="margin:0;">${l.html}</p>`).join("")}</div>`,
    text: `\n\nHow to pay\n${lines.map((l) => l.text).join("\n")}`,
  };
}
```

Run: `npx vitest run tests/unit/channels/payment-block.test.ts` → PASS.

- [ ] **Step 3: Append the block to reminder emails.** In `src/server/services/ai-email.service.ts`, after `const parsed = parseAiEmailJson(...)` and before building `bodyHtml`, load settings and append (uses `org.reminderSettings` already fetched via `organizationRepository.findById`):

```ts
    const paymentBlock = buildPaymentBlock({
      upiId: org.reminderSettings?.upiId ?? null,
      paymentLink: org.reminderSettings?.paymentLink ?? null,
    });

    const bodyHtml = renderBaseEmailTemplate({
      title: parsed.subject,
      bodyHtml: textToHtmlParagraphs(parsed.bodyText) + paymentBlock.html,
    });
```

and return `bodyText: parsed.bodyText + paymentBlock.text` (import `buildPaymentBlock` at top). The WhatsApp side already carries the link as template param 5 (Task 7).

- [ ] **Step 4: Add the INVOICE_PAID job.**

`src/lib/jobs/types.ts`:

```ts
export interface JobScheduler {
  scheduleReminderScan(): Promise<void>;
  enqueueReminder(reminderId: string): Promise<void>;
  enqueueReminders(reminderIds: string[]): Promise<void>;
  enqueueOverdueCheck(organizationId: string): Promise<void>;
  enqueueOverdueChecks(organizationIds: string[]): Promise<void>;
  enqueueInvoicePaid(organizationId: string, invoiceId: string): Promise<void>;
}

export const JOB_EVENTS = {
  REMINDER_SCAN: "invoicepilot/reminder.scan",
  SEND_REMINDER: "invoicepilot/reminder.send",
  OVERDUE_CHECK: "invoicepilot/invoice.overdue-check",
  INVOICE_PAID: "invoicepilot/invoice.paid",
} as const;
```

`src/lib/jobs/inngest/scheduler.ts` — add to `InngestJobScheduler`:

```ts
  async enqueueInvoicePaid(organizationId: string, invoiceId: string): Promise<void> {
    await inngest.send({
      name: JOB_EVENTS.INVOICE_PAID,
      data: { organizationId, invoiceId },
    });
  }
```

- [ ] **Step 5: Fire on transition to PAID.** In `src/server/services/invoice.service.ts` `update`, after `await invoiceRepository.update(organizationId, id, updateData);` add:

```ts
    if (status === "PAID" && existing.status !== "PAID") {
      await getJobScheduler().enqueueInvoicePaid(organizationId, id);
    }
```

(import `getJobScheduler` from `@/lib/jobs/inngest/scheduler` at top).

- [ ] **Step 6: Add the workflow.** In `src/server/workflows/inngest/functions.ts`:

```ts
import { communicationService } from "@/server/services/communication.service";

export const invoicePaidWorkflow = inngest.createFunction(
  { id: "invoice-paid-thank-you", name: "Send Thank-You on Payment" },
  { event: JOB_EVENTS.INVOICE_PAID },
  async ({ event, step }) => {
    const organizationId = event.data.organizationId as string;
    const invoiceId = event.data.invoiceId as string;
    return step.run("send-thank-you", () =>
      communicationService.sendPaidThankYou(organizationId, invoiceId),
    );
  },
);

export const inngestFunctions = [
  reminderScanWorkflow,
  sendReminderWorkflow,
  overdueCheckWorkflow,
  invoicePaidWorkflow,
];
```

- [ ] **Step 7: Run everything**

Run: `npx vitest run tests/unit && npm run typecheck && npm run lint && npm run build`
Expected: all PASS/green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/channels/payment-block.ts src/server/services/ai-email.service.ts src/lib/jobs src/server/services/invoice.service.ts src/server/workflows/inngest/functions.ts tests/unit/channels/payment-block.test.ts
git commit -m "feat(phase4): payment block in templates and auto thank-you on paid"
```

---

### Task 12: Phase gate — sandbox end-to-end on both channels

**Files:**
- Create: `docs/COMMUNICATIONS.md` (channel architecture, webhook setup, template registry, opt-out behavior)
- Create: `docs/setup/PHASE-4-GATE.md` (checklist + sign-off)

**Interfaces:**
- Consumes: everything above; Phase 0 provisioning (Resend domain, WhatsApp sandbox number, approved templates in `docs/setup/WHATSAPP_TEMPLATES.md`).

- [ ] **Step 1: Write `docs/COMMUNICATIONS.md`** covering: the `ChannelProvider` interface + registry, env var list, webhook endpoints and how to configure them (Resend dashboard → Webhooks → `https://<domain>/api/webhooks/resend`, events: sent/delivered/bounced/opened; Meta App Dashboard → WhatsApp → Configuration → Callback URL `https://<domain>/api/webhooks/whatsapp` + verify token, subscribe to `messages`), template registry table (tone → template name), quiet hours + escalation semantics, opt-out semantics (STOP keywords, per-channel `*OptOutAt` on Party, resettable via `communicationService.setOptOut`), and the note that FINAL_NOTICE reuses `payment_reminder_firm` pending a dedicated template approval (open follow-up).

- [ ] **Step 2: USER ACTION — configure sandbox endpoints.** User (or agent with access to the Cloudflare dashboard → Project → Settings → Environment Variables) confirms all env vars from the header exist in the target environment; registers both webhook URLs against a deployed preview; adds a WhatsApp sandbox/test recipient number and a test inbox.

- [ ] **Step 3: Execute the end-to-end gate script (manual, recorded in `PHASE-4-GATE.md`):**
  1. Create a test invoice due 5 days ago for a party with both a real test email and the sandbox WhatsApp number.
  2. Trigger scheduling: `POST /api/reminders/trigger` (existing route) or run the Inngest `overdue-check` for the org from the Inngest dev UI (`npx inngest-cli@latest dev` locally).
  3. Verify: `Reminder` row created with escalation tone for its `dayOffset`; `send-reminder` run visible in Inngest; two `CommunicationLog` rows (EMAIL + WHATSAPP) reach `SENT` with `providerId`s.
  4. Verify webhooks: email arrives → Resend fires `delivered` → EMAIL row becomes `DELIVERED` (open the email → `READ`); WhatsApp template arrives → row progresses `DELIVERED` → `READ`.
  5. Reply from the sandbox number ("will pay Friday") → INBOUND row appears; `GET /api/invoices/:id/communications` shows it on the timeline.
  6. Reply `STOP` → `Party.whatsappOptOutAt` set; re-trigger a reminder → only EMAIL is sent.
  7. Set quiet hours to span "now" → trigger a reminder → Inngest run shows `sleepUntil`; clear quiet hours.
  8. Mark the invoice PAID in the UI/API → thank-you email + WhatsApp template arrive; remaining scheduled reminders cancel on their next run.
  9. Confirm every send/opt-out produced an `AuditLog` row (actor `SYSTEM`).
- [ ] **Step 4: Record results** — each gate item ticked with evidence (log ids, screenshots, Inngest run URLs) in `docs/setup/PHASE-4-GATE.md`; list open risks (e.g. final-notice template approval pending).
- [ ] **Step 5: USER ACTION — user signs off** (name + date in the gate doc). Per the master plan, Phase 5/6 detailed plans may then consume this phase's interfaces.
- [ ] **Step 6: Commit**

```bash
git add docs/COMMUNICATIONS.md docs/setup/PHASE-4-GATE.md
git commit -m "docs(phase4): communications runbook and phase gate record"
```

---

## Self-Review Notes

- **Spec coverage against parent plan Phase 4:** (1) `ChannelProvider` + email refactor + WhatsApp provider → Tasks 2–4 (template messages in Task 4 Step 1/3; session messages via the no-template text path, used for future reply handling); (2) fan-out per enabled channel, per-party prefs, quiet hours, configurable escalation friendly→professional→firm→final notice → Tasks 1, 5, 6, 7; (3) Resend + WhatsApp webhooks → `CommunicationLog`, replies on invoice timeline, STOP/opt-out per channel → Tasks 8, 9, 10 and `recordInbound`/`setOptOut` in Task 5; (4) payment-link/UPI block + auto thank-you → Task 11; phase gate → Task 12.
- **Type consistency check:** `Channel`/`OutboundMessage`/`SendResult` defined once in Task 2 and imported everywhere; `communicationService` signatures in Task 5 match every call site in Tasks 7–11 (`sendOutbound(organizationId, actor, input)`, `handleProviderStatus(channel, providerId, status, occurredAt, errorMessage?)`); `WHATSAPP_TEMPLATE_BY_TONE` (Task 4) is keyed by `EmailTone` which gains `FINAL_NOTICE` in Task 1.
- **Assumptions on parallel-written Phase 1** are isolated in the "Consumes" contract block; Task 1 explicitly instructs reconciling (not inventing) if the Phase 1 schema differs, and enum definitions are marked "reuse if Phase 1 already defined".
- **Deviations recorded:** Resend called via raw `fetch` (not the `resend` SDK) so tests mock provider HTTP per contract; `WHATSAPP_APP_SECRET` + `WHATSAPP_TEMPLATE_LANGUAGE` env vars added beyond Phase 0's list (webhook signature verification and template locale need them); party-lookup-by-phone lives in `communication-log.repository` rather than Phase 1's party repository to avoid editing a file another phase owns; FINAL_NOTICE maps to the approved `payment_reminder_firm` template until a dedicated template clears Meta review (tracked in the gate doc); legacy `EmailLog` remains for the manual `/api/ai/send-email` route (reminder traffic moves to `CommunicationLog`), migration of that route deferred to Phase 6.
