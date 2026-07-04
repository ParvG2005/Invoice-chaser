import type { InvoiceStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface BillListOptions {
  status?: InvoiceStatus;
  partyId?: string;
  take?: number;
  cursor?: string;
}

export const billRepository = {
  findMany(organizationId: string, options: BillListOptions = {}) {
    return prisma.bill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.status ? { status: options.status } : {}),
        ...(options.partyId ? { partyId: options.partyId } : {}),
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: Math.min(options.take ?? 100, 500),
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.bill.findFirst({ where: { id, organizationId, deletedAt: null } });
  },

  /** Open (not fully paid) bills for a party, oldest due date first — allocation order. */
  findOpenForParty(organizationId: string, partyId: string) {
    return prisma.bill.findMany({
      where: { organizationId, partyId, deletedAt: null, status: { not: "PAID" } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
  },

  create(data: Prisma.BillCreateInput) {
    return prisma.bill.create({ data });
  },

  update(organizationId: string, id: string, data: Prisma.BillUpdateInput) {
    return prisma.bill.updateMany({ where: { id, organizationId, deletedAt: null }, data });
  },

  softDelete(organizationId: string, id: string) {
    return prisma.bill.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },
};
