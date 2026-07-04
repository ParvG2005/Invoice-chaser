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
}));
vi.mock("@/server/repositories/tally-import.repository", () => ({ tallyImportRepository: repo }));

const partyService = vi.hoisted(() => ({
  create: vi.fn(async (_org: string, _input: Record<string, unknown>) => ({ id: "party-1" })),
  update: vi.fn(async (_org: string, _id: string, _input: Record<string, unknown>) => ({
    id: "party-1",
  })),
}));
const itemService = vi.hoisted(() => ({
  create: vi.fn(async (_org: string, _input: Record<string, unknown>) => ({ id: "item-1" })),
  update: vi.fn(async (_org: string, _id: string, _input: Record<string, unknown>) => ({
    id: "item-1",
  })),
}));
vi.mock("@/server/services/party.service", () => ({ partyService }));
vi.mock("@/server/services/item.service", () => ({ itemService }));
vi.mock("@/server/services/audit.service", () => ({
  withAudit: vi.fn((_a: unknown, _b: unknown, _c: unknown, fn: () => unknown) => fn()),
  SYSTEM_ACTOR: { type: "SYSTEM", id: null },
}));

import { tallyImportService } from "@/server/services/import/tally-import.service";

const LEDGER_XML = `<?xml version="1.0"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
 <TALLYMESSAGE>
  <LEDGER NAME="Acme Traders"><GUID>g1</GUID><ALTERID>5</ALTERID><PARENT>Sundry Debtors</PARENT></LEDGER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <LEDGER NAME="Steel Corp"><GUID>g2</GUID><ALTERID>9</ALTERID><PARENT>Sundry Creditors</PARENT></LEDGER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <LEDGER NAME="Sales Account"><GUID>g3</GUID><ALTERID>2</ALTERID><PARENT>Sales Accounts</PARENT></LEDGER>
 </TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

const STOCKITEM_XML = `<?xml version="1.0"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
 <TALLYMESSAGE>
  <STOCKITEM NAME="Widget A"><GUID>s1</GUID><ALTERID>5</ALTERID><BASEUNITS>nos</BASEUNITS><OPENINGBALANCE>10 nos</OPENINGBALANCE><OPENINGRATE>100.00/nos</OPENINGRATE></STOCKITEM>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <STOCKITEM NAME="Widget B"><GUID>s2</GUID><ALTERID>9</ALTERID><BASEUNITS>nos</BASEUNITS><OPENINGBALANCE>20 nos</OPENINGBALANCE><OPENINGRATE>200.00/nos</OPENINGRATE></STOCKITEM>
 </TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    organizationId: "org-1",
    source: "TALLY_MASTERS_LEDGERS",
    fileName: "ledgers.xml",
    fileHash: "hash",
    status: "PENDING",
    rawContent: LEDGER_XML,
    totalCount: 0,
    processedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errorSummary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("tallyImportService.createBatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hashes the file and stores raw XML", async () => {
    repo.createBatch.mockResolvedValue(batchRow());
    await tallyImportService.createBatch("org-1", {
      source: "TALLY_MASTERS_LEDGERS",
      fileName: "ledgers.xml",
      xml: LEDGER_XML,
    });
    const arg = repo.createBatch.mock.calls[0][0];
    expect(arg.organizationId).toBe("org-1");
    expect(arg.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(arg.rawContent).toBe(LEDGER_XML);
  });

  it("rejects XML that does not parse as a Tally envelope", async () => {
    await expect(
      tallyImportService.createBatch("org-1", {
        source: "TALLY_MASTERS_LEDGERS",
        fileName: "junk.xml",
        xml: "<html>nope</html>",
      }),
    ).rejects.toThrow(/TALLYMESSAGE|Tally XML/);
  });
});

