import { z } from "zod";
import { analyticsService } from "@/server/services/analytics.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  partyId: z.string().optional(),
});

export const getPartyAnalytics: ToolDefinition<z.infer<typeof schema>> = {
  name: "get_party_analytics",
  kind: "read",
  description:
    "Get per-party analytics (exposure, credit limit, average days to pay, on-time %, risk flags) and the agent leaderboard. Optionally scope to a single party.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      partyId: { type: "string", description: "If provided, only this party's row is returned." },
    },
    additionalProperties: false,
  },
  summarize: (i) => (i.partyId ? `Get party analytics for ${i.partyId}` : "Get party analytics (all parties)"),
  async execute(ctx, input) {
    // analyticsService.getPartyAnalytics(organizationId, asOf) has no
    // partyId filter param — its second arg is `asOf: Date`, not a party id.
    // Fetch the full result and filter to the requested party here instead.
    const analytics = await analyticsService.getPartyAnalytics(ctx.organizationId);
    if (!input.partyId) return { ok: true, data: analytics };
    const parties = analytics.parties.filter((p) => p.partyId === input.partyId);
    return { ok: true, data: { parties, agents: analytics.agents } };
  },
};
