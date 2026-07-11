import { auth } from "@clerk/nextjs/server";
import { ZodError } from "zod";
import { errorResponse } from "@/lib/api/response";
import { AppError, ForbiddenError, RateLimitError, UnauthorizedError } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { organizationService } from "@/server/services/organization.service";
import { hasRole, type Role } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { hashApiKey } from "@/lib/auth/api-key";

const log = createLogger("api-handler");

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export interface ApiContext {
  userId: string;
  clerkId: string;
  organizationId: string;
  role: OrgRole;
}

type RouteHandler = (
  request: Request,
  context: ApiContext,
  params: Record<string, string>,
) => Promise<Response>;

interface HandlerOptions {
  requireAuth?: boolean;
  rateLimit?: { limit: number; windowMs: number };
  /** Minimum org role for this route. Defaults to "viewer" (any member). */
  requiredRole?: Role;
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
        const authHeader = request.headers.get("authorization");
        if (authHeader?.startsWith("Bearer ")) {
          const raw = authHeader.slice("Bearer ".length).trim();
          const key = await prisma.apiKey.findFirst({
            where: { hashedKey: hashApiKey(raw), revokedAt: null },
          });
          if (!key) {
            throw new UnauthorizedError();
          }
          await prisma.apiKey.update({
            where: { id: key.id },
            data: { lastUsedAt: new Date() },
          });
          apiContext = {
            clerkId: `apikey:${key.id}`,
            userId: key.createdByUserId,
            organizationId: key.organizationId,
            role: "member",
          };
          if (options.requiredRole && !hasRole("member", options.requiredRole)) {
            throw new ForbiddenError(
              `This action requires the ${options.requiredRole} role or higher`,
            );
          }
        } else {
          const { userId: clerkId } = await auth();
          if (!clerkId) {
            throw new UnauthorizedError();
          }

          const org = await organizationService.ensureUserOrganization(clerkId);
          apiContext = {
            clerkId,
            userId: org.userId,
            organizationId: org.organizationId,
            role: org.role as OrgRole,
          };

          if (options.requiredRole && !hasRole(org.role, options.requiredRole)) {
            throw new ForbiddenError(
              `This action requires the ${options.requiredRole} role or higher`,
            );
          }
        }
      }

      const params = await routeContext.params;
      return await handler(request, apiContext!, params);
    } catch (error) {
      if (error instanceof AppError) {
        log.warn("Application error", { code: error.code, message: error.message });
        return errorResponse(error.code, error.message, error.statusCode, error.details);
      }

      if (error instanceof ZodError) {
        const flat = error.flatten();
        log.warn("Validation failed", {
          path: new URL(request.url).pathname,
          issues: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
        // flatten() groups nested array errors under the top-level key only
        // (e.g. everything under "invoices"), which hides WHICH row/field
        // failed. Include the raw issue paths so the client can surface e.g.
        // "invoices.0.lineItems.2.qty".
        return errorResponse("VALIDATION_ERROR", "Invalid request", 422, {
          formErrors: flat.formErrors,
          fieldErrors: flat.fieldErrors,
          issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }

      log.error("Unhandled error", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  };
}
