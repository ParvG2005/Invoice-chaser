import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";

export const DELETE = withApiHandler(
  async (_request, ctx, params) => {
    await prisma.apiKey.updateMany({
      where: { id: params.id, organizationId: ctx.organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return successResponse({ id: params.id });
  },
  { requiredRole: "admin" },
);
