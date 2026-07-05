import { z } from "zod";
import { invoiceService } from "@/server/services/invoice.service";
import { withAudit } from "@/server/services/audit.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  invoiceId: z.string().min(1),
  clientName: z.string().min(1).max(200).optional(),
  clientEmail: z.string().email().optional(),
  clientPhone: z.string().max(30).optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().min(1).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateInvoice: ToolDefinition<z.infer<typeof schema>> = {
  name: "update_invoice",
  kind: "write",
  description: "Update fields on an existing invoice. Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      invoiceId: { type: "string" },
      clientName: { type: "string", minLength: 1, maxLength: 200 },
      clientEmail: { type: "string", format: "email" },
      clientPhone: { type: "string", maxLength: 30 },
      amount: { type: "number", exclusiveMinimum: 0 },
      dueDate: { type: "string", description: "ISO date." },
      notes: { type: "string", maxLength: 2000 },
    },
    required: ["invoiceId"],
    additionalProperties: false,
  },
  summarize: (i) => {
    const fields = Object.keys(i).filter((k) => k !== "invoiceId");
    return `Update invoice ${i.invoiceId} (${fields.join(", ") || "no fields"})`;
  },
  async execute(ctx, input) {
    const { invoiceId, ...fields } = input;
    const result = await withAudit(
      { type: "ASSISTANT", id: ctx.userId },
      "update_invoice",
      { organizationId: ctx.organizationId, entityType: "Invoice", entityId: invoiceId },
      () => invoiceService.update(ctx.organizationId, invoiceId, fields),
    );
    return { ok: true, data: result };
  },
};
