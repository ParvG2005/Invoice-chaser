import { auth } from "@clerk/nextjs/server";
import { ZodError } from "zod";
import { errorResponse } from "@/lib/api/response";
import { AppError, RateLimitError, UnauthorizedError } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { organizationService } from "@/server/services/organization.service";

const log = createLogger("api-handler");

export interface ApiContext {
  userId: string;
  clerkId: string;
  organizationId: string;
}

type RouteHandler = (
  request: Request,
  context: ApiContext,
  params: Record<string, string>,
) => Promise<Response>;

interface HandlerOptions {
  requireAuth?: boolean;
  rateLimit?: { limit: number; windowMs: number };
}

type RouteContext = { params: Promise<Record<string, string>> };

export function withApiHandler(handler: RouteHandler, options: HandlerOptions = {}) {
  const { requireAuth = true, rateLimit } = options;

  return async (request: Request, routeContext: RouteContext) => {
    try {
      if (rateLimit) {
        const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
        const result = await checkRateLimit({
          key: `${request.method}:${new URL(request.url).pathname}:${ip}`,
          limit: rateLimit.limit,
          windowMs: rateLimit.windowMs,
        });
        if (!result.allowed) {
          throw new RateLimitError();
        }
      }

      let apiContext: ApiContext | undefined;

      if (requireAuth) {
        const { userId: clerkId } = await auth();
        if (!clerkId) {
          throw new UnauthorizedError();
        }

        const org = await organizationService.ensureUserOrganization(clerkId);
        apiContext = {
          clerkId,
          userId: org.userId,
          organizationId: org.organizationId,
        };
      }

      const params = await routeContext.params;
      return await handler(request, apiContext!, params);
    } catch (error) {
      if (error instanceof AppError) {
        log.warn("Application error", { code: error.code, message: error.message });
        return errorResponse(error.code, error.message, error.statusCode, error.details);
      }

      if (error instanceof ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid request", 422, error.flatten());
      }

      log.error("Unhandled error", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  };
}
