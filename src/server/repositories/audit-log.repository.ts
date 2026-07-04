import type { Prisma, ActorType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface CreateAuditLogData {
  organizationId: string;
  actorType: ActorType;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

export const auditLogRepository = {
  create(data: CreateAuditLogData) {
    return prisma.auditLog.create({ data });
  },

  findMany(organizationId: string, options: { take?: number; cursor?: string } = {}) {
    return prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: Math.min(options.take ?? 100, 500),
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },
};
