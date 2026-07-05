# Phase 4 Gate: Communications (email-only)

Scope note: this phase gate is email-only. WhatsApp (Tasks 4 and 9 of the original plan)
was dropped mid-implementation per user decision; there is no WhatsApp provider or webhook
to gate. See `docs/COMMUNICATIONS.md` → "Deferred" for detail.

Environment note: this worktree is sandboxed — no reachable Postgres (`P1001` confirmed
earlier this session), no deployed preview URL, no live Resend account/domain. Real E2E
send/webhook items below are marked pending and require the user to run them against a
live environment; they are not fabricated here.

## Automated evidence (run just now in this worktree)

```
$ npx vitest run
 Test Files  38 passed (38)
      Tests  234 passed (234)

$ npm run typecheck
> tsc --noEmit
(no errors)
```

## Step 3 checklist (adapted to email-only)

1. **Reminder scheduling with escalation tone**
   ✅ Verified via automated test — `tests/unit/services/reminder-fanout.test.ts` (`reminderService.sendReminder fan-out`: sends on EMAIL, marks reminder SENT, cancels when invoice already paid, retries on failure) plus `src/lib/channels/escalation.ts`'s `toneForOffset` unit coverage in that same suite for tone-by-day-offset selection.

2. **`send-reminder` Inngest run visible / CommunicationLog reaches SENT with providerId**
   ✅ Verified via automated test (mocked) — `tests/unit/services/communication.service.test.ts` (`sendOutbound`: creates QUEUED log, sends via provider, marks SENT with `providerId`) and `reminder-fanout.test.ts` for the reminder→send path.
   ⬜ Pending — actual Inngest dev-UI run visibility requires `npx inngest-cli@latest dev` against a running app + reachable DB; not exercised here.

3. **Delivery webhook updates CommunicationLog status (SENT → DELIVERED → READ / BOUNCED)**
   ✅ Verified via automated test — `tests/unit/api/resend-webhook.test.ts` (maps `email.delivered`/`email.bounced`/`email.opened` events to log status; 401 on bad signature, 200 on unknown event types) and `communication.service.test.ts` (`handleProviderStatus`: upgrades by providerId and stamps timestamp, ignores unknown providerIds and downgrades) and `tests/unit/channels/webhook-signature.test.ts` (svix signature verification).
   ⬜ Pending — an actual email must be sent via a live Resend account and Resend's servers must fire the real webhook against a deployed URL; not exercised here.

4. **Inbound email reply appears on the invoice communications timeline**
   ✅ Verified via automated test — `communication.service.test.ts` (`recordInbound`: logs an inbound reply linked to the party's latest open invoice, drops messages from unknown numbers) and `tests/unit/api/invoice-communications.test.ts` (`GET /api/invoices/:id/communications` returns the org-scoped log).
   ⬜ Pending — no live inbound-email webhook route exists to receive a real reply in this phase (Resend inbound parsing/routing was not part of this plan's scope); confirm with the user whether inbound email capture is expected to go live via a different mechanism before relying on this in production.

5. **STOP-style opt-out (email)**
   ✅ Verified via automated test — `communication.service.test.ts` ("treats STOP as a WhatsApp opt-out" — same code path keys off `input.channel`, so an `EMAIL`-channel STOP sets `emailOptOutAt`) and `resolveChannels` tests (drops opted-out channels). Re-trigger-after-opt-out behavior is covered by `resolveChannels`'s channel-filtering test, not a full second reminder-fanout run.
   ⬜ Pending — live confirmation that a real inbound reply of "STOP" reaches `recordInbound` end-to-end requires the inbound webhook wiring noted in item 4.

6. **Quiet hours deferral**
   ✅ Verified via automated test — `tests/unit/services/reminder-fanout.test.ts` (`getQuietHoursDeferral`: returns null with no quiet hours configured) and `src/lib/channels/quiet-hours.ts`'s `nextAllowedSendTime` logic (degenerate config, in/out-of-window, cross-midnight math). No dedicated test exercises the in-quiet-hours-now branch of `getQuietHoursDeferral` directly in this suite — recommend adding one before signing off if stricter coverage is wanted.
   ⬜ Pending — actual `step.sleepUntil` visibility in the Inngest dev UI requires a live run.

7. **PAID → thank-you email; remaining reminders cancel**
   ✅ Verified via automated test — `tests/unit/invoice.service.test.ts` ("update to PAID sets paidAt", enqueues `enqueueInvoicePaid`) and `communication.service.test.ts` / `sendPaidThankYou` code path (sends EMAIL branch only, logs and continues on per-channel failure); `reminder-fanout.test.ts` ("cancels when the invoice is already paid") covers the already-scheduled-reminder no-op.
   ⬜ Pending — real email delivery of the thank-you message requires a live Resend account.

8. **AuditLog row per send/opt-out (actor SYSTEM)**
   ✅ Verified via automated test — `tests/unit/audit.service.test.ts` (`withAudit`: writes an audit row with entityId from the result, swallows audit-write failures without blocking the mutation) covers the wrapper used by `sendOutbound` (action `communication.send`) and `setOptOut` (action `communication.opt-out`). Note: `communication.service.test.ts` mocks `withAudit` as a passthrough, so it does not itself assert the audit row shape — that's covered by `audit.service.test.ts` in isolation.
   ⬜ Pending — confirming an actual `AuditLog` row lands in a real database requires the reachable Postgres instance this environment doesn't have.

9. **Payment block / UPI rendering**
   ✅ Verified via automated test — `tests/unit/channels/payment-block.test.ts` (renders UPI + link, renders only configured pieces, empty when nothing configured).

## Step 5: USER ACTION — sign-off

⬜ **Open.** Requires the user to run the live E2E gate (real Resend account + domain,
deployed preview URL, reachable Postgres) covering the "Pending" items above, then record
name + date here.

Sign-off: _(pending — not completed by the agent)_