describe("tallyImportService.runBatch — masters/ledgers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findBatchById.mockResolvedValue(batchRow());
    repo.findPartyByGuid.mockResolvedValue(null);
  });

  it("creates Parties only for Sundry Debtors/Creditors groups, typed by group", async () => {
    await tallyImportService.runBatch("org-1", "batch-1");
    expect(partyService.create).toHaveBeenCalledTimes(2);
    const types = partyService.create.mock.calls.map((c) => c[1].type);
    expect(types).toContain("CUSTOMER");
    expect(types).toContain("SUPPLIER");
    // non-party ledger recorded as SKIPPED, not errored
    const skipped = repo.createRecord.mock.calls.filter((c) => c[0].status === "SKIPPED");
    expect(skipped).toHaveLength(1);
  });

  it("is idempotent: same alterId → SKIPPED, higher alterId → UPDATED", async () => {
    repo.findPartyByGuid.mockImplementation(async (_org: string, guid: string) =>
      guid === "g1"
        ? { id: "party-1", tallyGuid: "g1", tallyAlterId: 5, name: "Acme Traders" } // unchanged
        : guid === "g2"
          ? { id: "party-2", tallyGuid: "g2", tallyAlterId: 4, name: "Steel Corp" } // stale
          : null,
    );
    await tallyImportService.runBatch("org-1", "batch-1");
    expect(partyService.create).not.toHaveBeenCalled();
    expect(partyService.update).toHaveBeenCalledTimes(1);
    const statuses = repo.createRecord.mock.calls.map((c) => c[0].status);
    expect(statuses.filter((a) => a === "SKIPPED")).toHaveLength(2); // g1 + Sales Account
    expect(statuses.filter((a) => a === "UPDATED")).toHaveLength(1);
  });

  it("finishes the batch with correct counters and COMPLETED status", async () => {
    await tallyImportService.runBatch("org-1", "batch-1");
    const finalUpdate = repo.updateBatch.mock.calls.at(-1)?.[2];
    if (!finalUpdate) throw new Error("expected updateBatch to have been called");
    expect(finalUpdate.status).toBe("COMPLETED");
    expect(finalUpdate.createdCount).toBe(2);
    expect(finalUpdate.skippedCount).toBe(1);
    expect(finalUpdate.errorCount).toBe(0);
  });

  it("a throwing record becomes ERRORED and the batch still completes", async () => {
    partyService.create.mockRejectedValueOnce(new Error("boom"));
    await tallyImportService.runBatch("org-1", "batch-1");
    const statuses = repo.createRecord.mock.calls.map((c) => c[0].status);
    expect(statuses).toContain("ERRORED");
    expect(repo.updateBatch.mock.calls.at(-1)?.[2].status).toBe("COMPLETED");
  });
});

describe("tallyImportService.runBatch — masters/stockitems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findBatchById.mockResolvedValue(
      batchRow({ source: "TALLY_MASTERS_STOCKITEMS", fileName: "items.xml", rawContent: STOCKITEM_XML }),
    );
    repo.findItemByGuid.mockResolvedValue(null);
  });

  it("creates Items for every STOCKITEM node", async () => {
    await tallyImportService.runBatch("org-1", "batch-1");
    expect(itemService.create).toHaveBeenCalledTimes(2);
    const names = itemService.create.mock.calls.map((c) => c[1].name);
    expect(names).toContain("Widget A");
    expect(names).toContain("Widget B");
  });

  it("is idempotent: same alterId → SKIPPED, higher alterId → UPDATED", async () => {
    repo.findItemByGuid.mockImplementation(async (_org: string, guid: string) =>
      guid === "s1"
        ? { id: "item-1", tallyGuid: "s1", tallyAlterId: 5, name: "Widget A" } // unchanged
        : guid === "s2"
          ? { id: "item-2", tallyGuid: "s2", tallyAlterId: 4, name: "Widget B" } // stale
          : null,
    );
    await tallyImportService.runBatch("org-1", "batch-1");
    expect(itemService.create).not.toHaveBeenCalled();
    expect(itemService.update).toHaveBeenCalledTimes(1);
    const statuses = repo.createRecord.mock.calls.map((c) => c[0].status);
    expect(statuses.filter((a) => a === "SKIPPED")).toHaveLength(1);
    expect(statuses.filter((a) => a === "UPDATED")).toHaveLength(1);
  });

  it("finishes the batch with correct counters and COMPLETED status", async () => {
    await tallyImportService.runBatch("org-1", "batch-1");
    const finalUpdate = repo.updateBatch.mock.calls.at(-1)?.[2];
    if (!finalUpdate) throw new Error("expected updateBatch to have been called");
    expect(finalUpdate.status).toBe("COMPLETED");
    expect(finalUpdate.createdCount).toBe(2);
    expect(finalUpdate.errorCount).toBe(0);
  });

  it("a throwing record becomes ERRORED and the batch still completes", async () => {
    itemService.create.mockRejectedValueOnce(new Error("boom"));
    await tallyImportService.runBatch("org-1", "batch-1");
    const statuses = repo.createRecord.mock.calls.map((c) => c[0].status);
    expect(statuses).toContain("ERRORED");
    expect(repo.updateBatch.mock.calls.at(-1)?.[2].status).toBe("COMPLETED");
  });
});
