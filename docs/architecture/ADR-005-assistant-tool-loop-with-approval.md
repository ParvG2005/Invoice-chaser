# ADR-005: AI assistant as an approval-gated tool loop over the service layer

- **Status:** Accepted
- **Date:** 2026-07-03

## Context

The product plan calls for an in-app AI assistant that can operate the whole product ("send this reminder," "mark this invoice paid," "import these vouchers") conversationally, using the Claude API. Giving a language model direct database or arbitrary-code access is a well-known path to data corruption, cross-tenant leaks, and unreviewable mutations — especially with untrusted text (invoice descriptions, incoming emails) potentially reaching the model as part of tool results.

## Decision

The assistant is a tool-calling loop over the *existing* service layer — never raw SQL or direct Prisma access. Each tool is a thin, zod-validated wrapper around one `server/services` method. Guardrails, all enforced server-side: (a) reads execute immediately, every write returns a *pending* `AssistantAction` the user must explicitly approve in the UI before it executes; (b) `organizationId` is injected into every tool call from the authenticated session, never accepted as model output, so the model cannot widen scope by claiming a different org; (c) the system prompt and tool-result handling treat retrieved content (invoice text, email bodies) as untrusted data, never as instructions; (d) per-organization rate limits and token budgets (Upstash-backed); (e) every proposed and executed action is written to the `AssistantAction`/`AuditLog` trail; (f) no browsing and no arbitrary code execution — the assistant's world is the product's own service layer and the org's own data, nothing else.

## Alternatives considered

- **Direct database/Prisma access for the assistant (its own query tool):** rejected — bypasses every authorization and validation rule already enforced in the service layer, and makes prompt-injection-driven data exfiltration or corruption far easier to trigger and far harder to audit.
- **Auto-execute all assistant actions, surface an undo instead of a pre-approval gate:** rejected — some actions (sending a WhatsApp/email reminder to a real customer) are not meaningfully undoable once sent; the program's global constraint ("all writes by the assistant require explicit user approval") rules this out directly.
- **General-purpose agent framework with broad tool/browsing access:** rejected — the assistant's job is operating *this* product for *this* org, not open-ended web research; unrestricted browsing/code execution is unnecessary attack surface for the stated use case.

## Consequences

- Easier: every assistant capability automatically inherits the service layer's existing validation, org-scoping, and business rules — no parallel authorization system to maintain; the approval queue doubles as a natural audit/undo point before anything irreversible happens.
- Harder: every new assistant capability requires an explicit tool wrapper (no generic "run any service method" escape hatch), and the UI must support a pending-approval queue and per-action review, which is nontrivial screen real estate (Phase 3/6 work).
- Committing to: no assistant write path ever bypasses the pending-approval queue, and no tool ever accepts `organizationId` (or any other authorization-relevant field) from model-generated input.
