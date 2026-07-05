import { z } from "zod";
import { analyticsService } from "@/server/services/analytics.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  side: z.enum(["RECEIVABLE", "PAYABLE"]).optional(),
});

export const getAgingReport: ToolDefinition<z.infer<typeof schema>> = {
  name: "get_aging_report",
  kind: "read",
  description: "Get the accounts receivable/payable aging report (current, 0-30, 31-60, 61-90, 90+ day buckets).",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      side: { type: "string", enum: ["RECEIVABLE", "PAYABLE"], description: "Which side of the ledger to report. Defaults to RECEIVABLE." },
    },
    additionalProperties: false,
  },
  summarize: (i) => `Get aging report (side=${i.side ?? "RECEIVABLE"})`,
  async execute(ctx, input) {
    // analyticsService.getAgingReport's `side` param has no default in the
    // service itself — default to RECEIVABLE here.
    const report = await analyticsService.getAgingReport(ctx.organizationId, input.side ?? "RECEIVABLE");
    return { ok: true, data: report };
  },
};
