/**
 * Master off-switch for the AI assistant. When enabled, every assistant
 * endpoint refuses immediately — no session, no model call, no tool execution.
 */
export function assistantKillSwitchEnabled(): boolean {
  const raw = process.env.ASSISTANT_KILL_SWITCH?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}
