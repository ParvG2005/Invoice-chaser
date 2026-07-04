import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { createPaymentSchema, paymentDirectionSchema } from "@/lib/validations/payment";
import { paymentService } from "@/server/services/payment.service";

export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const partyId = searchParams.get("partyId");
  const directionParam = searchParams.get("direction");
  const direction = directionParam ? paymentDirectionSchema.parse(directionParam) : undefined;
  const cursor = searchParams.get("cursor");
  const takeParam = searchParams.get("limit");
  const take = takeParam ? Number(takeParam) : undefined;

  const payments = await paymentService.list(ctx.organizationId, {
    partyId: partyId ?? undefined,
    direction,
    cursor: cursor ?? undefined,
    take: take && Number.isFinite(take) && take > 0 ? take : undefined,
  });
  return successResponse(payments);
});

/**
 * Records a payment (and, when allocations are provided or resolvable via
 * FIFO, its allocations against open invoices/bills) via the existing
 * `paymentService.create` (Phase 1) — see that service for the
 * auto-FIFO-vs-explicit-allocations rules.
 */
export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const input = createPaymentSchema.parse(body);
    const payment = await paymentService.create(ctx.organizationId, input);
    return successResponse(payment, 201);
  },
  { rateLimit: { limit: 60, windowMs: 60_000 }, requiredRole: "member" },
);
