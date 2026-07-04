import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { updateItemSchema } from "@/lib/validations/item";
import { itemService } from "@/server/services/item.service";

export const GET = withApiHandler(async (_request, ctx, params) => {
  const item = await itemService.get(ctx.organizationId, params.id);
  return successResponse(item);
});

export const PATCH = withApiHandler(
  async (request, ctx, params) => {
    const body = await request.json();
    const input = updateItemSchema.parse(body);
    const item = await itemService.update(ctx.organizationId, params.id, input);
    return successResponse(item);
  },
  { requiredRole: "member" },
);

export const DELETE = withApiHandler(
  async (_request, ctx, params) => {
    const result = await itemService.remove(ctx.organizationId, params.id);
    return successResponse(result);
  },
  { requiredRole: "member" },
);
