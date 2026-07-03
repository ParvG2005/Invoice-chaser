import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { generateEmailSchema } from "@/lib/validations/reminder";
import { aiEmailService } from "@/server/services/ai-email.service";

export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const { invoiceId, tone } = generateEmailSchema.parse(body);
    const result = await aiEmailService.generateReminderEmail(
      ctx.organizationId,
      invoiceId,
      tone,
      { persist: true },
    );
    return successResponse(result);
  },
  { rateLimit: { limit: 20, windowMs: 60_000 } },
);
