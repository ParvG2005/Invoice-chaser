import { z } from "zod";
import { invoiceService } from "@/server/services/invoice.service";
import { wrapUntrusted } from "@/lib/assistant/untrusted";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({ invoiceId: z.string().min(1) });

export const getInvoice: ToolDefinition<z.infer<typeof schema>> = {
  name: "get_invoice",
  kind: "read",
  description: "Fetch a single invoice by id, including line items and payment history.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: { invoiceId: { type: "string", description: "The invoice id." } },
    required: ["invoiceId"],
    additionalProperties: false,
  },
  summarize: (i) => `Get invoice ${i.invoiceId}`,
  async execute(ctx, input) {
    const invoice = await invoiceService.get(ctx.organizationId, input.invoiceId);
    if (!invoice) return { ok: false, error: "Invoice not found" };
    // Free-text fields are DB-sourced and untrusted.
    const safe = {
      ...invoice,
      clientName: wrapUntrusted("invoice_client_name", String(invoice.clientName)),
      notes: invoice.notes ? wrapUntrusted("invoice_notes", String(invoice.notes)) : null,
    };
    return { ok: true, data: safe };
  },
};
