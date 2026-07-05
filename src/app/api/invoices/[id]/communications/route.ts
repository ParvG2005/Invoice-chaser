import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { communicationService } from "@/server/services/communication.service";

export const GET = withApiHandler(async (_request, context, params) => {
  const logs = await communicationService.listForInvoice(context.organizationId, params.id);
  return successResponse(logs);
});
