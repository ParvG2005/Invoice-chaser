import type { PartyType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export const PARTY_PAGE_SIZE = 100;
export const PARTY_MAX_PAGE_SIZE = 500;

export interface PartyListOptions {
  type?: PartyType;
  search?: string;
  take?: number;
  cursor?: string;
}

export const partyRepository = {
  findMany(organizationId: string, options: PartyListOptions = {}) {
    const take = Math.min(options.take ?? PARTY_PAGE_SIZE, PARTY_MAX_PAGE_SIZE);
    return prisma.party.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.type ? { type: options.type } : {}),
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
    return prisma.party.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  },

  /** Case-insensitive lookup by name, used by import + backfill to avoid duplicate parties. */
  findByName(organizationId: string, name: string) {
    return prisma.party.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
      },
    });
  },

  create(data: Prisma.PartyCreateInput) {
    return prisma.party.create({ data });
  },

  update(organizationId: string, id: string, data: Prisma.PartyUncheckedUpdateInput) {
    return prisma.party.updateMany({
      where: { id, organizationId, deletedAt: null },
      data,
    });
  },

  softDelete(organizationId: string, id: string) {
    return prisma.party.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },
};
