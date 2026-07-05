import { z } from "zod";
import { partyService } from "@/server/services/party.service";
import { withAudit } from "@/server/services/audit.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["CUSTOMER", "SUPPLIER", "AGENT", "BOTH"]).default("CUSTOMER"),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  gstin: z.string().max(15).optional(),
  creditDays: z.number().int().nonnegative().optional(),
  creditLimit: z.number().nonnegative().optional(),
});

export const createParty: ToolDefinition<z.infer<typeof schema>> = {
  name: "create_party",
  kind: "write",
  description: "Create a new party (customer/supplier). Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 200 },
      type: { type: "string", enum: ["CUSTOMER", "SUPPLIER", "AGENT", "BOTH"] },
      email: { type: "string", format: "email" },
      phone: { type: "string", maxLength: 30 },
      gstin: { type: "string", maxLength: 15 },
      creditDays: { type: "integer", minimum: 0 },
      creditLimit: { type: "number", minimum: 0 },
    },
    required: ["name"],
    additionalProperties: false,
  },
  summarize: (i) => `Create party "${i.name}" (${i.type})`,
  async execute(ctx, input) {
    const actor = { type: "ASSISTANT" as const, id: ctx.userId };
    const result = await withAudit(
      actor,
      "create_party",
      { organizationId: ctx.organizationId, entityType: "Party" },
      () => partyService.create(ctx.organizationId, input, actor),
    );
    return { ok: true, data: result };
  },
};
