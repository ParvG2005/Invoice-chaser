import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { tallyImportService } from "@/server/services/import/tally-import.service";

export const GET = withApiHandler(async (_request, ctx) => {
  const batches = await tallyImportService.listBatches(ctx.organizationId);
  return successResponse({ batches });
});
