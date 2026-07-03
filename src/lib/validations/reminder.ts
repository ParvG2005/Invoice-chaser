import { z } from "zod";

export const emailToneSchema = z.enum(["FRIENDLY", "PROFESSIONAL", "FIRM"]);

export const reminderSettingsSchema = z.object({
  reminderDays: z.array(z.number().int().min(0).max(90)).min(1).max(10),
  emailTone: emailToneSchema,
  autoSend: z.boolean(),
  whatsappEnabled: z.boolean(),
});

export const generateEmailSchema = z.object({
  invoiceId: z.string().uuid(),
  tone: emailToneSchema.optional(),
});

export type ReminderSettingsInput = z.infer<typeof reminderSettingsSchema>;
