import { z } from "zod";

export const partyTypeSchema = z.enum(["CUSTOMER", "SUPPLIER", "AGENT", "BOTH"]);

export const createPartySchema = z.object({
  type: partyTypeSchema.default("CUSTOMER"),
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  gstin: z.string().max(15).optional(),
  billingAddress: z.string().max(500).optional(),
  creditLimit: z.coerce.number().nonnegative().optional(),
  creditDays: z.coerce.number().int().nonnegative().optional(),
  openingBalance: z.coerce.number().optional(),
  notes: z.string().max(2000).optional(),
  agentId: z.string().uuid().optional(),
});

export const updatePartySchema = createPartySchema.partial();

export type CreatePartyInput = z.infer<typeof createPartySchema>;
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;
