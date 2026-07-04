import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { createBillSchema } from "@/lib/validations/bill";
import { billService } from "@/server/services/bill.service";

export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as
    | "PENDING"
    | "OVERDUE"
    | "PAID"
    | "PARTIALLY_PAID"
    | "WRITTEN_OFF"
    | null;
  const takeParam = searchParams.get("limit");
  const cursor = searchParams.get("cursor");
  const take = takeParam ? Number(takeParam) : undefined;
  const partyId = searchParams.get("partyId");

  const bills = await billService.list(ctx.organizationId, {
    status: status ?? undefined,
    take: take && Number.isFinite(take) && take > 0 ? take : undefined,
    cursor: cursor ?? undefined,
    partyId: partyId ?? undefined,
  });
  return successResponse(bills);
});

export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const input = createBillSchema.parse(body);
    const bill = await billService.create(ctx.organizationId, input);
    return successResponse(bill, 201);
  },
  { rateLimit: { limit: 60, windowMs: 60_000 }, requiredRole: "member" },
);
