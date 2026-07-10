# tally-agent

Read-only push-agent. Runs on the office PC where Tally Prime lives, pulls
Ledgers / Stock Items / Day Book XML from Tally's LAN gateway, and POSTs each to
`https://<appUrl>/api/import/tally` with `Authorization: Bearer <apiKey>` in FK
order (ledgers → stock → vouchers). Idempotent server-side (GUID+ALTERID) — safe
to re-run hourly. Never writes to Tally.

## Prerequisites

1. Enable Tally's HTTP gateway: `Gateway of Tally → F1 (Help) → Advanced Config
   → set "TallyPrime acts as" = Both, Port = 9000`. Restart Tally.
2. Node `>=22 <23`.
3. An API key: app → Settings → API Keys → create → copy the `oc_live_…` value
   (shown once).

## Setup

```
cp config.example.json config.json
# edit config.json: paste apiKey, set voucherFrom/voucherTo window
node src/index.ts config.json
```

Config fields: `tallyHost`, `tallyPort`, `appUrl`, `apiKey`, `voucherFrom`,
`voucherTo`, and optional `bypassSecret`.

### Vercel Deployment Protection

If the app has Deployment Protection (Vercel Authentication) enabled, set
`bypassSecret` to the project's **Protection Bypass for Automation** secret
(Vercel → project → Settings → Deployment Protection). The agent sends it as the
`x-vercel-protection-bypass` header so its keyed requests reach the app. Leave
`bypassSecret` empty ("") if protection is off. This secret is separate from the
API key — never commit `config.json`.

## Scheduling (hourly)

Windows Task Scheduler → Create Task → Trigger: daily, repeat every 1 hour →
Action: `node` with args `src\index.ts config.json`, start-in = this folder.
Non-zero exit on failure → Task Scheduler flags it.

## Test

```
npx vitest run --config vitest.config.ts
```

## Dry-run caveat

The Tally export-request `<ID>` report names (`Ledgers`, `List of Accounts`,
`Day Book`) and the masters-vs-vouchers request shape are validated against a
live Tally Prime instance. If the gateway 4xxs a request, adjust the report ids
in `src/tally-client.ts` (`buildExportRequest`) and re-run. See `docs/TALLY.md`.
