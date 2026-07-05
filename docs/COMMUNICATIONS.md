# Communications (Phase 4)

Email-only in this repo. WhatsApp was scoped out mid-implementation — see "Deferred" below.

## Architecture

`ChannelProvider` interface (`src/lib/channels/channel-provider.ts`):

```ts
type Channel = "EMAIL" | "WHATSAPP";
interface OutboundMessage {
  channel: Channel; to: string; subject?: string; bodyHtml?: string; bodyText?: string;
  templateId?: string; templateParams?: string[]; replyTo?: string;
}
interface SendResult { providerId: string; success: boolean; error?: string; }
interface ChannelProvider { name: string; channel: Channel; send(msg): Promise<SendResult>; }
```

Registry (`src/lib/channels/registry.ts`) resolves a provider per channel, lazily, and caches it:
- `EMAIL` → `createResendProvider()` if `RESEND_API_KEY` is set, else a legacy SMTP adapter (dev fallback, wraps the existing nodemailer `EmailProvider`).
- `WHATSAPP` → throws `No provider registered for channel WHATSAPP` — intentionally not wired.
- `setChannelProvider`/`resetChannelProviders` let tests inject a fake provider.

## Env vars

| Var | Purpose |
|---|---|
| `RESEND_API_KEY` | Enables the Resend provider; without it, EMAIL falls back to SMTP. |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret for `/api/webhooks/resend`; route returns 503 if unset. |

## `communication.service` (`src/server/services/communication.service.ts`)

Org-scoped. Key methods:

- `sendOutbound(organizationId, actor, input)` — creates a `QUEUED` `CommunicationLog` row, calls the resolved `ChannelProvider`, updates the row to `SENT`/`FAILED`. Wrapped in `withAudit` (action `communication.send`) so every send produces an `AuditLog` row.
- `handleProviderStatus(channel, providerId, status, occurredAt, errorMessage?)` — looks up the log row by provider id, applies the transition only if `communicationLogRepository.canTransition` allows it (no downgrading `DELIVERED` back to `SENT`, etc.), stamps `sentAt`/`deliveredAt`/`readAt`.
- `recordInbound(input)` — matches an inbound message to a `Party` by phone (last 10 digits), detects opt-out keywords, links to the party's latest open invoice, writes an `INBOUND` log row.
- `setOptOut(organizationId, actor, partyId, channel, optedOut)` — sets/clears `Party.emailOptOutAt` or `whatsappOptOutAt`. Wrapped in `withAudit` (action `communication.opt-out`).
- `listForInvoice(organizationId, invoiceId)` — the timeline data source, org-scoped.
- `resolveChannels(settings, party, contact)` — intersects org `enabledChannels` with party `preferredChannels`, then drops any channel that's opted out or has no address on file.
- `sendPaidThankYou(organizationId, invoiceId)` — sends only on the `EMAIL` branch of the resolved channels (WhatsApp branch is filtered out, not sent); logs and continues on a per-channel failure rather than throwing.

## Quiet hours (`src/lib/channels/quiet-hours.ts`)

`nextAllowedSendTime(now, { quietHoursStart, quietHoursEnd, timezone })` returns `now` if sending is allowed, or the moment the quiet window ends (computed in the org's IANA timezone via `Intl.DateTimeFormat`). A degenerate config (`start === end`) means no quiet hours. Consumed by `reminderService.getQuietHoursDeferral`, which the `send-reminder` Inngest function (`src/server/workflows/inngest/functions.ts`) uses to `step.sleepUntil` before sending.

## Escalation tone (`src/lib/channels/escalation.ts`)

`toneForOffset(reminderDays, escalationTones, dayOffset)` — the Nth reminder day (sorted ascending) uses the Nth configured tone (`ReminderSettings.escalationTones`, default `[FRIENDLY, PROFESSIONAL, FIRM, FINAL_NOTICE]`). More reminder steps than tones clamps to the last (most severe) tone.

## Resend webhook (`src/app/api/webhooks/resend/route.ts`)

- Verifies `svix-id`/`svix-timestamp`/`svix-signature` headers against `RESEND_WEBHOOK_SECRET` (`src/lib/channels/webhook-signature.ts`).
- Maps event types to `CommunicationStatus`: `email.sent → SENT`, `email.delivered → DELIVERED`, `email.opened → READ`, `email.bounced` / `email.complained → BOUNCED`.
- Calls `communicationService.handleProviderStatus("EMAIL", data.email_id, status, created_at, bounceMessage?)`.
- Always returns 200 for a verified payload (even on an unrecognized event type) so Resend doesn't retry; 401 on bad signature; 503 if the secret isn't configured.

**Dashboard setup:** Resend dashboard → Webhooks → add endpoint `https://<domain>/api/webhooks/resend` → subscribe to `email.sent`, `email.delivered`, `email.bounced`, `email.opened`, `email.complained` → copy the signing secret into `RESEND_WEBHOOK_SECRET`.

## Invoice communications timeline

- API: `GET /api/invoices/:id/communications` (`src/app/api/invoices/[id]/communications/route.ts`) → `communicationService.listForInvoice`, org-scoped via `withApiHandler`.
- UI: `src/modules/invoices/components/communication-timeline.tsx` renders the returned `CommunicationLogDto[]` (channel, direction, status, timestamps) for an invoice detail page.

## Payment block + auto thank-you

- `buildPaymentBlock({ upiId, paymentLink })` (`src/lib/channels/payment-block.ts`) renders an HTML-escaped "How to pay" block (UPI id and/or payment link) appended to reminder/thank-you email bodies; returns empty strings if neither is configured.
- On invoice `PAID`, `invoiceService.update` best-effort enqueues `enqueueInvoicePaid` (non-fatal if the job scheduler fails — logged, not thrown). The `invoice-paid-thank-you` Inngest function calls `communicationService.sendPaidThankYou`, which sends a thank-you email and lets already-scheduled reminders no-op on their next run (each `sendReminder` re-checks invoice status and cancels if already paid).

## Opt-out semantics (email)

- Inbound body matched case-insensitively against `{"stop", "unsubscribe", "opt out", "optout", "stop all"}`.
- Sets `Party.emailOptOutAt` (or `whatsappOptOutAt`, unused today) to the receive timestamp.
- `resolveChannels` drops any channel with a non-null `*OptOutAt` for that party.
- Reversible: `communicationService.setOptOut(orgId, actor, partyId, "EMAIL", false)` clears the timestamp.
- Every opt-out write goes through `withAudit` (action `communication.opt-out`), so it lands in `AuditLog` with actor `SYSTEM` (inbound webhook path) or the acting user (manual toggle, if wired to a UI action).

## Deferred: WhatsApp

WhatsApp Cloud API integration (provider, inbound webhook, template registry, `docs/setup/WHATSAPP_TEMPLATES.md`) was scoped out of Phase 4 mid-implementation by user decision (Tasks 4 and 9 of the original plan were dropped). Nothing in this codebase sends or receives on the `WHATSAPP` channel:

- `getChannelProvider("WHATSAPP")` throws.
- `communicationService.resolveChannels` and `sendPaidThankYou` may still compute `"WHATSAPP"` as an eligible channel if org/party settings allow it, but `sendPaidThankYou` filters to `EMAIL` only before sending, and there is no reminder fan-out path that dispatches WhatsApp either.
- Schema fields (`CommunicationChannel` enum, `Party.preferredChannels`, `Party.whatsappOptOutAt`, `ReminderSettings.enabledChannels`) still allow the `WHATSAPP` value for forward compatibility — no migration is needed to add WhatsApp support later, only a provider + webhook + templates.
