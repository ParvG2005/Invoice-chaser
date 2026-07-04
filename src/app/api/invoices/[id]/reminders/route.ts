import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { reminderService } from "@/server/services/reminder.service";

/** Per-invoice reminder schedule, for the invoice-detail "Reminders" tab (Task 26). */
export const GET = withApiHandler(async (_request, ctx, params) => {
  const reminders = await reminderService.listForInvoice(ctx.organizationId, params.id);
  return successResponse(reminders);
});
