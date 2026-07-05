import type { ToolContext, ToolDefinition } from "@/lib/assistant/tools/types";
import { roleAtLeast } from "@/lib/assistant/tools/types";
import { READ_TOOLS } from "@/lib/assistant/tools/read";
import { WRITE_TOOLS } from "@/lib/assistant/tools/write";

export const ALL_TOOLS: ToolDefinition[] = [...READ_TOOLS, ...WRITE_TOOLS];

/**
 * Build the tool set visible to this session. Server-side authorization is the
 * real boundary: a viewer only ever gets read tools, and no tool can widen
 * scope because organizationId is injected from ctx, not model output.
 */
export function buildRegistry(ctx: ToolContext): Map<string, ToolDefinition> {
  const map = new Map<string, ToolDefinition>();
  for (const tool of ALL_TOOLS) {
    if (tool.disabled) continue;
    if (ctx.role === "viewer" && tool.kind === "write") continue;
    const min = tool.minRole ?? (tool.kind === "write" ? "member" : "viewer");
    if (!roleAtLeast(ctx.role, min)) continue;
    map.set(tool.name, tool);
  }
  return map;
}

export function toAnthropicTools(registry: Map<string, ToolDefinition>) {
  return [...registry.values()].map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.jsonSchema,
  }));
}
