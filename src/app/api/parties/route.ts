import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { partyService } from "@/server/services/party.service";

/**
 * Read-only party lookup for comboboxes (e.g. the invoices-list party
 * filter, Task 12). `query` maps onto the repository's existing
 * name-contains `search` option.
 */
export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const takeParam = searchParams.get("limit");
  const take = takeParam ? Number(takeParam) : undefined;

  const parties = await partyService.list(ctx.organizationId, {
    search: query ?? undefined,
    take: take && Number.isFinite(take) && take > 0 ? take : undefined,
  });
  return successResponse(parties);
});
