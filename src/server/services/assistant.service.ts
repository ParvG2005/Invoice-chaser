import { prisma } from "@/lib/db/prisma";
import { buildRegistry } from "@/lib/assistant/tools/registry";
import { renderActionDiff } from "@/lib/assistant/diff";
import type { ToolContext, ToolResult } from "@/lib/assistant/tools/types";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/errors";
import type { AssistantModelTier } from "@/lib/assistant/models";
import type { AssistantMessageRole } from "@/generated/prisma/client";

function requireTool(ctx: ToolContext, toolName: string) {
  const registry = buildRegistry(ctx);
  const tool = registry.get(toolName);
  if (!tool) {
    // Either unknown, disabled, or RBAC-filtered out (e.g. viewer + write).
    throw new ForbiddenError(`Tool not available: ${toolName}`);
  }
  return tool;
}

export const assistantService = {
  async createSession(ctx: ToolContext, opts: { title?: string; modelTier?: AssistantModelTier } = {}) {
    return prisma.assistantSession.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        title: opts.title ?? null,
      },
    });
  },

  async listSessions(ctx: ToolContext) {
    return prisma.assistantSession.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  },

  async appendMessage(
    ctx: ToolContext,
    sessionId: string,
    role: AssistantMessageRole,
    content: unknown,
  ) {
    return prisma.assistantMessage.create({
      data: { organizationId: ctx.organizationId, sessionId, role, content: content as object },
    });
  },

  async getHistory(ctx: ToolContext, sessionId: string) {
    const session = await prisma.assistantSession.findFirst({
      where: { id: sessionId, organizationId: ctx.organizationId, deletedAt: null },
    });
    if (!session) throw new NotFoundError("Session not found");
    return prisma.assistantMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Read tools execute immediately. Refuses write tools outright. */
  async dispatchReadTool(ctx: ToolContext, toolName: string, rawInput: unknown): Promise<ToolResult> {
    const tool = requireTool(ctx, toolName);
    if (tool.kind !== "read") {
      throw new ForbiddenError(`${toolName} is a write tool and must go through approval`);
    }
    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) return { ok: false, error: "Invalid tool input" };
    return tool.execute(ctx, parsed.data);
  },

  /** Write tools NEVER execute here — they persist a PROPOSED action. */
  async proposeWriteAction(ctx: ToolContext, sessionId: string, toolName: string, rawInput: unknown) {
    const tool = requireTool(ctx, toolName);
    if (tool.kind !== "write") {
      throw new ValidationError(`${toolName} is not a write tool`);
    }
    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError("Invalid tool input", parsed.error.flatten());

    return prisma.assistantAction.create({
      data: {
        sessionId,
        organizationId: ctx.organizationId,
        toolName,
        input: parsed.data as object,
        status: "PROPOSED",
        diffSummary: renderActionDiff(toolName, parsed.data),
      },
    });
  },

  async approveAction(ctx: ToolContext, actionId: string) {
    const action = await prisma.assistantAction.findFirst({
      where: { id: actionId, organizationId: ctx.organizationId },
    });
    if (!action) throw new NotFoundError("Action not found");
    if (action.status !== "PROPOSED") {
      throw new ValidationError(`Action is ${action.status}, not PROPOSED`);
    }
    const tool = requireTool(ctx, action.toolName); // re-check RBAC at approval time
    const parsed = tool.inputSchema.safeParse(action.input);
    if (!parsed.success) throw new ValidationError("Stored input no longer valid");

    await prisma.assistantAction.update({
      where: { id: actionId },
      data: { status: "APPROVED", approvedBy: ctx.userId, approvedAt: new Date() },
    });

    try {
      const result = await tool.execute(ctx, parsed.data);
      if (!result.ok) {
        return prisma.assistantAction.update({
          where: { id: actionId },
          data: { status: "FAILED", errorMessage: result.error, executedAt: new Date() },
        });
      }
      return prisma.assistantAction.update({
        where: { id: actionId },
        data: { status: "EXECUTED", result: result.data as object, executedAt: new Date() },
      });
    } catch (err) {
      return prisma.assistantAction.update({
        where: { id: actionId },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Execution failed",
          executedAt: new Date(),
        },
      });
    }
  },

  async rejectAction(ctx: ToolContext, actionId: string, feedback: string) {
    const action = await prisma.assistantAction.findFirst({
      where: { id: actionId, organizationId: ctx.organizationId },
    });
    if (!action) throw new NotFoundError("Action not found");
    if (action.status !== "PROPOSED") {
      throw new ValidationError(`Action is ${action.status}, not PROPOSED`);
    }
    return prisma.assistantAction.update({
      where: { id: actionId },
      data: { status: "REJECTED", rejectFeedback: feedback },
    });
  },

  /** Approve or reject many actions itemized in one call (batch). */
  async batchApprove(ctx: ToolContext, actionIds: string[]) {
    const results = [];
    for (const id of actionIds) results.push(await this.approveAction(ctx, id));
    return results;
  },
};
