import { z } from "zod";

export const emailToneSchema = z.enum(["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"]);
export const channelSchema = z.enum(["EMAIL", "WHATSAPP"]);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

export const reminderSettingsSchema = z.object({
  reminderDays: z.array(z.number().int().min(0).max(90)).min(1).max(10),
  emailTone: emailToneSchema,
  autoSend: z.boolean(),
  whatsappEnabled: z.boolean(), // legacy, kept for old clients; enabledChannels wins
  enabledChannels: z.array(channelSchema).min(1),
  quietHoursStart: hhmm.nullable(),
  quietHoursEnd: hhmm.nullable(),
  timezone: z.string().min(1),
  escalationTones: z.array(emailToneSchema).min(1).max(10),
  upiId: z.string().max(100).nullable(),
  paymentLink: z.string().url().nullable(),
});

export const generateEmailSchema = z.object({
  invoiceId: z.string().uuid(),
  tone: emailToneSchema.optional(),
});

export type ReminderSettingsInput = z.infer<typeof reminderSettingsSchema>;
