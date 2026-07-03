import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { updateInvoiceSchema } from "@/lib/validations/invoice";
import { invoiceService } from "@/server/services/invoice.service";

export const GET = withApiHandler(async (_request, ctx, params) => {
  const invoice = await invoiceService.get(ctx.organizationId, params.id);
  return successResponse(invoice);
});

export const PATCH = withApiHandler(async (request, ctx, params) => {
  const body = await request.json();
  const input = updateInvoiceSchema.parse(body);
  const invoice = await invoiceService.update(ctx.organizationId, params.id, input);
  return successResponse(invoice);
});

export const DELETE = withApiHandler(async (_request, ctx, params) => {
  const result = await invoiceService.remove(ctx.organizationId, params.id);
  return successResponse(result);
});
