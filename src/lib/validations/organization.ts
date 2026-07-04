import { z } from "zod";

export const themeSchema = z.enum(["light", "dark", "system"]);

export const organizationSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  gstin: z.string().max(20).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  logoUrl: z.string().max(2000).optional().nullable(),
  senderName: z.string().max(200).optional().nullable(),
  senderReplyTo: z.string().max(320).optional().nullable(),
  emailSignature: z.string().max(2000).optional().nullable(),
  theme: themeSchema.optional(),
});

export type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;
