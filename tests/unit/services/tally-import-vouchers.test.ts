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
  create: vi.fn(async (_org: string, input: { name: string; type: string }) => ({
    id: input.name === "Steel Corp" ? "party-2" : "party-1",
    creditDays: null,
  })),
  update: vi.fn(async (_org: string, id: string) => ({ id })),
}));
const itemService = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: "item-1" })),
  update: vi.fn(async (_org: string, id: string) => ({ id })),
}));
const invoiceService = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: "invoice-1" })),
  update: vi.fn(async (_org: string, id: string) => ({ id })),
}));
const billService = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: "bill-1" })),
  update: vi.fn(async (_org: string, id: string) => ({ id })),
}));
const stockService = vi.hoisted(() => ({
  recordMovement: vi.fn(async () => ({ id: "mv-1" })),
  replaceMovementsForSource: vi.fn(async () => undefined),
}));
const paymentService = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: "payment-1" })),
}));

vi.mock("@/server/services/party.service", () => ({ partyService }));
vi.mock("@/server/services/item.service", () => ({ itemService }));
vi.mock("@/server/services/invoice.service", () => ({ invoiceService }));
vi.mock("@/server/services/bill.service", () => ({ billService }));
vi.mock("@/server/services/stock.service", () => ({ stockService }));
vi.mock("@/server/services/payment.service", () => ({ paymentService }));
vi.mock("@/server/services/audit.service", () => ({
  withAudit: vi.fn((_a: unknown, _b: unknown, _c: unknown, fn: () => unknown) => fn()),
  SYSTEM_ACTOR: { type: "SYSTEM", id: null },
}));

import { tallyImportService } from "@/server/services/import/tally-import.service";

function salesVoucherXml(): string {
  return `
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Sales" ACTION="Create">
   <GUID>guid-vch-0001</GUID>
   <ALTERID>101</ALTERID>
   <DATE>20260401</DATE>
   <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
   <VOUCHERNUMBER>INV-042</VOUCHERNUMBER>
   <PARTYLEDGERNAME>Acme Traders</PARTYLEDGERNAME>
   <NARRATION>April supply</NARRATION>
   <ALLINVENTORYENTRIES.LIST>
    <STOCKITEMNAME>Widget A</STOCKITEMNAME>
    <RATE>1,200.00/nos</RATE>
    <ACTUALQTY> 5 nos</ACTUALQTY>
    <AMOUNT>6000.00</AMOUNT>
   </ALLINVENTORYENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Acme Traders</LEDGERNAME>
    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
    <AMOUNT>-7080.00</AMOUNT>
    <BILLALLOCATIONS.LIST>
     <NAME>INV-042</NAME>
     <BILLTYPE>New Ref</BILLTYPE>
     <AMOUNT>-7080.00</AMOUNT>
    </BILLALLOCATIONS.LIST>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Sales Account</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>6000.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Output IGST</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>1080.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
 </TALLYMESSAGE>`;
}

function purchaseVoucherXml(): string {
  return `
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Purchase" ACTION="Create">
   <GUID>guid-vch-0003</GUID>
   <ALTERID>50</ALTERID>
   <DATE>20260405</DATE>
   <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
   <VOUCHERNUMBER>PB-010</VOUCHERNUMBER>
   <PARTYLEDGERNAME>Steel Corp</PARTYLEDGERNAME>
   <NARRATION>Raw material</NARRATION>
   <ALLINVENTORYENTRIES.LIST>
    <STOCKITEMNAME>Widget A</STOCKITEMNAME>
    <RATE>1,200.00/nos</RATE>
    <ACTUALQTY> 10 nos</ACTUALQTY>
    <AMOUNT>12000.00</AMOUNT>
   </ALLINVENTORYENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Steel Corp</LEDGERNAME>
    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
    <AMOUNT>12000.00</AMOUNT>
    <BILLALLOCATIONS.LIST>
     <NAME>PB-010</NAME>
     <BILLTYPE>New Ref</BILLTYPE>
     <AMOUNT>12000.00</AMOUNT>
    </BILLALLOCATIONS.LIST>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Purchase Account</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>-12000.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
 </TALLYMESSAGE>`;
}

function journalVoucherXml(): string {
  return `
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Journal" ACTION="Create">
   <GUID>guid-vch-0004</GUID>
   <ALTERID>1</ALTERID>
   <DATE>20260406</DATE>
   <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
   <VOUCHERNUMBER>JNL-1</VOUCHERNUMBER>
   <PARTYLEDGERNAME></PARTYLEDGERNAME>
  </VOUCHER>
 </TALLYMESSAGE>`;
}

