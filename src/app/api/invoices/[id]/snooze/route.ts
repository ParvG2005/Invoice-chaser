import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { snoozeSchema } from "@/lib/validations/invoice";
import { invoiceService } from "@/server/services/invoice.service";

export const POST = withApiHandler(
  async (request, ctx, params) => {
    const body = await request.json();
    const { days } = snoozeSchema.parse(body);
    const invoice = await invoiceService.snooze(ctx.organizationId, params.id, days);
    return successResponse(invoice);
  },
  { rateLimit: { limit: 30, windowMs: 60_000 }, requiredRole: "member" },
);
