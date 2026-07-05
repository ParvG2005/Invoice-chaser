import { z } from "zod";
import { partyService } from "@/server/services/party.service";
import { withAudit } from "@/server/services/audit.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  partyId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["CUSTOMER", "SUPPLIER", "AGENT", "BOTH"]).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  gstin: z.string().max(15).optional(),
  creditDays: z.number().int().nonnegative().optional(),
  creditLimit: z.number().nonnegative().optional(),
});

export const updateParty: ToolDefinition<z.infer<typeof schema>> = {
  name: "update_party",
  kind: "write",
  description: "Update fields on an existing party. Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      partyId: { type: "string" },
      name: { type: "string", minLength: 1, maxLength: 200 },
      type: { type: "string", enum: ["CUSTOMER", "SUPPLIER", "AGENT", "BOTH"] },
      email: { type: "string", format: "email" },
      phone: { type: "string", maxLength: 30 },
      gstin: { type: "string", maxLength: 15 },
      creditDays: { type: "integer", minimum: 0 },
      creditLimit: { type: "number", minimum: 0 },
    },
    required: ["partyId"],
    additionalProperties: false,
  },
  summarize: (i) => {
    const fields = Object.keys(i).filter((k) => k !== "partyId");
    return `Update party ${i.partyId} (${fields.join(", ") || "no fields"})`;
  },
  async execute(ctx, input) {
    const { partyId, ...fields } = input;
    const actor = { type: "ASSISTANT" as const, id: ctx.userId };
    const result = await withAudit(
      actor,
      "update_party",
      { organizationId: ctx.organizationId, entityType: "Party", entityId: partyId },
      () => partyService.update(ctx.organizationId, partyId, fields, actor),
    );
    return { ok: true, data: result };
  },
};
