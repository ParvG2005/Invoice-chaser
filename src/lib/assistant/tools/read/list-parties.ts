import { z } from "zod";
import { partyService } from "@/server/services/party.service";
import { wrapUntrusted } from "@/lib/assistant/untrusted";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  type: z.enum(["CUSTOMER", "SUPPLIER", "AGENT", "BOTH"]).optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const listParties: ToolDefinition<z.infer<typeof schema>> = {
  name: "list_parties",
  kind: "read",
  description: "List parties (customers/suppliers/agents) for the current organization, optionally filtered by type or name.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["CUSTOMER", "SUPPLIER", "AGENT", "BOTH"], description: "Filter by party type." },
      query: { type: "string", description: "Case-insensitive substring match on party name." },
      limit: { type: "integer", minimum: 1, maximum: 100, description: "Max rows to return." },
    },
    additionalProperties: false,
  },
  summarize: (i) => `List parties${i.type ? ` (type=${i.type})` : ""}${i.query ? ` matching "${i.query}"` : ""}`,
  async execute(ctx, input) {
    // partyService.list's PartyListOptions field is `search`, not `query`.
    const rows = await partyService.list(ctx.organizationId, {
      type: input.type,
      search: input.query,
      take: input.limit,
    });
    const safe = rows.map((row) => ({
      ...row,
      name: wrapUntrusted("party_name", String(row.name ?? "")),
      notes: row.notes ? wrapUntrusted("party_notes", String(row.notes)) : null,
    }));
    return { ok: true, data: safe };
  },
};
