import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { cachedAnalytics } from "@/lib/cache/analytics-cache";
import { analyticsService } from "@/server/services/analytics.service";

const querySchema = z.object({ side: z.enum(["RECEIVABLE", "PAYABLE"]).default("RECEIVABLE") });

export const GET = withApiHandler(async (request, ctx) => {
  const { side } = querySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const data = await cachedAnalytics(ctx.organizationId, `aging:${side}`, () =>
    analyticsService.getAgingReport(ctx.organizationId, side),
  );
  return successResponse(data);
});
