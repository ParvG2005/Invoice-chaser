import { z } from "zod";

export const MAX_TALLY_XML_BYTES = 4 * 1024 * 1024; // conservative application-level cap, independent of the Cloudflare Pages/Workers platform body-size ceiling

export const createTallyImportSchema = z.object({
  source: z.enum(["TALLY_MASTERS_LEDGERS", "TALLY_MASTERS_STOCKITEMS", "TALLY_VOUCHERS"]),
  fileName: z.string().min(1).max(255),
  xml: z
    .string()
    .min(1, "Empty file")
    .max(MAX_TALLY_XML_BYTES, "File exceeds 4 MB — split the Tally export by period (see docs/TALLY.md)"),
});

export type CreateTallyImportInput = z.infer<typeof createTallyImportSchema>;
