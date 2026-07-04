import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { bulkCreateInvoicesSchema } from "@/lib/validations/invoice";
import { invoiceService } from "@/server/services/invoice.service";

export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const { invoices } = bulkCreateInvoicesSchema.parse(body);
    const created = await invoiceService.bulkCreate(ctx.organizationId, invoices);
    return successResponse(created, 201);
  },
  { rateLimit: { limit: 10, windowMs: 60_000 }, requiredRole: "member" },
);
