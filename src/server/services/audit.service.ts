import type { ActorType, Prisma } from "@/generated/prisma/client";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";
import { createLogger } from "@/lib/logger";

const log = createLogger("audit-service");

export interface AuditActor {
  type: ActorType;
  id: string | null;
}

export const SYSTEM_ACTOR: AuditActor = { type: "SYSTEM", id: null };

export interface AuditEntity {
  organizationId: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
}

/** Strip Dates/Decimals/undefined so the value is valid Prisma JSON. */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Wraps a mutating service operation: runs `fn`, then writes one AuditLog row.
 * Every mutating service method in server/services MUST go through this.
 * Audit failures are logged but never thrown — the mutation already succeeded.
 */
export async function withAudit<T>(
  actor: AuditActor,
  action: string,
  entity: AuditEntity,
  fn: () => Promise<T>,
): Promise<T> {
  const result = await fn();

  const resultId =
    result && typeof result === "object" && "id" in result && typeof result.id === "string"
      ? result.id
      : undefined;

  try {
    await auditLogRepository.create({
      organizationId: entity.organizationId,
      actorType: actor.type,
      actorId: actor.id,
      action,
      entityType: entity.entityType,
      entityId: entity.entityId ?? resultId,
      before: toJson(entity.before),
      after: toJson(result),
    });
  } catch (error) {
    log.error("Failed to write audit log", {
      action,
      entityType: entity.entityType,
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  return result;
}
