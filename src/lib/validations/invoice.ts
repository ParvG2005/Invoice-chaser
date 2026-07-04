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
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type SnoozeInput = z.infer<typeof snoozeSchema>;
export type WriteOffInput = z.infer<typeof writeOffSchema>;
