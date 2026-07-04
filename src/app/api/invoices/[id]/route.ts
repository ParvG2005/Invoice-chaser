import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { updateInvoiceSchema } from "@/lib/validations/invoice";
import { computeLineItemsForInvoice, invoiceService } from "@/server/services/invoice.service";

export const GET = withApiHandler(async (_request, ctx, params) => {
  const invoice = await invoiceService.get(ctx.organizationId, params.id);
  return successResponse(invoice);
});

export const PATCH = withApiHandler(
  async (request, ctx, params) => {
    const body = await request.json();
    const { lineItems, ...rest } = updateInvoiceSchema.parse(body);

    // Same server-authoritative recompute as POST /api/invoices — see
    // computeLineItemsForInvoice. `lineItems` must be distinguished from
    // "key absent" (undefined, preserve existing line items/amounts) vs.
    // "explicitly sent as []" (clear to zero line items — recompute via the
    // same totals([]) path, which yields all-zero subtotal/tax/total).
    const computed = lineItems !== undefined ? computeLineItemsForInvoice(lineItems) : null;

    const invoice = await invoiceService.update(ctx.organizationId, params.id, {
      ...rest,
      ...(computed
        ? {
            amount: computed.totalAmount,
            lineItems: computed.lineItems,
            subtotal: computed.subtotal,
            taxAmount: computed.taxAmount,
            totalAmount: computed.totalAmount,
          }
        : {}),
    });
    return successResponse(invoice);
  },
  { requiredRole: "member" },
);

export const DELETE = withApiHandler(
  async (_request, ctx, params) => {
    const result = await invoiceService.remove(ctx.organizationId, params.id);
    return successResponse(result);
  },
  { requiredRole: "member" },
);
