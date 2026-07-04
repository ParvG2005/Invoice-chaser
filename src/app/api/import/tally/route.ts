import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { createTallyImportSchema } from "@/lib/validations/import";
import { tallyImportService } from "@/server/services/import/tally-import.service";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";

export const POST = withApiHandler(
  async (request, ctx) => {
    const body = createTallyImportSchema.parse(await request.json());
    const batch = await tallyImportService.createBatch(ctx.organizationId, body);
    await getJobScheduler().enqueueTallyImport(ctx.organizationId, batch.id);
    return successResponse({ batch }, 202);
  },
  { rateLimit: { limit: 10, windowMs: 60_000 }, requiredRole: "member" },
);
