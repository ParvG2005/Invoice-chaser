import { z } from "zod";
import { invoiceService } from "@/server/services/invoice.service";
import { withAudit } from "@/server/services/audit.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

/**
 * Mirrors `createInvoiceSchema` (src/lib/validations/invoice.ts), but with
 * `clientEmail` optional — `invoiceService.create`'s widened
 * `InvoiceServiceCreateInput` accepts a missing email (Tally-derived parties
 * often have none on file), and line items are left out of the assistant's
 * surface: the model proposes an invoice by amount, not a full line-item
 * table.
 */
const schema = z.object({
  clientName: z.string().min(1).max(200),
  clientEmail: z.string().email().optional(),
  clientPhone: z.string().max(30).optional(),
  amount: z.number().positive(),
  dueDate: z.string().min(1),
  invoiceNumber: z.string().min(1).max(100),
  notes: z.string().max(2000).optional(),
  partyId: z.string().optional(),
});

export const createInvoice: ToolDefinition<z.infer<typeof schema>> = {
  name: "create_invoice",
  kind: "write",
  description:
    "Create a new receivable invoice for a client. Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      clientName: { type: "string", minLength: 1, maxLength: 200 },
      clientEmail: { type: "string", format: "email" },
      clientPhone: { type: "string", maxLength: 30 },
      amount: { type: "number", exclusiveMinimum: 0 },
      dueDate: { type: "string", description: "ISO date (YYYY-MM-DD or date-time)." },
      invoiceNumber: { type: "string", minLength: 1, maxLength: 100 },
      notes: { type: "string", maxLength: 2000 },
      partyId: { type: "string", description: "Existing party to link this invoice to." },
    },
    required: ["clientName", "amount", "dueDate", "invoiceNumber"],
    additionalProperties: false,
  },
  summarize: (i) => `Create invoice ${i.invoiceNumber} for ${i.clientName} — ₹${i.amount.toLocaleString("en-IN")} due ${i.dueDate}`,
  async execute(ctx, input) {
    const result = await withAudit(
      { type: "ASSISTANT", id: ctx.userId },
      "create_invoice",
      { organizationId: ctx.organizationId, entityType: "Invoice" },
      () => invoiceService.create(ctx.organizationId, input),
    );
    return { ok: true, data: result };
  },
};
