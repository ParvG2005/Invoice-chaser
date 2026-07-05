import { z } from "zod";
import { invoiceService } from "@/server/services/invoice.service";
import { paymentService } from "@/server/services/payment.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

/**
 * `paymentModeSchema` in `src/lib/validations/payment.ts` — mirrored here
 * rather than "CASH"/"UPI"/"BANK"/"CHEQUE"/"OTHER" (the brief's illustrative
 * enum) so the model can never propose a mode the real service rejects.
 */
const modeSchema = z.enum(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "CARD", "OTHER"]);

const schema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  mode: modeSchema,
  date: z.string().datetime().optional(),
  reference: z.string().max(100).optional(),
});

export const recordPayment: ToolDefinition<z.infer<typeof schema>> = {
  name: "record_payment",
  kind: "write",
  description:
    "Record a payment received against an invoice. Creates a Payment (direction IN), allocated to the invoice, and marks it PAID once fully settled. Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      invoiceId: { type: "string", description: "Invoice the payment settles." },
      amount: { type: "number", exclusiveMinimum: 0, description: "Payment amount in INR." },
      mode: { type: "string", enum: ["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "CARD", "OTHER"] },
      date: { type: "string", format: "date-time", description: "ISO date; defaults to now." },
      reference: { type: "string", maxLength: 100, description: "Optional txn reference." },
    },
    required: ["invoiceId", "amount", "mode"],
    additionalProperties: false,
  },
  summarize: (i) =>
    `Record ₹${i.amount.toLocaleString("en-IN")} ${i.mode} payment against invoice ${i.invoiceId}`,
  async execute(ctx, input) {
    // paymentService.create is party-scoped (partyId + direction + optional
    // explicit allocations) — there is no single-invoice "record payment"
    // entry point on the real service — so resolve the invoice's party
    // first, then explicitly allocate the full amount to this invoice.
    const invoice = await invoiceService.get(ctx.organizationId, input.invoiceId);
    if (!invoice.partyId) {
      return {
        ok: false,
        error: `Invoice ${input.invoiceId} has no linked party; cannot record a payment against it.`,
      };
    }

    const actor = { type: "ASSISTANT" as const, id: ctx.userId };
    // paymentService.create already wraps itself in withAudit — do not
    // double-wrap here, or every approved action would produce two
    // AuditLog rows instead of one.
    const result = await paymentService.create(
      ctx.organizationId,
      {
        partyId: invoice.partyId!,
        direction: "IN",
        amount: input.amount,
        mode: input.mode,
        paymentDate: input.date ? new Date(input.date) : undefined,
        reference: input.reference,
        allocations: [{ documentId: input.invoiceId, amount: input.amount }],
      },
      actor,
    );
    return { ok: true, data: result };
  },
};
