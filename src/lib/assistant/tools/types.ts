import type { z } from "zod";
import type { OrgRole } from "@/lib/api/handler";

export type ToolKind = "read" | "write";

export interface ToolContext {
  organizationId: string;
  userId: string;
  role: OrgRole;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export interface ToolDefinition<I = unknown> {
  name: string;
  description: string;
  kind: ToolKind;
  /** Zod schema validating model-supplied input (organizationId is never here). */
  inputSchema: z.ZodType<I>;
  /** JSON Schema sent to Claude in the `tools` array. */
  jsonSchema: Record<string, unknown>;
  /** Minimum role permitted to see/use this tool. Defaults by kind. */
  minRole?: OrgRole;
  /** Set true when the wrapped service is not yet available (Phase 4/5). */
  disabled?: boolean;
  /** Executes a read tool, or (for write tools) the approved action. */
  execute(ctx: ToolContext, input: I): Promise<ToolResult>;
  /** Human-readable one-line diff for the approval card. */
  summarize(input: I): string;
}

export const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function roleAtLeast(role: OrgRole, min: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
