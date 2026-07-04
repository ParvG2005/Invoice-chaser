import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { tallyImportService } from "@/server/services/import/tally-import.service";

export const POST = withApiHandler(
  async (_request, ctx, params) => {
    const batch = await tallyImportService.undoBatch(ctx.organizationId, ctx.userId, params.id);
    return successResponse({ batch });
  },
  { requiredRole: "member" },
);
