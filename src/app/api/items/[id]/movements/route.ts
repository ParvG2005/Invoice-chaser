import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { stockService } from "@/server/services/stock.service";

/** Movement history for the item detail page's movements table. */
export const GET = withApiHandler(async (request, ctx, params) => {
  const { searchParams } = new URL(request.url);
  const takeParam = searchParams.get("limit");
  const take = takeParam ? Number(takeParam) : undefined;
  const cursor = searchParams.get("cursor");

  const movements = await stockService.listMovements(ctx.organizationId, params.id, {
    take: take && Number.isFinite(take) && take > 0 ? take : undefined,
    cursor: cursor ?? undefined,
  });
  return successResponse(movements);
});
