import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { reminderService } from "@/server/services/reminder.service";

/**
 * "Upcoming Reminders" queue (Task 26) — a read view over `Reminder` rows
 * with `status: "SCHEDULED"`, joined to invoice/party. Not a new scheduling
 * concept; reuses the same data the scheduler already writes.
 */
export const GET = withApiHandler(async (_request, ctx) => {
  const upcoming = await reminderService.getUpcoming(ctx.organizationId);
  return successResponse(upcoming);
});
