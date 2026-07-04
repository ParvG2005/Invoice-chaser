import { z } from "zod";

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(100).optional(),
  unit: z.string().max(20).default("Nos"),
  hsnCode: z.string().max(20).optional(),
  gstRate: z.coerce.number().min(0).max(100).optional(),
  openingQty: z.coerce.number().default(0),
  reorderLevel: z.coerce.number().nonnegative().optional(),
  purchasePrice: z.coerce.number().nonnegative().optional(),
  salePrice: z.coerce.number().nonnegative().optional(),
  tallyGuid: z.string().optional(),
  tallyAlterId: z.number().int().optional(),
});

export const updateItemSchema = createItemSchema.partial();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
