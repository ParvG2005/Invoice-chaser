import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { organizationSettingsSchema } from "@/lib/validations/organization";
import { organizationService } from "@/server/services/organization.service";

export const GET = withApiHandler(async (_request, ctx) => {
  const settings = await organizationService.getSettings(ctx.organizationId);
  return successResponse(settings);
});

export const PUT = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const input = organizationSettingsSchema.parse(body);
    const settings = await organizationService.updateSettings(ctx.organizationId, input);
    return successResponse(settings);
  },
  { requiredRole: "owner" },
);

// Danger-zone "Delete organization" — soft delete, owner-only.
export const DELETE = withApiHandler(
  async (_request, ctx) => {
    const result = await organizationService.deleteOrganization(ctx.organizationId);
    return successResponse(result);
  },
  { requiredRole: "owner" },
);
