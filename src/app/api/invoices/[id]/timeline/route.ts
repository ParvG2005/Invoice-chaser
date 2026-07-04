import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { invoiceService } from "@/server/services/invoice.service";

export const GET = withApiHandler(
  async (_request, ctx, params) => {
    const entries = await invoiceService.timeline(ctx.organizationId, params.id);
    return successResponse(entries);
  },
  { rateLimit: { limit: 30, windowMs: 60_000 } },
);
