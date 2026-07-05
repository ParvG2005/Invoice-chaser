import { z } from "zod";
import { invoiceService } from "@/server/services/invoice.service";
import { wrapUntrusted } from "@/lib/assistant/untrusted";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  status: z.enum(["PENDING", "OVERDUE", "PAID"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const searchInvoices: ToolDefinition<z.infer<typeof schema>> = {
  name: "search_invoices",
  kind: "read",
  description:
    "List invoices for the current organization, optionally filtered by status. Returns id, number, client, amount, dueDate, status.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["PENDING", "OVERDUE", "PAID"], description: "Filter by invoice status." },
      limit: { type: "integer", minimum: 1, maximum: 100, description: "Max rows to return." },
      cursor: { type: "string", description: "Pagination cursor from a prior call." },
    },
    additionalProperties: false,
  },
  summarize: (i) => `Search invoices${i.status ? ` (status=${i.status})` : ""}`,
  async execute(ctx, input) {
    const rows = await invoiceService.list(ctx.organizationId, {
      status: input.status,
      take: input.limit,
      cursor: input.cursor,
    });
    // invoiceService.list returns the full InvoiceDto (notes + party.name
    // included), not just the narrow id/number/client/amount/dueDate/status
    // set this tool's description implies — fence both free-text fields.
    const safe = rows.map((row) => ({
      ...row,
      clientName: wrapUntrusted("invoice_client_name", String(row.clientName)),
      notes: row.notes ? wrapUntrusted("invoice_notes", String(row.notes)) : null,
      party: row.party ? { ...row.party, name: wrapUntrusted("party_name", String(row.party.name)) } : null,
    }));
    return { ok: true, data: safe };
  },
};
