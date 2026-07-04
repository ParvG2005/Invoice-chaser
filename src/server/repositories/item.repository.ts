import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export const ITEM_PAGE_SIZE = 100;
export const ITEM_MAX_PAGE_SIZE = 500;

export interface ItemListOptions {
  search?: string;
  take?: number;
  cursor?: string;
}

export const itemRepository = {
  findMany(organizationId: string, options: ItemListOptions = {}) {
    const take = Math.min(options.take ?? ITEM_PAGE_SIZE, ITEM_MAX_PAGE_SIZE);
    return prisma.item.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.search
          ? { name: { contains: options.search, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.item.findFirst({ where: { id, organizationId, deletedAt: null } });
  },

  /** Case-insensitive lookup by name, used to avoid duplicate items within an org. */
  findByName(organizationId: string, name: string) {
    return prisma.item.findFirst({
      where: { organizationId, deletedAt: null, name: { equals: name, mode: "insensitive" } },
    });
  },

  create(data: Prisma.ItemCreateInput) {
    return prisma.item.create({ data });
  },

  update(organizationId: string, id: string, data: Prisma.ItemUpdateInput) {
    return prisma.item.updateMany({ where: { id, organizationId, deletedAt: null }, data });
  },

  softDelete(organizationId: string, id: string) {
    return prisma.item.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },
};
