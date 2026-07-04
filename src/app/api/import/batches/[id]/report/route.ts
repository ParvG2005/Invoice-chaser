import { withApiHandler } from "@/lib/api/handler";
import { tallyImportService } from "@/server/services/import/tally-import.service";

export const GET = withApiHandler(async (_request, ctx, params) => {
  const csv = await tallyImportService.getRecordsCsv(ctx.organizationId, params.id);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="import-${params.id}.csv"`,
    },
  });
});
