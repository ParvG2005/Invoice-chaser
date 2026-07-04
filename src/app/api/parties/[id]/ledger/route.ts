import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { partyService } from "@/server/services/party.service";

/** Chronological ledger (running balance) for the party detail page's ledger table. */
export const GET = withApiHandler(async (_request, ctx, params) => {
  const ledger = await partyService.ledger(ctx.organizationId, params.id);
  return successResponse(ledger);
});
