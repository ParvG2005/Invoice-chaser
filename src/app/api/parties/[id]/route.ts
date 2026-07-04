import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { updatePartySchema } from "@/lib/validations/party";
import { partyService } from "@/server/services/party.service";

export const GET = withApiHandler(async (_request, ctx, params) => {
  const party = await partyService.get(ctx.organizationId, params.id);
  return successResponse(party);
});

export const PATCH = withApiHandler(
  async (request, ctx, params) => {
    const body = await request.json();
    const input = updatePartySchema.parse(body);
    const party = await partyService.update(ctx.organizationId, params.id, input);
    return successResponse(party);
  },
  { requiredRole: "member" },
);
