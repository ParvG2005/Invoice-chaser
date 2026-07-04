import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { tallyImportService } from "@/server/services/import/tally-import.service";

export const GET = withApiHandler(async (_request, ctx, params) => {
  const batch = await tallyImportService.getBatch(ctx.organizationId, params.id);
  const records = await tallyImportService.listRecords(ctx.organizationId, params.id);
  return successResponse({ batch, records });
});
