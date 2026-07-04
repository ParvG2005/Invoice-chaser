import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { createInvoiceSchema } from "@/lib/validations/invoice";
import { computeLineItemsForInvoice, invoiceService } from "@/server/services/invoice.service";

export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as "PENDING" | "OVERDUE" | "PAID" | null;
  const takeParam = searchParams.get("limit");
  const cursor = searchParams.get("cursor");
  const take = takeParam ? Number(takeParam) : undefined;
  const partyId = searchParams.get("partyId");
  const dueBefore = searchParams.get("dueBefore");
  const dueAfter = searchParams.get("dueAfter");
  const search = searchParams.get("search");

  const invoices = await invoiceService.list(ctx.organizationId, {
    status: status ?? undefined,
    take: take && Number.isFinite(take) && take > 0 ? take : undefined,
    cursor: cursor ?? undefined,
    partyId: partyId ?? undefined,
    dueBefore: dueBefore ?? undefined,
    dueAfter: dueAfter ?? undefined,
    search: search ?? undefined,
  });
  return successResponse(invoices);
});

export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const { lineItems, ...rest } = createInvoiceSchema.parse(body);

    // When lineItems are supplied, the server recomputes amount/subtotal/
    // taxAmount/totalAmount from them (shared math, see
    // computeLineItemsForInvoice) rather than trusting the client's `amount`.
    const computed = lineItems && lineItems.length > 0 ? computeLineItemsForInvoice(lineItems) : null;

    const invoice = await invoiceService.create(ctx.organizationId, {
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
    return successResponse(invoice, 201);
  },
  { rateLimit: { limit: 60, windowMs: 60_000 }, requiredRole: "member" },
);
