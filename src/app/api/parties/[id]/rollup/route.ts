import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { partyService } from "@/server/services/party.service";

/**
 * Managed-parties rollup for an AGENT party's "Managed parties" section
 * on the detail page (Task 17). Not part of the brief's explicit route
 * list, but required for `agent-rollup.tsx` to have a data source —
 * additive, thin `withApiHandler` wrapper matching the ledger route.
 */
export const GET = withApiHandler(async (_request, ctx, params) => {
  const rollup = await partyService.agentRollup(ctx.organizationId, params.id);
  return successResponse(rollup);
});
