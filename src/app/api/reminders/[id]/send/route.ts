import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { reminderService } from "@/server/services/reminder.service";

/**
 * "Send now" for a single already-SCHEDULED reminder row (Task 26 fix).
 * Distinct from `POST /api/reminders/trigger`, which only *schedules new*
 * reminders and is a no-op for a row that's already scheduled.
 */
export const POST = withApiHandler(
  async (_request, ctx, params) => {
    const result = await reminderService.sendReminderNow(ctx.organizationId, params.id);
    return successResponse(result);
  },
  { requiredRole: "member" },
);
