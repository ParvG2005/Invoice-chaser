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

  /**
   * Lookup by GSTIN, used by the PDF-import enrichment path to match a buyer
   * to an existing party before falling back to a name match. GSTIN is a
   * stable business identifier, so it's the more reliable key when present.
   */
  findByGstin(organizationId: string, gstin: string) {
    return prisma.party.findFirst({
      where: { organizationId, deletedAt: null, gstin },
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

  /**
   * Party + its non-deleted invoices/bills/payments, for building the
   * ledger statement (Task 17). Additive relation-include on top of the
   * bare `findById` shape used everywhere else.
   */
  findByIdWithLedgerRelations(organizationId: string, id: string) {
    return prisma.party.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        invoices: { where: { deletedAt: null } },
        bills: { where: { deletedAt: null } },
        payments: { where: { deletedAt: null } },
      },
    });
  },

  /**
   * Parties managed by `agentId` (i.e. `party.agentId === agentId`), with
   * their non-deleted invoices/bills for the agent rollup's outstanding
   * total (Task 17).
   */
  findManagedParties(organizationId: string, agentId: string) {
    return prisma.party.findMany({
      where: { organizationId, agentId, deletedAt: null },
      include: {
        invoices: { where: { deletedAt: null } },
        bills: { where: { deletedAt: null } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  },
};
