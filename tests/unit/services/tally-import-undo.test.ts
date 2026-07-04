import { describe, it, expect, vi, beforeEach } from "vitest";

const repo = vi.hoisted(() => ({
  createBatch: vi.fn(),
  findBatchById: vi.fn(),
  listBatches: vi.fn(),
  updateBatch: vi.fn(async (_o: string, id: string, data: Record<string, unknown>) => ({
    id,
    createdAt: new Date(),
    ...data,
  })),
  createRecord: vi.fn(async (d: Record<string, unknown>) => ({ id: "rec-1", ...d })),
  listRecords: vi.fn(),
  findPartyByGuid: vi.fn(),
  findPartyByName: vi.fn(),
  findItemByGuid: vi.fn(),
  findItemByName: vi.fn(),
  findInvoiceByGuid: vi.fn(),
  findInvoiceByNumber: vi.fn(),
  findBillByGuid: vi.fn(),
  findBillByNumber: vi.fn(),
  findPaymentByGuid: vi.fn(),
  softDeleteEntity: vi.fn(async (_tx: unknown, _o: string, _t: string, _id: string) => undefined),
  restoreEntitySnapshot: vi.fn(async () => undefined),
  countReferences: vi.fn(async () => 0),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn("tx")) },
}));
vi.mock("@/server/repositories/tally-import.repository", () => ({ tallyImportRepository: repo }));

const withAuditCalls: unknown[] = [];
vi.mock("@/server/services/audit.service", () => ({
  withAudit: vi.fn((actor: unknown, action: unknown, entity: unknown, fn: () => unknown) => {
    withAuditCalls.push({ actor, action, entity });
    return fn();
  }),
  SYSTEM_ACTOR: { type: "SYSTEM", id: null },
}));

