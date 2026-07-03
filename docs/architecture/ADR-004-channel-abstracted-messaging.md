# ADR-004: Channel-abstracted messaging (dunning engine)

- **Status:** Accepted
- **Date:** 2026-07-03

## Context

Reminders currently go out over email only (Resend/Nodemailer); WhatsApp exists as a settings flag with no actual sending. The program plan requires dunning over both email and WhatsApp, with delivery status (queued/sent/delivered/read/failed/bounced) tracked per message and fed back via provider webhooks, and reminder sequences that must fan out per enabled channel without each service method knowing provider-specific request/response shapes.

## Decision

Introduce one `ChannelProvider` interface with two implementations: Resend (email) and Meta WhatsApp Cloud API (WhatsApp, pre-approved templates only — WhatsApp Business rules forbid freeform outbound messages outside a user-initiated session window). The dunning/reminder service iterates a party's enabled channels and calls each provider through the same interface; results and later webhook-driven status updates are normalized into a single `CommunicationLog` table (`channel`, `to`, `templateId`, `status`, `providerId`, links to `invoiceId`/`reminderId`). Provider-specific webhook endpoints (`/api/webhooks/resend`, WhatsApp webhook) translate provider payloads into `CommunicationLog` updates; nothing above the provider layer sees provider-specific shapes.

## Alternatives considered

- **Separate email and WhatsApp code paths with their own logs:** rejected — duplicates reminder-scheduling and status-tracking logic, and blocks the "money-to-come" and communication-timeline views (Phase 3/5) that need a unified per-party message history regardless of channel.
- **Third-party omnichannel API (e.g. a unified messaging aggregator) instead of direct Resend + Meta integrations:** rejected — adds a paid dependency and another point of failure for a two-channel need; direct integrations are well-documented and the `ChannelProvider` interface already gives us the abstraction an aggregator would sell.
- **Twilio WhatsApp as the primary WhatsApp provider:** rejected as primary, kept as documented fallback — Meta's direct Cloud API has no per-message markup, but template approval can stall; if approval exceeds ~2 weeks, Task 6 authorizes switching to Twilio WhatsApp behind the same `ChannelProvider` interface.

## Consequences

- Easier: adding a future channel (SMS, in-app notification) means one new `ChannelProvider` implementation, not a new logging/scheduling subsystem; reminder sequences are channel-agnostic.
- Harder: WhatsApp's template-approval process (Meta review, transactional-only wording) is an external dependency with unpredictable timing that email doesn't have; the interface must accommodate WhatsApp's stricter message-shape constraints (approved templates + placeholders only) without leaking them into the email path.
- Committing to: `CommunicationLog` as the single source of truth for delivery status across channels, and to Meta WhatsApp Cloud API as primary with Twilio as the named fallback if approval stalls.
