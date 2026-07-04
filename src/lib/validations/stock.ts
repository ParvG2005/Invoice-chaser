import { z } from "zod";

export const stockSourceTypeSchema = z.enum(["INVOICE", "BILL", "ADJUSTMENT", "OPENING"]);

export const recordMovementSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.coerce.number().refine((v) => v !== 0, "qty must be non-zero (positive=in, negative=out)"),
  rate: z.coerce.number().nonnegative().optional(),
  sourceType: stockSourceTypeSchema.default("ADJUSTMENT"),
  sourceId: z.string().optional(),
  godown: z.string().max(100).optional(),
  movementDate: z.coerce.date().optional(),
});

export type RecordMovementInput = z.infer<typeof recordMovementSchema>;