// tally-import.service.ts imports these even though undoBatch doesn't need them —
// stub them out so the module loads cleanly under vitest.
vi.mock("@/server/services/party.service", () => ({ partyService: { create: vi.fn(), update: vi.fn() } }));
vi.mock("@/server/services/item.service", () => ({ itemService: { create: vi.fn(), update: vi.fn() } }));
vi.mock("@/server/services/invoice.service", () => ({
  invoiceService: { create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/server/services/bill.service", () => ({ billService: { create: vi.fn(), update: vi.fn() } }));
vi.mock("@/server/services/stock.service", () => ({
  stockService: { recordMovement: vi.fn(), replaceMovementsForSource: vi.fn() },
}));
vi.mock("@/server/services/payment.service", () => ({ paymentService: { create: vi.fn() } }));

import { tallyImportService } from "@/server/services/import/tally-import.service";

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    organizationId: "org-1",
    source: "TALLY_VOUCHERS",
    fileName: "vouchers.xml",
    fileHash: "hash",
    status: "COMPLETED",
    rawContent: null,
    totalCount: 4,
    processedCount: 4,
    createdCount: 3,
    updatedCount: 1,
    skippedCount: 0,
    errorCount: 0,
    errorSummary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    completedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function record(overrides: Record<string, unknown>) {
  return {
    id: `rec-${Math.random()}`,
    organizationId: "org-1",
    batchId: "batch-1",
    entityId: null,
    tallyGuid: "guid",
    alterId: 1,
    message: null,
    beforeJson: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("tallyImportService.undoBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withAuditCalls.length = 0;
  });

  it("soft-deletes CREATED entities in reverse creation order", async () => {
    repo.findBatchById.mockResolvedValue(batchRow());
    repo.listRecords.mockResolvedValue([
      record({ recordType: "Party", status: "CREATED", entityId: "party-1" }),
      record({ recordType: "Invoice", status: "CREATED", entityId: "invoice-1" }),
      record({ recordType: "Payment", status: "CREATED", entityId: "payment-1" }),
      record({
        recordType: "Party",
        status: "UPDATED",
        entityId: "party-2",
        beforeJson: { id: "party-2", name: "Old Name" },
      }),
    ]);

    await tallyImportService.undoBatch("org-1", "user-1", "batch-1");

    const softDeleteCalls = repo.softDeleteEntity.mock.calls.map((c) => [c[2], c[3]]);
    expect(softDeleteCalls).toEqual([
      ["Payment", "payment-1"],
      ["Invoice", "invoice-1"],
      ["Party", "party-1"],
    ]);
  });

  it("restores beforeJson for UPDATED records", async () => {
    repo.findBatchById.mockResolvedValue(batchRow());
    const beforeJson = { id: "party-2", name: "Old Name" };
    repo.listRecords.mockResolvedValue([
      record({ recordType: "Party", status: "UPDATED", entityId: "party-2", beforeJson }),
    ]);

    await tallyImportService.undoBatch("org-1", "user-1", "batch-1");

    expect(repo.restoreEntitySnapshot).toHaveBeenCalledWith(
      "tx",
      "org-1",
      "Party",
      "party-2",
      beforeJson,
    );
  });

  it("sets batch status to REVERTED on success", async () => {
    repo.findBatchById.mockResolvedValue(batchRow());
    repo.listRecords.mockResolvedValue([
      record({ recordType: "Party", status: "CREATED", entityId: "party-1" }),
    ]);

    await tallyImportService.undoBatch("org-1", "user-1", "batch-1");

    expect(repo.updateBatch).toHaveBeenCalledWith(
      "org-1",
      "batch-1",
      expect.objectContaining({
        status: "REVERTED",
        completedAt: expect.any(Date),
      }),
      "tx",
    );
  });

  it("throws IMPORT_NOT_UNDOABLE when the batch is already REVERTED", async () => {
    repo.findBatchById.mockResolvedValue(batchRow({ status: "REVERTED" }));

    await expect(tallyImportService.undoBatch("org-1", "user-1", "batch-1")).rejects.toMatchObject({
      code: "IMPORT_NOT_UNDOABLE",
    });
    expect(repo.listRecords).not.toHaveBeenCalled();
  });

  it("wraps the operation in withAudit with the expected actor/action/entity", async () => {
    repo.findBatchById.mockResolvedValue(batchRow());
    repo.listRecords.mockResolvedValue([]);

    await tallyImportService.undoBatch("org-1", "user-1", "batch-1");

    expect(withAuditCalls).toEqual([
      {
        actor: { type: "USER", id: "user-1" },
        action: "import.batch.undo",
        entity: expect.objectContaining({ entityType: "ImportBatch", entityId: "batch-1" }),
      },
    ]);
  });

  it("appends a warning to errorSummary when soft-deleted entities are referenced by later imports", async () => {
    repo.findBatchById.mockResolvedValue(batchRow());
    repo.listRecords.mockResolvedValue([
      record({ recordType: "Party", status: "CREATED", entityId: "party-1" }),
    ]);
    repo.countReferences.mockResolvedValue(2);

    await tallyImportService.undoBatch("org-1", "user-1", "batch-1");

    expect(repo.updateBatch).toHaveBeenCalledWith(
      "org-1",
      "batch-1",
      expect.objectContaining({
        errorSummary: "2 entities referenced by later imports were soft-deleted",
      }),
      "tx",
    );
  });

  it("wraps every per-entity revert plus the batch-status update in a single outer transaction", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    repo.findBatchById.mockResolvedValue(batchRow());
    repo.listRecords.mockResolvedValue([
      record({ recordType: "Party", status: "CREATED", entityId: "party-1" }),
      record({ recordType: "Invoice", status: "CREATED", entityId: "invoice-1" }),
    ]);

    await tallyImportService.undoBatch("org-1", "user-1", "batch-1");

    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalledTimes(1);
  });

  it("regression: does not mark the batch REVERTED if a later entity's revert throws mid-loop", async () => {
    // Guards against the non-atomic bug: previously each entity reverted in
    // its own inner transaction and the batch status was updated separately
    // afterwards, so a crash/throw partway through the loop left some
    // entities reverted but the batch still COMPLETED — a stuck state the
    // double-undo guard can't even retry (it only allows undo from
    // COMPLETED/FAILED). Wrapping the whole operation in one outer
    // transaction means the batch-status update is never reached when an
    // earlier step throws.
    repo.findBatchById.mockResolvedValue(batchRow());
    repo.listRecords.mockResolvedValue([
      record({ recordType: "Party", status: "CREATED", entityId: "party-1" }),
      record({ recordType: "Invoice", status: "CREATED", entityId: "invoice-1" }),
    ]);
    repo.softDeleteEntity
      .mockResolvedValueOnce(undefined) // Invoice (reverse order) succeeds
      .mockRejectedValueOnce(new Error("boom")); // Party fails

    await expect(
      tallyImportService.undoBatch("org-1", "user-1", "batch-1"),
    ).rejects.toThrow("boom");

    expect(repo.updateBatch).not.toHaveBeenCalled();
  });

  it("skips SKIPPED and ERRORED records without touching the repository", async () => {
    repo.findBatchById.mockResolvedValue(batchRow());
    repo.listRecords.mockResolvedValue([
      record({ recordType: "Party", status: "SKIPPED", entityId: "party-1" }),
      record({ recordType: "Party", status: "ERRORED", entityId: null }),
    ]);

    await tallyImportService.undoBatch("org-1", "user-1", "batch-1");

    expect(repo.softDeleteEntity).not.toHaveBeenCalled();
    expect(repo.restoreEntitySnapshot).not.toHaveBeenCalled();
  });
});
