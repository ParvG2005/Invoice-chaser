import type { EmailTone } from "@/generated/prisma/enums";

const DEFAULT_TONES: EmailTone[] = ["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"];

/**
 * Escalation: the Nth reminder step (sorted reminderDays) uses the Nth tone.
 * More steps than tones → clamp to the last (most severe) tone.
 */
export function toneForOffset(
  reminderDays: number[],
  escalationTones: EmailTone[],
  dayOffset: number,
): EmailTone {
  const tones = escalationTones.length > 0 ? escalationTones : DEFAULT_TONES;
  const sorted = [...reminderDays].sort((a, b) => a - b);
  const index = sorted.indexOf(dayOffset);
  const effective = index === -1 ? sorted.length - 1 : index;
  return tones[Math.min(effective, tones.length - 1)];
}
