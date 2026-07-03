# Architecture Decision Records

Index of accepted architecture decisions for InvoicePilot (Invoice Chaser). Each phase plan cites these by number; do not restate the rationale elsewhere — link here instead.

| ADR | Title | Summary |
|---|---|---|
| [ADR-001](ADR-001-monolith-on-cloudflare-pages.md) | Single Next.js monolith on Cloudflare Pages | One deployable: Next.js API routes + Inngest background jobs, no microservices. Hosting amended 2026-07-04 from Vercel to Cloudflare Pages (OpenNext adapter). |
| [ADR-002](ADR-002-party-centric-ledger.md) | Party-centric ledger data model | `Party` (customer/supplier/agent) as the hub; `Payment` allocations, `Item`/`StockMovement`, `Bill` replace free-text client fields. |
| [ADR-003](ADR-003-tally-file-first-import.md) | Tally integration is file-first, schema-complete | User-exported Masters/Voucher XML, full voucher schema, idempotent on `GUID`+`ALTERID`. LAN HTTP-XML sync deferred. |
| [ADR-004](ADR-004-channel-abstracted-messaging.md) | Channel-abstracted messaging | One `ChannelProvider` interface for Resend (email) + Meta WhatsApp Cloud API; unified `CommunicationLog`. |
| [ADR-005](ADR-005-assistant-tool-loop-with-approval.md) | AI assistant tool loop with approval | Assistant only calls service-layer tool wrappers; every write is a pending `AssistantAction` requiring explicit user approval; org scope injected server-side, never from model output. |

## Non-ADR conventions

These are process/tooling choices recorded here for visibility, not standalone architecture decisions:

- **Stitch-first UI.** Every new or rewritten screen is designed/iterated in Stitch (project "InvoicePilot", design system derived from `src/app/globals.css` tokens) before being implemented as shadcn/Tailwind components. See `docs/design/DESIGN_SYSTEM.md`.
- **Precomputed + live analytics.** Dashboard/analytics service combines live queries with SQL views/materialized queries refreshed by Inngest for heavier aggregates (aging buckets, DSO, stock valuation). No dedicated ADR — this is an implementation strategy under ADR-001's monolith, revisited if query load ever demands a separate analytics store.

## Layered architecture convention

Every request/mutation flows through the same layers, in this order, with no skipping:

```
app/api route (zod-validated input) → lib/api/handler → server/services → server/repositories → Prisma
```

The AI assistant's tool registry (ADR-005) calls into `server/services` at the same layer a route handler would — it never goes around repositories or Prisma directly.
