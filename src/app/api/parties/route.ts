import type { PartyType } from "@/generated/prisma/client";
import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { createPartySchema, partyTypeSchema } from "@/lib/validations/party";
import { partyService } from "@/server/services/party.service";

/**
 * Read-only party lookup for comboboxes (e.g. the invoices-list party
 * filter, Task 12) and the parties directory (Task 17). `query` maps onto
 * the repository's existing name-contains `search` option. `type` is
 * additive (Task 17's directory type-filter tabs / agent picker) — omitted
 * by every pre-existing caller, so it has zero effect on them.
 */
export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const takeParam = searchParams.get("limit");
  const take = takeParam ? Number(takeParam) : undefined;
  const typeParam = searchParams.get("type");
  const type: PartyType | undefined = typeParam
    ? partyTypeSchema.parse(typeParam)
    : undefined;

  const parties = await partyService.list(ctx.organizationId, {
    search: query ?? undefined,
    take: take && Number.isFinite(take) && take > 0 ? take : undefined,
    type,
  });
  return successResponse(parties);
});

/**
 * Minimal party creation for the invoice editor's party picker (Task 14,
 * "Create '{query}'" footer action). Reuses `createPartySchema` as-is —
 * `type` defaults to `"CUSTOMER"` per the schema default, matching what a
 * user picking a party for an invoice would expect.
 */
export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const input = createPartySchema.parse(body);
    const party = await partyService.create(ctx.organizationId, input);
    return successResponse(party, 201);
  },
  { rateLimit: { limit: 60, windowMs: 60_000 }, requiredRole: "member" },
);
