import { z } from "zod";
import { billService } from "@/server/services/bill.service";
import { withAudit } from "@/server/services/audit.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

/**
 * The brief flagged `create-bill.ts` / `billService` as a candidate for
 * `disabled: true`, but `src/server/services/bill.service.ts` does exist and
 * exports `create(organizationId, input, actor)` with a payable-side shape
 * that matches `createBillSchema` — so this tool is implemented normally,
 * not disabled.
 */
const schema = z.object({
  partyId: z.string().min(1),
  billNumber: z.string().min(1).max(100),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().min(1),
  amount: z.number().positive(),
  notes: z.string().max(2000).optional(),
});

export const createBill: ToolDefinition<z.infer<typeof schema>> = {
  name: "create_bill",
  kind: "write",
  description:
    "Create a new payable bill from a supplier. Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      partyId: { type: "string" },
      billNumber: { type: "string", minLength: 1, maxLength: 100 },
      billDate: { type: "string", description: "YYYY-MM-DD" },
      dueDate: { type: "string", description: "ISO date." },
      amount: { type: "number", exclusiveMinimum: 0 },
      notes: { type: "string", maxLength: 2000 },
    },
    required: ["partyId", "billNumber", "dueDate", "amount"],
    additionalProperties: false,
  },
  summarize: (i) => `Create bill ${i.billNumber} from party ${i.partyId} — ₹${i.amount.toLocaleString("en-IN")} due ${i.dueDate}`,
  async execute(ctx, input) {
    const actor = { type: "ASSISTANT" as const, id: ctx.userId };
    const result = await withAudit(
      actor,
      "create_bill",
      { organizationId: ctx.organizationId, entityType: "Bill" },
      () => billService.create(ctx.organizationId, input, actor),
    );
    return { ok: true, data: result };
  },
};
