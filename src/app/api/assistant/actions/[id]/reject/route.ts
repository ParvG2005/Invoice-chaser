import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { assistantService } from "@/server/services/assistant.service";
import { rejectActionSchema } from "@/lib/validations/assistant";

// Rejection is a bookkeeping-only status change (no tool execution, no model
// call), so it stays available even while ASSISTANT_KILL_SWITCH is set —
// users must still be able to dismiss stale proposals.
export const POST = withApiHandler(async (request, ctx, params) => {
  const body = await request.json();
  const { feedback } = rejectActionSchema.parse(body);
  const action = await assistantService.rejectAction(ctx, params.id, feedback);
  return successResponse(action);
});
