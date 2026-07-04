import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { writeOffSchema } from "@/lib/validations/invoice";
import { billService } from "@/server/services/bill.service";

export const POST = withApiHandler(
  async (request, ctx, params) => {
    const body = await request.json().catch(() => ({}));
    const { reason } = writeOffSchema.parse(body);
    const bill = await billService.writeOff(ctx.organizationId, params.id, reason);
    return successResponse(bill);
  },
  { rateLimit: { limit: 30, windowMs: 60_000 }, requiredRole: "member" },
);
