import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    importBatch: { findFirst, findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    importRecord: { create: vi.fn(), findMany: vi.fn() },
    party: { findFirst },
    item: { findFirst },
    invoice: { findFirst },
    bill: { findFirst },
    payment: { findFirst },
  },
}));

import { tallyImportRepository } from "@/server/repositories/tally-import.repository";

describe("tallyImportRepository org scoping", () => {
  beforeEach(() => findFirst.mockClear());

  it.each([
    ["findBatchById", () => tallyImportRepository.findBatchById("org-1", "x")],
    ["findPartyByGuid", () => tallyImportRepository.findPartyByGuid("org-1", "g")],
    ["findPartyByName", () => tallyImportRepository.findPartyByName("org-1", "n")],
    ["findItemByGuid", () => tallyImportRepository.findItemByGuid("org-1", "g")],
    ["findItemByName", () => tallyImportRepository.findItemByName("org-1", "n")],
    ["findInvoiceByGuid", () => tallyImportRepository.findInvoiceByGuid("org-1", "g")],
    ["findInvoiceByNumber", () => tallyImportRepository.findInvoiceByNumber("org-1", "INV-1")],
    ["findBillByGuid", () => tallyImportRepository.findBillByGuid("org-1", "g")],
    ["findBillByNumber", () => tallyImportRepository.findBillByNumber("org-1", "BILL-1")],
    ["findPaymentByGuid", () => tallyImportRepository.findPaymentByGuid("org-1", "g")],
  ])("%s scopes by organizationId", async (_name, call) => {
    await call();
    const where = findFirst.mock.calls.at(-1)?.[0]?.where;
    expect(where.organizationId).toBe("org-1");
  });

  it("createBatch defaults status to PENDING and passes through fields", async () => {
    const create = vi.fn().mockResolvedValue({ id: "b-1" });
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.importBatch as unknown as { create: typeof create }).create = create;

    await tallyImportRepository.createBatch({
      organizationId: "org-1",
      source: "TALLY_MASTERS_LEDGERS",
      fileName: "ledgers.xml",
      fileHash: "hash-1",
      rawContent: "<xml/>",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        source: "TALLY_MASTERS_LEDGERS",
        fileName: "ledgers.xml",
        fileHash: "hash-1",
        rawContent: "<xml/>",
        status: "PENDING",
      },
    });
  });

  it("updateBatch scopes update by organizationId and excludes deleted batches", async () => {
    const update = vi.fn().mockResolvedValue({ id: "b-1" });
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.importBatch as unknown as { update: typeof update }).update = update;

    await tallyImportRepository.updateBatch("org-1", "b-1", { status: "COMPLETED" });

    expect(update).toHaveBeenCalledWith({
      where: { id: "b-1", organizationId: "org-1", deletedAt: null },
      data: { status: "COMPLETED" },
    });
  });

  it("listRecords does not filter by deletedAt (ImportRecord has no soft delete)", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.importRecord as unknown as { findMany: typeof findMany }).findMany = findMany;

    await tallyImportRepository.listRecords("org-1", "batch-1");

    const where = findMany.mock.calls.at(-1)?.[0]?.where;
    expect(where).toEqual({ organizationId: "org-1", batchId: "batch-1" });
  });

  it("createRecord passes recordType/status fields through as-is", async () => {
    const create = vi.fn().mockResolvedValue({ id: "r-1" });
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.importRecord as unknown as { create: typeof create }).create = create;

    await tallyImportRepository.createRecord({
      organizationId: "org-1",
      batchId: "batch-1",
      recordType: "LEDGER",
      entityId: "party-1",
      tallyGuid: "guid-1",
      alterId: 42,
      status: "CREATED",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        batchId: "batch-1",
        recordType: "LEDGER",
        entityId: "party-1",
        tallyGuid: "guid-1",
        alterId: 42,
        status: "CREATED",
      },
    });
  });
});
