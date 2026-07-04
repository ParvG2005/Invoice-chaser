import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { adjustStockSchema } from "@/lib/validations/stock";
import { stockService } from "@/server/services/stock.service";

/** "Adjust stock" dialog — manual +/- correction with a required reason (Task 22). */
export const POST = withApiHandler(
  async (request, ctx, params) => {
    const body = await request.json();
    const input = adjustStockSchema.parse(body);
    const movement = await stockService.adjust(ctx.organizationId, params.id, input);
    return successResponse(movement, 201);
  },
  { rateLimit: { limit: 60, windowMs: 60_000 }, requiredRole: "member" },
);
