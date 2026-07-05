import { z } from "zod";
import { invoiceService } from "@/server/services/invoice.service";
import { withAudit } from "@/server/services/audit.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const writeOffInvoice: ToolDefinition<z.infer<typeof schema>> = {
  name: "write_off_invoice",
  kind: "write",
  description:
    "Mark an invoice WRITTEN_OFF (bad debt). The reason is appended to the invoice's notes. Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      invoiceId: { type: "string" },
      reason: { type: "string", maxLength: 500 },
    },
    required: ["invoiceId"],
    additionalProperties: false,
  },
  summarize: (i) => `Write off invoice ${i.invoiceId}${i.reason ? ` (${i.reason})` : ""}`,
  async execute(ctx, input) {
    const result = await withAudit(
      { type: "ASSISTANT", id: ctx.userId },
      "write_off_invoice",
      { organizationId: ctx.organizationId, entityType: "Invoice", entityId: input.invoiceId },
      () => invoiceService.writeOff(ctx.organizationId, input.invoiceId, input.reason),
    );
    return { ok: true, data: result };
  },
};
