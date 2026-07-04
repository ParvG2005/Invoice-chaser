import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { billService } from "@/server/services/bill.service";

/** Payments applied to this bill — feeds the detail page's "Payments applied" section. */
export const GET = withApiHandler(async (_request, ctx, params) => {
  const payments = await billService.paymentsApplied(ctx.organizationId, params.id);
  return successResponse(payments);
});
