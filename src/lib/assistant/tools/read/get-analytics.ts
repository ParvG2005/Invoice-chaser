import { z } from "zod";
import { analyticsService } from "@/server/services/analytics.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({});

export const getAnalytics: ToolDefinition<z.infer<typeof schema>> = {
  name: "get_analytics",
  kind: "read",
  description:
    "Get headline analytics tiles for the organization: money-to-come, money-to-pay, pending invoices, overdue value, collected this month.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  summarize: () => "Get headline analytics",
  async execute(ctx) {
    const tiles = await analyticsService.getHeadlineTiles(ctx.organizationId);
    return { ok: true, data: tiles };
  },
};
