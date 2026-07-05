# Getting Started with InvoicePilot

A walkthrough for a new user setting up their organization for the first time.

## 1. Sign up / sign in

Go to the app URL and sign in with Clerk (email/password — no social login is wired up). First sign-in creates your `User` record automatically.

<!-- screenshot: sign-in page -->

## 2. Your organization is created automatically

There's no "create organization" step — your first authenticated request silently provisions one named "`<your name>` Workspace" with you as owner. All invoices, parties, and settings are scoped to it. Rename it under **Settings** if you want something else.

## 3. Configure Settings

Go to **Settings** in the sidebar and set:

- **Sender identity** — your business name, GSTIN, address, logo, and email signature (used on outgoing reminder emails and invoice PDFs).
- **Reminder defaults** — the default reminder sequence (offsets, tone, channel) applied to new invoices; quiet hours (a start/end time in your org's timezone during which reminders won't send).
- **Email** — reminders currently send over the operator's Gmail SMTP account, not your own — there's no per-org "connect your email" flow yet.
- **WhatsApp** — the toggle exists but sending isn't implemented yet; any switch here has no effect.

<!-- screenshot: settings page -->

## 4. Import your Tally Prime data (optional)

If you're moving from Tally Prime, follow `docs/TALLY.md` to export three XML files (ledgers, stock items, day book) and import them in that order via **Dashboard → Imports → New import**. The wizard shows a preview before committing, and a per-record result (created/updated/skipped/errored) after.

If you don't use Tally, skip this — you can add parties and invoices directly in the app.

<!-- screenshot: import wizard preview step -->

## 5. Review imported parties

After an import, open **Parties** and check for any the wizard flagged with missing email or phone — reminders can't reach a party without at least one contact channel. Fill those in.

<!-- screenshot: parties list with a flagged row -->

## 6. Send a first reminder

Open any unpaid invoice's detail page and use the **Send now** action to trigger a reminder immediately (rather than waiting for the schedule). This exercises the full send path — email today; WhatsApp once it ships. Check the invoice's timeline for the delivery status.

<!-- screenshot: invoice detail send-now confirmation -->

## 7. Read the dashboard

The dashboard's headline tiles show total receivables/payables, overdue count, reminders sent, and amount recovered, all scoped to your organization. The aging report and cashflow projection (under **Analytics**) break the same numbers down by bucket.

<!-- screenshot: dashboard headline tiles -->

## 8. Meet the assistant

Click the assistant icon to open the chat drawer (available from any page). It can look up invoices/parties, draft reminder emails, and answer questions about your receivables — but **every write it proposes (sending a reminder, editing an invoice, etc.) requires your explicit approval** before it executes; nothing happens silently. Each proposed action shows a diff summary — approve it, or reject with feedback to have the assistant try a different approach. If the assistant ever needs to be disabled entirely, that's an operator-level kill switch (see `docs/RUNBOOK.md` §6), not something you control from the UI.

<!-- screenshot: assistant drawer with a pending approval card -->