function envelope(...messages: string[]): string {
  return `<?xml version="1.0"?>\n<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>${messages.join("")}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

const COMBINED_XML = envelope(salesVoucherXml(), purchaseVoucherXml());
const JOURNAL_XML = envelope(journalVoucherXml());

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    organizationId: "org-1",
    source: "TALLY_VOUCHERS",
    fileName: "vouchers.xml",
    fileHash: "hash",
    status: "PENDING",
    rawContent: COMBINED_XML,
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

describe("tallyImportService.runBatch — vouchers/sales+purchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findBatchById.mockResolvedValue(batchRow());
    repo.findInvoiceByGuid.mockResolvedValue(null);
    repo.findBillByGuid.mockResolvedValue(null);
    repo.findItemByName.mockResolvedValue({ id: "item-1", name: "Widget A" });
    repo.findPartyByName.mockImplementation(async (_org: string, name: string) =>
      name === "Acme Traders" ? { id: "party-1", name, creditDays: 0 } : null,
    );
  });

  it("creates an Invoice with line items for a Sales voucher and records stock OUT", async () => {
    await tallyImportService.runBatch("org-1", "batch-1");

    expect(invoiceService.create).toHaveBeenCalledTimes(1);
    expect(invoiceService.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        type: "RECEIVABLE",
        invoiceNumber: "INV-042",
        partyId: "party-1",
        amount: 7080,
        tallyGuid: "guid-vch-0001",
        lineItems: [{ description: "Widget A", quantity: 5, rate: 1200, amount: 6000, itemId: "item-1" }],
      }),
    );

    expect(stockService.recordMovement).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ itemId: "item-1", qty: -5, sourceType: "INVOICE", sourceId: "invoice-1" }),
    );
  });

  it("creates a Bill for a Purchase voucher and records stock IN", async () => {
    await tallyImportService.runBatch("org-1", "batch-1");

    expect(billService.create).toHaveBeenCalledTimes(1);
    expect(billService.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ partyId: "party-2", amount: 12000, billNumber: "PB-010" }),
    );

    expect(stockService.recordMovement).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ itemId: "item-1", qty: 10, sourceType: "BILL", sourceId: "bill-1" }),
    );
  });

  it("creates a stub SUPPLIER party for the unmatched Purchase party and notes it on the ImportRecord", async () => {
    await tallyImportService.runBatch("org-1", "batch-1");

    expect(partyService.create).toHaveBeenCalledWith("org-1", { name: "Steel Corp", type: "SUPPLIER" });
    const billRecord = repo.createRecord.mock.calls.find(
      (c) => c[0].recordType === "Bill" && c[0].status === "CREATED",
    );
    expect(billRecord?.[0].message).toMatch(/stub/i);
  });
});

describe("tallyImportService.runBatch — Sales idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findBatchById.mockResolvedValue(batchRow({ rawContent: envelope(salesVoucherXml()) }));
    repo.findBillByGuid.mockResolvedValue(null);
    repo.findItemByName.mockResolvedValue({ id: "item-1", name: "Widget A" });
    repo.findPartyByName.mockResolvedValue({ id: "party-1", name: "Acme Traders", creditDays: 0 });
  });

  it("same-or-lower ALTERID on the existing Invoice -> SKIPPED, no update", async () => {
    repo.findInvoiceByGuid.mockResolvedValue({ id: "invoice-1", tallyGuid: "guid-vch-0001", tallyAlterId: 101 });

    await tallyImportService.runBatch("org-1", "batch-1");

    expect(invoiceService.update).not.toHaveBeenCalled();
    expect(invoiceService.create).not.toHaveBeenCalled();
    const record = repo.createRecord.mock.calls.find((c) => c[0].recordType === "Invoice");
    expect(record?.[0].status).toBe("SKIPPED");
  });

  it("newer ALTERID on the existing Invoice -> UPDATED, with beforeJson snapshot", async () => {
    repo.findInvoiceByGuid.mockResolvedValue({ id: "invoice-1", tallyGuid: "guid-vch-0001", tallyAlterId: 100 });

    await tallyImportService.runBatch("org-1", "batch-1");

    expect(invoiceService.update).toHaveBeenCalledWith(
      "org-1",
      "invoice-1",
      expect.objectContaining({ tallyGuid: "guid-vch-0001" }),
    );
    expect(stockService.replaceMovementsForSource).toHaveBeenCalledWith("org-1", "INVOICE", "invoice-1");
    const record = repo.createRecord.mock.calls.find((c) => c[0].recordType === "Invoice");
    expect(record?.[0].status).toBe("UPDATED");
    expect(record?.[0].beforeJson).toBeDefined();
  });
});

describe("tallyImportService.runBatch — unsupported voucher kind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findBatchById.mockResolvedValue(batchRow({ rawContent: JOURNAL_XML }));
  });

  it("a Journal voucher is SKIPPED with an 'Unsupported voucher type' message", async () => {
    await tallyImportService.runBatch("org-1", "batch-1");

    expect(invoiceService.create).not.toHaveBeenCalled();
    expect(billService.create).not.toHaveBeenCalled();
    const record = repo.createRecord.mock.calls.find((c) => c[0].recordType === "Voucher");
    expect(record?.[0].status).toBe("SKIPPED");
    expect(record?.[0].message).toMatch(/Unsupported voucher type "Journal"/);
  });
});
