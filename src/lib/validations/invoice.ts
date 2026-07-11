import { z } from "zod";

export const invoiceStatusSchema = z.enum(["PENDING", "OVERDUE", "PAID"]);

/**
 * One row from the invoice editor's line-items table (Task 14). Structurally
 * matches `LineItemInput` in `src/modules/invoices/line-items.ts` — the
 * shared pure module that computes `amount`/totals from this exact shape, so
 * `POST /api/invoices` / `PATCH /api/invoices/[id]` can hand parsed rows
 * straight to `computeLineItemsForInvoice` (see invoice.service.ts) without
 * remapping field names.
 */
export const lineItemInputSchema = z.object({
  itemId: z.string().optional(),
  description: z.string().min(1).max(500),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().nonnegative(),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  taxRatePct: z.coerce.number().min(0).max(100).default(0),
  /**
   * HSN/SAC code for the line's product, when the source exposes one (Tally
   * PDF exports do). Optional/nullable so non-import callers (the invoice
   * editor) are unaffected; on PDF import it's persisted onto the linked
   * Stock Item's `hsnCode` (InvoiceLineItem has no HSN column).
   */
  hsnCode: z.string().max(20).nullish(),
});

export const createInvoiceSchema = z.object({
  clientName: z.string().min(1).max(200),
  clientEmail: z.string().email(),
  clientPhone: z.string().max(30).optional(),
  amount: z.coerce.number().positive(),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  invoiceNumber: z.string().min(1).max(100),
  notes: z.string().max(2000).optional(),
  status: invoiceStatusSchema.optional(),
  partyId: z.string().optional(),
  /**
   * When present (and non-empty), the route recomputes `amount`/`subtotal`/
   * `taxAmount`/`totalAmount` server-side from these rows via
   * `computeLineItemsForInvoice` — the client-supplied `amount` above is
   * ignored in that case so the persisted totals can never diverge from the
   * shared line-item math.
   */
  lineItems: z.array(lineItemInputSchema).optional(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial();

export const csvInvoiceRowSchema = z.object({
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
  clientPhone: z.string().optional(),
  amount: z.coerce.number().positive(),
  dueDate: z.string().min(1),
  invoiceNumber: z.string().min(1),
  notes: z.string().optional(),
});

export const bulkCreateInvoicesSchema = z.object({
  invoices: z.array(createInvoiceSchema).min(1).max(500),
});

/**
 * Commit payload for the PDF-invoice import path (POST
 * /api/import/pdf-invoices/commit) — distinct from `createInvoiceSchema` so
 * the generic invoice-create/CSV-bulk contract stays clean. Every enrichment
 * field (email, phone, GSTIN, address, line items) is optional/nullable: a
 * PDF that omits any of them must still import (only invoiceNumber/clientName/
 * amount/dueDate are required). The route hands parsed rows to
 * `invoiceService.importPdfInvoices`, which upserts the buyer Party + per-line
 * Stock Items in addition to creating the invoice.
 */
/**
 * Trim a string, coerce empty → null, and clamp to `max` chars. LLM extraction
 * (llm-extract.ts) puts NO length cap on the enrichment fields it returns, so a
 * GSTIN carrying a label prefix or a long buyer address would pass extraction
 * and then 422 the WHOLE commit batch on the strict `.max()` below. Enrichment
 * is best-effort — silently clamp rather than reject a real invoice over it.
 */
const clampedString = (max: number) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  }, z.string().max(max).nullish());

/** GSTIN is 15 chars; strip whitespace + uppercase before clamping so a value
 * like "GSTIN 27AAAAA0000A1Z5" or "27aaaaa0000a1z5 " still imports cleanly. */
const clampedGstin = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const t = v.replace(/\s+/g, "").toUpperCase();
  return t ? t.slice(0, 15) : null;
}, z.string().max(15).nullish());

/**
 * Line item as it arrives from PDF extraction. Same shape as
 * `lineItemInputSchema` but tolerant: the description is trimmed/clamped
 * instead of hard-failing, since an over-length item name from a PDF must not
 * abort the whole import (the manual invoice editor keeps the strict schema).
 */
const pdfLineItemSchema = z.object({
  itemId: z.string().optional(),
  description: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().slice(0, 500) : v),
    z.string().min(1).max(500),
  ),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().nonnegative(),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  taxRatePct: z.coerce.number().min(0).max(100).default(0),
  hsnCode: clampedString(20),
});

/** Basic email shape — the SAME check the import wizard uses client-side, so
 * the two never disagree on what "valid" means. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const pdfImportInvoiceSchema = z.object({
  invoiceNumber: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().slice(0, 100) : v),
    z.string().min(1).max(100),
  ),
  clientName: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().slice(0, 200) : v),
    z.string().min(1).max(200),
  ),
  // Email is optional enrichment — it must NEVER 422 the import. A trimmed
  // value that looks like an email is kept; anything else (blank, malformed, a
  // party-record's garbage email) collapses to "" so the invoice still imports
  // (reminders just can't send until it's fixed on the Party page).
  clientEmail: z.preprocess((v) => {
    if (v == null) return "";
    if (typeof v !== "string") return v;
    const t = v.trim();
    return EMAIL_SHAPE.test(t) ? t : "";
  }, z.string()),
  clientPhone: clampedString(30),
  buyerGstin: clampedGstin,
  buyerAddress: clampedString(500),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  amount: z.coerce.number().positive(),
  status: invoiceStatusSchema.optional(),
  notes: clampedString(2000),
  lineItems: z.array(pdfLineItemSchema).optional(),
});

export const pdfImportCommitSchema = z.object({
  invoices: z.array(pdfImportInvoiceSchema).min(1).max(500),
});

/**
 * Bulk row-selection actions from the invoices-list bulk-actions bar (Task
 * 12): distinguished from `bulkCreateInvoicesSchema` by the `action` key so
 * `POST /api/invoices/bulk` can dispatch to either additively.
 */
export const bulkInvoiceActionSchema = z.object({
  action: z.enum(["delete", "markPaid", "sendReminders"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const snoozeSchema = z.object({
  days: z.number().int().min(1).max(90),
});

export const writeOffSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type LineItemInputSchema = z.infer<typeof lineItemInputSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type PdfImportInvoiceInput = z.infer<typeof pdfImportInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type SnoozeInput = z.infer<typeof snoozeSchema>;
export type WriteOffInput = z.infer<typeof writeOffSchema>;
