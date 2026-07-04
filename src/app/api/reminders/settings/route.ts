import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { reminderSettingsSchema } from "@/lib/validations/reminder";
import { reminderService } from "@/server/services/reminder.service";

export const GET = withApiHandler(async (_request, ctx) => {
  const settings = await reminderService.getSettings(ctx.organizationId);
  return successResponse(settings);
});

export const PUT = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const input = reminderSettingsSchema.parse(body);
    const settings = await reminderService.updateSettings(ctx.organizationId, input);
    return successResponse(settings);
  },
  { requiredRole: "member" },
);
