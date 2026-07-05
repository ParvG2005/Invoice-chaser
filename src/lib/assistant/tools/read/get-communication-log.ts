import { z } from "zod";
import { communicationService } from "@/server/services/communication.service";
import { wrapUntrusted } from "@/lib/assistant/untrusted";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  invoiceId: z.string().optional(),
  partyId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const getCommunicationLog: ToolDefinition<z.infer<typeof schema>> = {
  name: "get_communication_log",
  kind: "read",
  description:
    "Fetch the email/WhatsApp communication log for an invoice (subject, body, direction, status). Requires invoiceId — communicationService currently only exposes invoice-scoped lookup, not a party-scoped one.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      invoiceId: { type: "string", description: "The invoice id. Required — see description." },
      partyId: { type: "string", description: "Accepted for forward-compatibility; not currently filterable on its own." },
      limit: { type: "integer", minimum: 1, maximum: 100, description: "Max rows to return." },
    },
    additionalProperties: false,
  },
  summarize: (i) => (i.invoiceId ? `Get communication log for invoice ${i.invoiceId}` : "Get communication log"),
  async execute(ctx, input) {
    // communicationService only exposes `listForInvoice`, not a generic
    // `list({ invoiceId, partyId, limit })` — deviation from the brief.
    // A party-only lookup (no invoiceId) has no service-layer equivalent yet.
    if (!input.invoiceId) {
      return {
        ok: false,
        error: "get_communication_log requires invoiceId; party-only lookup is not yet supported",
      };
    }
    const rows = await communicationService.listForInvoice(ctx.organizationId, input.invoiceId);
    const limited = input.limit ? rows.slice(0, input.limit) : rows;
    // Inbound WhatsApp/email replies are the top injection vector — every
    // message body (and subject, also free text) is DB-sourced and untrusted.
    const safe = limited.map((row) => ({
      ...row,
      subject: row.subject ? wrapUntrusted("communication_body", row.subject) : null,
      body: row.body ? wrapUntrusted("communication_body", row.body) : null,
    }));
    return { ok: true, data: safe };
  },
};
