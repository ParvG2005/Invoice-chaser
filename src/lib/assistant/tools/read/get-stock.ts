import { z } from "zod";
import { analyticsService } from "@/server/services/analytics.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  lowStockOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const getStock: ToolDefinition<z.infer<typeof schema>> = {
  name: "get_stock",
  kind: "read",
  description:
    "Get stock analytics: total valuation, per-item stats, low-stock items, dead-stock items, and the 6-month movement trend.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      lowStockOnly: { type: "boolean", description: "If true, only return items below their reorder level." },
      limit: { type: "integer", minimum: 1, maximum: 100, description: "Max item rows to return." },
    },
    additionalProperties: false,
  },
  summarize: (i) => `Get stock analytics${i.lowStockOnly ? " (low stock only)" : ""}`,
  async execute(ctx, input) {
    // analyticsService.getStockAnalytics(organizationId, asOf) has no
    // options object for lowStockOnly/limit — filter/slice here instead.
    const stock = await analyticsService.getStockAnalytics(ctx.organizationId);
    const items = input.lowStockOnly ? stock.lowStockItems : stock.items;
    const limited = input.limit ? items.slice(0, input.limit) : items;
    return { ok: true, data: { ...stock, items: limited } };
  },
};
