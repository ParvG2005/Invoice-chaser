import { z } from "zod";

export const invoiceStatusSchema = z.enum(["PENDING", "OVERDUE", "PAID"]);

export const createInvoiceSchema = z.object({
  clientName: z.string().min(1).max(200),
  clientEmail: z.string().email(),
  clientPhone: z.string().max(30).optional(),
  amount: z.coerce.number().positive(),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  invoiceNumber: z.string().min(1).max(100),
  notes: z.string().max(2000).optional(),
  status: invoiceStatusSchema.optional(),
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

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
