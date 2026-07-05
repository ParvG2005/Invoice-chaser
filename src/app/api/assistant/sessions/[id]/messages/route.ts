import Anthropic from "@anthropic-ai/sdk";
import { withApiHandler } from "@/lib/api/handler";
import { successResponse, errorResponse } from "@/lib/api/response";
import { assistantService } from "@/server/services/assistant.service";
import { runAssistantTurn } from "@/lib/assistant/client";
import type { AssistantModelTier } from "@/lib/assistant/models";
import { sendMessageSchema } from "@/lib/validations/assistant";
import { assistantKillSwitchEnabled } from "@/lib/assistant/killswitch";
import {
  assertTokenBudget,
  checkAssistantRateLimit,
  recordTokenUsage,
} from "@/lib/assistant/budget";
import { createLogger } from "@/lib/logger";

const log = createLogger("api-assistant-messages");

export const GET = withApiHandler(async (_request, ctx, params) => {
  const history = await assistantService.getHistory(ctx, params.id);
  return successResponse(history);
});

export const POST = withApiHandler(async (request, ctx, params) => {
  // Kill switch first: no DB/model work happens for this route when disabled.
  if (assistantKillSwitchEnabled()) {
    return errorResponse("ASSISTANT_DISABLED", "The AI assistant is currently disabled", 503);
  }
  if (!(await checkAssistantRateLimit(ctx.organizationId, ctx.userId))) {
    return errorResponse("RATE_LIMITED", "Too many assistant requests", 429);
  }
  await assertTokenBudget(ctx.organizationId);

  const body = await request.json();
  const input = sendMessageSchema.parse(body);

  // Fetch the session first: confirms it exists and belongs to
  // ctx.organizationId (404s otherwise) before any model call is made, and
  // gives us the session's actual persisted modelTier so a session created
  // with a non-default tier is actually routed to that model.
  const session = await assistantService.getSession(ctx, params.id);

  // Rebuild prior Anthropic messages from persisted history.
  const persisted = await assistantService.getHistory(ctx, params.id);
  const priorMessages: Anthropic.MessageParam[] = persisted.map((m) => ({
    role: m.role === "USER" ? "user" : "assistant",
    content: m.content as Anthropic.MessageParam["content"],
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const ev of runAssistantTurn({
          ctx,
          sessionId: params.id,
          modelTier: session.modelTier as AssistantModelTier,
          priorMessages,
          userText: input.text,
          contextChip: input.contextChip,
        })) {
          send(ev);
          if (ev.type === "done") {
            await recordTokenUsage(ctx.organizationId, ev.usage.inputTokens + ev.usage.outputTokens);
          }
        }
      } catch (err) {
        // Never forward raw error messages/stack traces to the client — they
        // may contain internal details (paths, SDK error bodies, etc).
        log.error("Assistant turn failed", {
          message: err instanceof Error ? err.message : "Unknown error",
          sessionId: params.id,
          organizationId: ctx.organizationId,
        });
        send({ type: "error", message: "The assistant encountered an error. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
