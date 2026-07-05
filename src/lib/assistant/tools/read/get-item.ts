import { z } from "zod";
import { itemService } from "@/server/services/item.service";
import { wrapUntrusted } from "@/lib/assistant/untrusted";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({ itemId: z.string().min(1) });

export const getItem: ToolDefinition<z.infer<typeof schema>> = {
  name: "get_item",
  kind: "read",
  description: "Fetch a single stock item by id, including current stock on hand and valuation.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: { itemId: { type: "string", description: "The item id." } },
    required: ["itemId"],
    additionalProperties: false,
  },
  summarize: (i) => `Get item ${i.itemId}`,
  async execute(ctx, input) {
    const item = await itemService.get(ctx.organizationId, input.itemId);
    // Free-text field is DB-sourced and untrusted.
    const safe = { ...item, name: wrapUntrusted("item_name", String(item.name)) };
    return { ok: true, data: safe };
  },
};
