import { z } from "zod";
import { invoiceService } from "@/server/services/invoice.service";
import { withAudit } from "@/server/services/audit.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  invoiceId: z.string().min(1),
});

export const markInvoicePaid: ToolDefinition<z.infer<typeof schema>> = {
  name: "mark_invoice_paid",
  kind: "write",
  description: "Mark an invoice as PAID. Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      invoiceId: { type: "string" },
    },
    required: ["invoiceId"],
    additionalProperties: false,
  },
  summarize: (i) => `Mark invoice ${i.invoiceId} as PAID`,
  async execute(ctx, input) {
    const result = await withAudit(
      { type: "ASSISTANT", id: ctx.userId },
      "mark_invoice_paid",
      { organizationId: ctx.organizationId, entityType: "Invoice", entityId: input.invoiceId },
      () => invoiceService.update(ctx.organizationId, input.invoiceId, { status: "PAID" }),
    );
    return { ok: true, data: result };
  },
};
