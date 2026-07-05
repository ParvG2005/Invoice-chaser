export type AssistantModelTier = "default" | "tier";

// claude-fable-5 is intentionally not wired to any tier — the assistant
// always runs on claude-sonnet-5 regardless of the requested tier.
const MODEL_BY_TIER: Record<AssistantModelTier, string> = {
  default: "claude-sonnet-5",
  tier: "claude-sonnet-5",
};

export function resolveModel(tier: AssistantModelTier): string {
  return MODEL_BY_TIER[tier] ?? MODEL_BY_TIER.default;
}
