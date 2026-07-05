import { withApiHandler } from "@/lib/api/handler";
import { successResponse, errorResponse } from "@/lib/api/response";
import { assistantService } from "@/server/services/assistant.service";
import { createSessionSchema } from "@/lib/validations/assistant";
import { assistantKillSwitchEnabled } from "@/lib/assistant/killswitch";

export const GET = withApiHandler(async (_request, ctx) => {
  const sessions = await assistantService.listSessions(ctx);
  return successResponse(sessions);
});

export const POST = withApiHandler(
  async (request, ctx) => {
    if (assistantKillSwitchEnabled()) {
      return errorResponse("ASSISTANT_DISABLED", "The AI assistant is currently disabled", 503);
    }
    const body = await request.json().catch(() => ({}));
    const input = createSessionSchema.parse(body);
    const session = await assistantService.createSession(ctx, input);
    return successResponse(session, 201);
  },
  { rateLimit: { limit: 20, windowMs: 60_000 } },
);
