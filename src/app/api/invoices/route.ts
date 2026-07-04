import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { createInvoiceSchema } from "@/lib/validations/invoice";
import { invoiceService } from "@/server/services/invoice.service";

export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as "PENDING" | "OVERDUE" | "PAID" | null;
  const takeParam = searchParams.get("limit");
  const cursor = searchParams.get("cursor");
  const take = takeParam ? Number(takeParam) : undefined;

  const invoices = await invoiceService.list(ctx.organizationId, {
    status: status ?? undefined,
    take: take && Number.isFinite(take) && take > 0 ? take : undefined,
    cursor: cursor ?? undefined,
  });
  return successResponse(invoices);
});

export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const input = createInvoiceSchema.parse(body);
    const invoice = await invoiceService.create(ctx.organizationId, input);
    return successResponse(invoice, 201);
  },
  { rateLimit: { limit: 60, windowMs: 60_000 }, requiredRole: "member" },
);
