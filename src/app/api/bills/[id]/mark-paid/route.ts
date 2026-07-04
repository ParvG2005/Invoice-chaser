import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { billService } from "@/server/services/bill.service";

export const POST = withApiHandler(
  async (_request, ctx, params) => {
    const bill = await billService.markPaid(ctx.organizationId, params.id);
    return successResponse(bill);
  },
  { rateLimit: { limit: 30, windowMs: 60_000 }, requiredRole: "member" },
);
