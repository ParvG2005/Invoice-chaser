import { z } from "zod";
import { invoiceStatusSchema } from "@/lib/validations/invoice";

export const createBillSchema = z.object({
  partyId: z.string().uuid(),
  billNumber: z.string().min(1).max(100),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  amount: z.coerce.number().positive(),
  notes: z.string().max(2000).optional(),
  status: invoiceStatusSchema.optional(),
});

export const updateBillSchema = createBillSchema.partial();

export type CreateBillInput = z.infer<typeof createBillSchema>;
export type UpdateBillInput = z.infer<typeof updateBillSchema>;
