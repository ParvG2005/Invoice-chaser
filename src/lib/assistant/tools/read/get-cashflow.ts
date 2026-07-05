import { z } from "zod";
import { analyticsService } from "@/server/services/analytics.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  weeks: z.number().int().min(1).max(8).optional(),
});

export const getCashflow: ToolDefinition<z.infer<typeof schema>> = {
  name: "get_cashflow",
  kind: "read",
  description:
    "Get the cashflow projection (overdue + weekly inflow/outflow/net buckets). The projection horizon is currently fixed at 8 weeks by the underlying service; `weeks` is accepted for forward-compatibility but not yet wired through.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      weeks: { type: "integer", minimum: 1, maximum: 8, description: "Projection horizon in weeks (currently informational only — the service always projects 8 weeks)." },
    },
    additionalProperties: false,
  },
  summarize: () => "Get cashflow projection",
  async execute(ctx) {
    // analyticsService.getCashflowProjection(organizationId, asOf) has no
    // options object / `weeks` param — the 8-week horizon is hardcoded
    // internally. Deviation from the brief, which assumed a `{ weeks }`
    // options object.
    const projection = await analyticsService.getCashflowProjection(ctx.organizationId);
    return { ok: true, data: projection };
  },
};
