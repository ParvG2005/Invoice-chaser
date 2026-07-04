import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { invoiceService } from "@/server/services/invoice.service";

export const POST = withApiHandler(
  async (_request, ctx, params) => {
    const invoice = await invoiceService.duplicate(ctx.organizationId, params.id);
    return successResponse(invoice, 201);
  },
  { rateLimit: { limit: 30, windowMs: 60_000 }, requiredRole: "member" },
);
