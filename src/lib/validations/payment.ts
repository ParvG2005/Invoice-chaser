import { z } from "zod";

export const paymentDirectionSchema = z.enum(["IN", "OUT"]);
export const paymentModeSchema = z.enum(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "CARD", "OTHER"]);

export const explicitAllocationSchema = z.object({
  documentId: z.string().uuid(), // invoiceId when direction=IN, billId when direction=OUT
  amount: z.coerce.number().positive(),
});

export const createPaymentSchema = z.object({
  partyId: z.string().uuid(),
  direction: paymentDirectionSchema,
  amount: z.coerce.number().positive(),
  mode: paymentModeSchema.default("BANK_TRANSFER"),
  paymentDate: z.coerce.date().optional(),
  reference: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  allocations: z.array(explicitAllocationSchema).optional(), // omitted → auto FIFO
  tallyGuid: z.string().optional(),
  tallyAlterId: z.number().int().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ExplicitAllocation = z.infer<typeof explicitAllocationSchema>;
