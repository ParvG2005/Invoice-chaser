import { z } from "zod";
import { stockService } from "@/server/services/stock.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  itemId: z.string().min(1),
  delta: z.number().refine((v) => v !== 0, "delta must be non-zero"),
  reason: z.string().min(1).max(500),
});

export const adjustStock: ToolDefinition<z.infer<typeof schema>> = {
  name: "adjust_stock",
  kind: "write",
  description:
    "Manually correct an item's stock by a +/- quantity delta, with a required reason. Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      itemId: { type: "string" },
      delta: { type: "number", description: "Positive to add stock, negative to remove." },
      reason: { type: "string", minLength: 1, maxLength: 500 },
    },
    required: ["itemId", "delta", "reason"],
    additionalProperties: false,
  },
  summarize: (i) => `Adjust stock of item ${i.itemId} by ${i.delta > 0 ? "+" : ""}${i.delta} (${i.reason})`,
  async execute(ctx, input) {
    const actor = { type: "ASSISTANT" as const, id: ctx.userId };
    // stockService.adjust already wraps itself in withAudit ("stock.adjust")
    // — do not double-wrap here, or every approved action would produce
    // two AuditLog rows instead of one.
    const result = await stockService.adjust(
      ctx.organizationId,
      input.itemId,
      { qty: input.delta, reason: input.reason },
      actor,
    );
    return { ok: true, data: result };
  },
};
