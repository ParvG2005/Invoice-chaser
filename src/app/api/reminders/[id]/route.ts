import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { reminderService } from "@/server/services/reminder.service";

const skipSchema = z.object({ skipped: z.boolean() });

/** Skip/unskip a single not-yet-sent reminder from the per-invoice schedule tab. */
export const PATCH = withApiHandler(
  async (request, ctx, params) => {
    const body = await request.json();
    const { skipped } = skipSchema.parse(body);
    const result = await reminderService.setSkipped(ctx.organizationId, params.id, skipped);
    return successResponse(result);
  },
  { requiredRole: "member" },
);
