import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const emailLogRepository = {
  create(data: Prisma.EmailLogCreateInput) {
    return prisma.emailLog.create({ data });
  },

  updateStatus(
    id: string,
    status: Prisma.EmailLogUpdateInput["status"],
    extra?: { providerId?: string; errorMessage?: string; sentAt?: Date },
  ) {
    return prisma.emailLog.update({
      where: { id },
      data: { status, ...extra },
    });
  },

  countSent(organizationId: string) {
    return prisma.emailLog.count({
      where: { organizationId, status: "SENT" },
    });
  },
};
