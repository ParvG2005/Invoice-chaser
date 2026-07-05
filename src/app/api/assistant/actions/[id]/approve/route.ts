import { withApiHandler } from "@/lib/api/handler";
import { successResponse, errorResponse } from "@/lib/api/response";
import { assistantService } from "@/server/services/assistant.service";
import { assistantKillSwitchEnabled } from "@/lib/assistant/killswitch";

export const POST = withApiHandler(
  async (_request, ctx, params) => {
    // Approval executes the underlying write tool — must not run while
    // the assistant is disabled.
    if (assistantKillSwitchEnabled()) {
      return errorResponse("ASSISTANT_DISABLED", "The AI assistant is currently disabled", 503);
    }
    const action = await assistantService.approveAction(ctx, params.id);
    return successResponse(action);
  },
  { rateLimit: { limit: 60, windowMs: 60_000 } },
);
