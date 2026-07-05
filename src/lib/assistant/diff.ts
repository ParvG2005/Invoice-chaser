import { ALL_TOOLS } from "@/lib/assistant/tools/registry";

/**
 * Human-readable one-line description of a proposed write, for the approval
 * card. Delegates to the tool's own summarize(); falls back to a generic label.
 */
export function renderActionDiff(toolName: string, input: unknown): string {
  const tool = ALL_TOOLS.find((t) => t.name === toolName);
  if (tool) {
    try {
      const parsed = tool.inputSchema.parse(input);
      return tool.summarize(parsed);
    } catch {
      // fall through to generic
    }
  }
  return `${toolName}: ${JSON.stringify(input)}`;
}
