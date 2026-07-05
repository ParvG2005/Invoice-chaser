import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { cachedAnalytics } from "@/lib/cache/analytics-cache";
import { analyticsService } from "@/server/services/analytics.service";

export const GET = withApiHandler(async (_request, ctx) => {
  const data = await cachedAnalytics(ctx.organizationId, "stock", () =>
    analyticsService.getStockAnalytics(ctx.organizationId),
  );
  return successResponse(data);
});
