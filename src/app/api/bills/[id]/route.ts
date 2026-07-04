import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { updateBillSchema } from "@/lib/validations/bill";
import { billService } from "@/server/services/bill.service";

export const GET = withApiHandler(async (_request, ctx, params) => {
  const bill = await billService.get(ctx.organizationId, params.id);
  return successResponse(bill);
});

export const PATCH = withApiHandler(
  async (request, ctx, params) => {
    const body = await request.json();
    const input = updateBillSchema.parse(body);
    const bill = await billService.update(ctx.organizationId, params.id, input);
    return successResponse(bill);
  },
  { requiredRole: "member" },
);

export const DELETE = withApiHandler(
  async (_request, ctx, params) => {
    const result = await billService.remove(ctx.organizationId, params.id);
    return successResponse(result);
  },
  { requiredRole: "member" },
);
