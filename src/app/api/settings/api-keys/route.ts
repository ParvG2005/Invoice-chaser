import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { generateApiKey } from "@/lib/auth/api-key";
import { createApiKeySchema } from "@/lib/validations/api-key";

export const GET = withApiHandler(
  async (_request, ctx) => {
    const apiKeys = await prisma.apiKey.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true, revokedAt: true },
      orderBy: { createdAt: "desc" },
    });
    return successResponse({ apiKeys });
  },
  { requiredRole: "admin" },
);

export const POST = withApiHandler(
  async (request, ctx) => {
    const { name } = createApiKeySchema.parse(await request.json());
    const { raw, prefix, hash } = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId: ctx.organizationId,
        createdByUserId: ctx.userId,
        name,
        prefix,
        hashedKey: hash,
      },
      select: { id: true, name: true, prefix: true },
    });
    return successResponse({ apiKey, secret: raw }, 201);
  },
  { requiredRole: "admin", rateLimit: { limit: 10, windowMs: 60_000 } },
);
