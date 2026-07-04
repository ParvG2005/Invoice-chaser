import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { createItemSchema } from "@/lib/validations/item";
import { itemService } from "@/server/services/item.service";

/**
 * Doubles as the item catalog list (Task 22 Stock page) and the invoice
 * line-items editor's item picker (Task 14). `query` maps onto the
 * repository's existing name-contains `search` option (see `GET
 * /api/parties` for the identical pattern); `lowStockOnly=true` filters to
 * items whose computed `stockOnHand` is at/under their `reorderLevel`.
 *
 * `itemService.list` already attaches `stockOnHand`/`valuation` to every
 * row (batched via `stockService.getStockForItems`, no N+1). The response
 * additionally aliases `gstRate` to `taxRate` for the item picker's
 * `ItemSearchResultDto` — a structural subset of this superset, so both
 * consumers share one endpoint/shape.
 */
export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const takeParam = searchParams.get("limit");
  const take = takeParam ? Number(takeParam) : undefined;
  const lowStockOnly = searchParams.get("lowStockOnly") === "true";

  const items = await itemService.list(ctx.organizationId, {
    search: query ?? undefined,
    take: take && Number.isFinite(take) && take > 0 ? take : undefined,
    lowStockOnly,
  });

  const results = items.map((item) => ({ ...item, taxRate: item.gstRate }));

  return successResponse(results);
});

export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const input = createItemSchema.parse(body);
    const item = await itemService.create(ctx.organizationId, input);
    return successResponse(item, 201);
  },
  { rateLimit: { limit: 60, windowMs: 60_000 }, requiredRole: "member" },
);
