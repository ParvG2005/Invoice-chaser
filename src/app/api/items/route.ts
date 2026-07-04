import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { itemService } from "@/server/services/item.service";
import { stockService } from "@/server/services/stock.service";

/**
 * Read-only item lookup for the invoice line-items editor's item picker
 * (Task 14). `query` maps onto the repository's existing name-contains
 * `search` option (see `GET /api/parties` for the identical pattern).
 *
 * The response additively includes `stockOnHand` (openingQty + net
 * movements, batched via `stockService.getStockForItems` to avoid an N+1)
 * and maps the DTO's `gstRate` to `taxRate` — both are shaped for this
 * search endpoint only, not persisted on `ItemDto` itself.
 */
export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const takeParam = searchParams.get("limit");
  const take = takeParam ? Number(takeParam) : undefined;

  const items = await itemService.list(ctx.organizationId, {
    search: query ?? undefined,
    take: take && Number.isFinite(take) && take > 0 ? take : undefined,
  });

  const stockByItemId = await stockService.getStockForItems(ctx.organizationId, items);

  const results = items.map((item) => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    salePrice: item.salePrice,
    taxRate: item.gstRate,
    stockOnHand: stockByItemId.get(item.id) ?? 0,
  }));

  return successResponse(results);
});
