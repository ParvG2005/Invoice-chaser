import { z } from "zod";

export const emailToneSchema = z.enum(["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"]);
export const channelSchema = z.enum(["EMAIL", "WHATSAPP"]);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

export const reminderSettingsSchema = z.object({
  reminderDays: z.array(z.number().int().min(0).max(90)).min(1).max(10),
  emailTone: emailToneSchema,
  autoSend: z.boolean(),
  whatsappEnabled: z.boolean(), // legacy, kept for old clients; enabledChannels wins
  // Phase 4 fields below are all optional with sane defaults so the existing
  // reminders settings page — which still only POSTs the legacy payload shape
  // (reminderDays/emailTone/autoSend/whatsappEnabled/sequence/quietHours) —
  // continues to validate without being updated in this fix.
  enabledChannels: z.array(channelSchema).min(1).optional().default(["EMAIL"]),
  quietHoursStart: hhmm.nullable().optional(),
  quietHoursEnd: hhmm.nullable().optional(),
  timezone: z.string().min(1).optional().default("Asia/Kolkata"),
  escalationTones: z
    .array(emailToneSchema)
    .min(1)
    .max(10)
    .optional()
    .default(["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"]),
  upiId: z.string().max(100).nullable().optional(),
  paymentLink: z.string().url().nullable().optional(),
});

export const generateEmailSchema = z.object({
  invoiceId: z.string().uuid(),
  tone: emailToneSchema.optional(),
});

export type ReminderSettingsInput = z.infer<typeof reminderSettingsSchema>;
