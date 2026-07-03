import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { reminderService } from "@/server/services/reminder.service";
import { createLogger } from "@/lib/logger";

const log = createLogger("reminders-trigger");

export const POST = withApiHandler(async (_request, ctx) => {
  log.info("Manual reminder scan triggered", { organizationId: ctx.organizationId });

  // First immediately schedule reminders for this org (process overdue + create Inngest jobs)
  const result = await reminderService.scheduleRemindersForOrganization(ctx.organizationId);

  log.info("Reminder scan complete", { scheduled: result.scheduled });
  return successResponse({ triggered: true, scheduled: result.scheduled });
});
