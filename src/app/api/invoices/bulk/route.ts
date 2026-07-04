import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { bulkCreateInvoicesSchema, bulkInvoiceActionSchema } from "@/lib/validations/invoice";
import { invoiceService } from "@/server/services/invoice.service";

/**
 * Dual-purpose endpoint: `{ invoices: [...] }` bulk-creates (original,
 * CSV-import-era shape); `{ action, ids }` runs a bulk row-selection action
 * from the invoices-list bulk-actions bar (Task 12). Distinguished by which
 * key is present so neither shape breaks the other's callers.
 */
export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    if (body && typeof body === "object" && "action" in body) {
      const { action, ids } = bulkInvoiceActionSchema.parse(body);
      const result = await invoiceService.bulkAction(ctx.organizationId, action, ids);
      return successResponse(result);
    }
    const { invoices } = bulkCreateInvoicesSchema.parse(body);
    const created = await invoiceService.bulkCreate(ctx.organizationId, invoices);
    return successResponse(created, 201);
  },
  { rateLimit: { limit: 10, windowMs: 60_000 }, requiredRole: "member" },
);
