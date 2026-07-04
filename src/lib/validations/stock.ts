import { z } from "zod";

export const stockSourceTypeSchema = z.enum(["INVOICE", "BILL", "ADJUSTMENT", "OPENING"]);

export const recordMovementSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.coerce.number().refine((v) => v !== 0, "qty must be non-zero (positive=in, negative=out)"),
  rate: z.coerce.number().nonnegative().optional(),
  sourceType: stockSourceTypeSchema.default("ADJUSTMENT"),
  sourceId: z.string().optional(),
  godown: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  movementDate: z.coerce.date().optional(),
});

export type RecordMovementInput = z.infer<typeof recordMovementSchema>;

/** `POST /api/items/[id]/adjust` (Task 22 stock adjustment dialog) — a manual +/- correction with a required reason. */
export const adjustStockSchema = z.object({
  qty: z.coerce.number().refine((v) => v !== 0, "qty must be non-zero (positive=in, negative=out)"),
  reason: z.string().min(1, "Reason is required").max(500),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
