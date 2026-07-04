import { z } from "zod";

export const emailToneSchema = z.enum(["FRIENDLY", "PROFESSIONAL", "FIRM"]);

// Sequence-step tone is a superset of `emailToneSchema` (adds "FINAL"). Kept as a
// separate schema rather than widening `emailToneSchema`: the sequence array is
// stored as Json (not DB-enum-backed) so it's free to have its own tone tier, but
// `generateEmailSchema`/the AI email service only have prompt copy for the 3
// original tones — adding "FINAL" there would need matching AI-prompt work that's
// out of scope for this task.
export const sequenceStepToneSchema = z.enum(["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL"]);

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const reminderSequenceStepSchema = z.object({
  offsetDays: z.number().int().min(0).max(90),
  tone: sequenceStepToneSchema,
  channels: z.object({
    email: z.boolean(),
    whatsapp: z.boolean(),
  }),
});

export const quietHoursSchema = z.object({
  start: z.string().regex(HH_MM, "Expected HH:mm"),
  end: z.string().regex(HH_MM, "Expected HH:mm"),
});

export const reminderSettingsSchema = z.object({
  reminderDays: z.array(z.number().int().min(0).max(90)).min(1).max(10),
  emailTone: emailToneSchema,
  autoSend: z.boolean(),
  whatsappEnabled: z.boolean(),
  // Additive (Task 26): settings storage + UI for the sequence editor and quiet
  // hours. Not yet consumed by the scheduler — see schema.prisma comment.
  sequence: z.array(reminderSequenceStepSchema).min(0).max(10).optional(),
  quietHours: quietHoursSchema.optional(),
});

export const generateEmailSchema = z.object({
  invoiceId: z.string().uuid(),
  tone: emailToneSchema.optional(),
});

export type ReminderSettingsInput = z.infer<typeof reminderSettingsSchema>;
export type ReminderSequenceStep = z.infer<typeof reminderSequenceStepSchema>;
export type QuietHours = z.infer<typeof quietHoursSchema>;
