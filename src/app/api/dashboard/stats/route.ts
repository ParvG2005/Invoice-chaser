import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { dashboardService } from "@/server/services/dashboard.service";

export const GET = withApiHandler(async (_request, ctx) => {
  const stats = await dashboardService.getStats(ctx.organizationId);
  return successResponse(stats);
});
