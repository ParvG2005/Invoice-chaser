export type AssistantModelTier = "default" | "tier";

const MODEL_BY_TIER: Record<AssistantModelTier, string> = {
  default: "claude-sonnet-5",
  tier: "claude-fable-5",
};

export function resolveModel(tier: AssistantModelTier): string {
  return MODEL_BY_TIER[tier] ?? MODEL_BY_TIER.default;
}
