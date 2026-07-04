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

function receiptVoucherXml(opts: { billType?: string; refName?: string } = {}): string {
  const billType = opts.billType ?? "Agst Ref";
  const refName = opts.refName ?? "INV-042";
  return `
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Receipt" ACTION="Create">
   <GUID>guid-vch-0002</GUID>
   <ALTERID>102</ALTERID>
   <DATE>20260410</DATE>
   <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
   <VOUCHERNUMBER>RCP-007</VOUCHERNUMBER>
   <PARTYLEDGERNAME>Acme Traders</PARTYLEDGERNAME>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Acme Traders</LEDGERNAME>
    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
    <AMOUNT>7080.00</AMOUNT>
    <BILLALLOCATIONS.LIST>
     <NAME>${refName}</NAME>
     <BILLTYPE>${billType}</BILLTYPE>
     <AMOUNT>7080.00</AMOUNT>
    </BILLALLOCATIONS.LIST>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>HDFC Bank</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>-7080.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
 </TALLYMESSAGE>`;
}

function paymentVoucherXml(): string {
  return `
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Payment" ACTION="Create">
   <GUID>guid-vch-0005</GUID>
   <ALTERID>60</ALTERID>
   <DATE>20260411</DATE>
   <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
   <VOUCHERNUMBER>PMT-001</VOUCHERNUMBER>
   <PARTYLEDGERNAME>Steel Corp</PARTYLEDGERNAME>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Steel Corp</LEDGERNAME>
    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
    <AMOUNT>-5000.00</AMOUNT>
    <BILLALLOCATIONS.LIST>
     <NAME>PB-010</NAME>
     <BILLTYPE>Agst Ref</BILLTYPE>
     <AMOUNT>-5000.00</AMOUNT>
    </BILLALLOCATIONS.LIST>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>HDFC Bank</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>5000.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
 </TALLYMESSAGE>`;
}

function creditNoteVoucherXml(): string {
  return `
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Credit Note" ACTION="Create">
   <GUID>guid-vch-0006</GUID>
   <ALTERID>70</ALTERID>
   <DATE>20260412</DATE>
   <VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>
   <VOUCHERNUMBER>CN-001</VOUCHERNUMBER>
   <PARTYLEDGERNAME>Acme Traders</PARTYLEDGERNAME>
   <ALLINVENTORYENTRIES.LIST>
    <STOCKITEMNAME>Widget A</STOCKITEMNAME>
    <RATE>1,200.00/nos</RATE>
    <ACTUALQTY> 2 nos</ACTUALQTY>
    <AMOUNT>2400.00</AMOUNT>
   </ALLINVENTORYENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Acme Traders</LEDGERNAME>
    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
    <AMOUNT>2400.00</AMOUNT>
    <BILLALLOCATIONS.LIST>
     <NAME>INV-042</NAME>
     <BILLTYPE>Agst Ref</BILLTYPE>
     <AMOUNT>2400.00</AMOUNT>
    </BILLALLOCATIONS.LIST>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Sales Return</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>-2400.00</AMOUNT>
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

describe("tallyImportService.runBatch — stock-recording failure leaves tallyAlterId unstamped", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findBatchById.mockResolvedValue(batchRow({ rawContent: envelope(salesVoucherXml()) }));
    repo.findBillByGuid.mockResolvedValue(null);
    repo.findItemByName.mockResolvedValue({ id: "item-1", name: "Widget A" });
    repo.findPartyByName.mockResolvedValue({ id: "party-1", name: "Acme Traders", creditDays: 0 });
  });

  it("create path: a transient recordMovement failure leaves the new Invoice without tallyAlterId stamped", async () => {
    repo.findInvoiceByGuid.mockResolvedValue(null);
    stockService.recordMovement.mockRejectedValueOnce(new Error("transient DB error"));

    await tallyImportService.runBatch("org-1", "batch-1");

    // The invoice row is created with tallyGuid (so a retry can find it) but
    // the failure in recordVoucherStock must prevent the follow-up call that
    // would stamp tallyAlterId — otherwise a retry after the transient issue
    // is fixed would be permanently SKIPPED by the ALTERID check.
    expect(invoiceService.create).toHaveBeenCalledTimes(1);
    expect(invoiceService.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ tallyGuid: "guid-vch-0001" }),
    );
    const stampCalls = (invoiceService.update.mock.calls as unknown as unknown[][]).filter(
      (c) => c[2] && Object.prototype.hasOwnProperty.call(c[2] as object, "tallyAlterId"),
    );
    expect(stampCalls).toHaveLength(0);

    const record = repo.createRecord.mock.calls.find((c) => c[0].status === "ERRORED");
    expect(record?.[0].message).toMatch(/transient DB error/);
  });

  it("update path: a transient recordMovement failure leaves the existing Invoice's tallyAlterId unchanged", async () => {
    repo.findInvoiceByGuid.mockResolvedValue({
      id: "invoice-1",
      tallyGuid: "guid-vch-0001",
      tallyAlterId: 50, // lower than the voucher's ALTERID (101) -> update path
    });
    stockService.recordMovement.mockRejectedValueOnce(new Error("transient DB error"));

    await tallyImportService.runBatch("org-1", "batch-1");

    // Content update runs, but the final call that would bump tallyAlterId
    // to 101 must never happen because recordVoucherStock threw first.
    expect(invoiceService.update).toHaveBeenCalledWith(
      "org-1",
      "invoice-1",
      expect.objectContaining({ tallyGuid: "guid-vch-0001" }),
    );
    const stampCalls = (invoiceService.update.mock.calls as unknown as unknown[][]).filter(
      (c) => c[2] && (c[2] as Record<string, unknown>).tallyAlterId === 101,
    );
    expect(stampCalls).toHaveLength(0);
  });

  it("retry after the transient failure is fixed treats the voucher as an update, not a permanent skip", async () => {
    // First run: existing invoice has no prior tallyAlterId (first-ever import
    // attempt), and recordMovement fails partway through.
    repo.findInvoiceByGuid.mockResolvedValueOnce(null);
    stockService.recordMovement.mockRejectedValueOnce(new Error("transient DB error"));
    await tallyImportService.runBatch("org-1", "batch-1");
    expect(
      (invoiceService.update.mock.calls as unknown as unknown[][]).some(
        (c) => (c[2] as Record<string, unknown> | undefined)?.tallyAlterId === 101,
      ),
    ).toBe(false);

    vi.clearAllMocks();
    // Second run (retry): the invoice now exists with tallyGuid stamped but
    // tallyAlterId still unset from the failed first attempt, and the
    // transient issue is gone.
    repo.findInvoiceByGuid.mockResolvedValue({
      id: "invoice-1",
      tallyGuid: "guid-vch-0001",
      tallyAlterId: null,
    });
    await tallyImportService.runBatch("org-1", "batch-1");

    // Must be re-processed as an UPDATE (stock re-recorded, tallyAlterId
    // finally stamped) rather than SKIPPED forever.
    expect(invoiceService.create).not.toHaveBeenCalled();
    expect(invoiceService.update).toHaveBeenCalledWith(
      "org-1",
      "invoice-1",
      expect.objectContaining({ tallyAlterId: 101 }),
    );
    const record = repo.createRecord.mock.calls.find((c) => c[0].recordType === "Invoice");
    expect(record?.[0].status).toBe("UPDATED");
  });

  it("Purchase create path: a transient recordMovement failure leaves the new Bill without tallyAlterId stamped", async () => {
    repo.findBatchById.mockResolvedValue(batchRow({ rawContent: envelope(purchaseVoucherXml()) }));
    repo.findBillByGuid.mockResolvedValue(null);
    stockService.recordMovement.mockRejectedValueOnce(new Error("transient DB error"));

    await tallyImportService.runBatch("org-1", "batch-1");

    expect(billService.create).toHaveBeenCalledTimes(1);
    const stampCalls = (billService.update.mock.calls as unknown as unknown[][]).filter(
      (c) => c[2] && Object.prototype.hasOwnProperty.call(c[2] as object, "tallyAlterId"),
    );
    expect(stampCalls).toHaveLength(0);
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

describe("tallyImportService.runBatch — money vouchers (Receipt/Payment/Credit Note)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findPaymentByGuid.mockResolvedValue(null);
    repo.findPartyByName.mockImplementation(async (_org: string, name: string) =>
      name === "Acme Traders"
        ? { id: "party-1", name, creditDays: 0 }
        : name === "Steel Corp"
          ? { id: "party-2", name, creditDays: 0 }
          : null,
    );
    repo.findInvoiceByNumber.mockResolvedValue(null);
    repo.findBillByNumber.mockResolvedValue(null);
    repo.findItemByName.mockResolvedValue({ id: "item-1", name: "Widget A" });
  });

  it("Receipt voucher: creates a Payment (direction IN) with an invoice allocation resolved via Agst Ref", async () => {
    repo.findBatchById.mockResolvedValue(batchRow({ rawContent: envelope(receiptVoucherXml()) }));
    repo.findInvoiceByNumber.mockResolvedValue({ id: "inv-42" });

    await tallyImportService.runBatch("org-1", "batch-1");

    expect(paymentService.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        partyId: "party-1",
        direction: "IN",
        amount: 7080,
        mode: "BANK_TRANSFER",
        reference: "HDFC Bank",
        tallyGuid: "guid-vch-0002",
        allocations: [{ documentId: "inv-42", amount: 7080 }],
      }),
    );
    const record = repo.createRecord.mock.calls.find((c) => c[0].recordType === "Payment");
    expect(record?.[0].status).toBe("CREATED");
  });

  it("Receipt with an unmatched invoice ref: payment created without that allocation, ImportRecord notes it", async () => {
    repo.findBatchById.mockResolvedValue(batchRow({ rawContent: envelope(receiptVoucherXml()) }));
    repo.findInvoiceByNumber.mockResolvedValue(null);

    await tallyImportService.runBatch("org-1", "batch-1");

    expect(paymentService.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ allocations: [] }),
    );
    const record = repo.createRecord.mock.calls.find((c) => c[0].recordType === "Payment");
    expect(record?.[0].message).toMatch(/Unmatched bill ref "INV-042"/);
  });

  it("Receipt with a non-Agst-Ref allocation (New Ref): left unallocated, noted, not treated as an error", async () => {
    repo.findBatchById.mockResolvedValue(
      batchRow({ rawContent: envelope(receiptVoucherXml({ billType: "New Ref" })) }),
    );

    await tallyImportService.runBatch("org-1", "batch-1");

    expect(paymentService.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ allocations: [] }),
    );
    expect(repo.findInvoiceByNumber).not.toHaveBeenCalled();
    const record = repo.createRecord.mock.calls.find((c) => c[0].recordType === "Payment");
    expect(record?.[0].status).toBe("CREATED");
    expect(record?.[0].message).toMatch(/left unallocated/);
  });

  it("Payment voucher (direction OUT): allocates to a Bill resolved by number", async () => {
    repo.findBatchById.mockResolvedValue(batchRow({ rawContent: envelope(paymentVoucherXml()) }));
    repo.findBillByNumber.mockResolvedValue({ id: "bill-9" });

    await tallyImportService.runBatch("org-1", "batch-1");

    expect(paymentService.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        partyId: "party-2",
        direction: "OUT",
        amount: 5000,
        mode: "BANK_TRANSFER",
        reference: "HDFC Bank",
        allocations: [{ documentId: "bill-9", amount: 5000 }],
      }),
    );
  });

  it("Credit Note: creates a Payment (mode OTHER, reference 'Credit Note') and records stock IN via ADJUSTMENT", async () => {
    repo.findBatchById.mockResolvedValue(batchRow({ rawContent: envelope(creditNoteVoucherXml()) }));
    repo.findInvoiceByNumber.mockResolvedValue({ id: "inv-42" });

    await tallyImportService.runBatch("org-1", "batch-1");

    expect(paymentService.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        direction: "IN",
        mode: "OTHER",
        reference: "Credit Note",
        allocations: [{ documentId: "inv-42", amount: 2400 }],
      }),
    );
    expect(stockService.recordMovement).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ itemId: "item-1", qty: 2, sourceType: "ADJUSTMENT", sourceId: "payment-1" }),
    );
  });

  it("idempotency: existing Payment with same-or-newer ALTERID -> SKIPPED, paymentService.create not called", async () => {
    repo.findBatchById.mockResolvedValue(batchRow({ rawContent: envelope(receiptVoucherXml()) }));
    repo.findPaymentByGuid.mockResolvedValue({ id: "payment-existing", tallyGuid: "guid-vch-0002", tallyAlterId: 102 });

    await tallyImportService.runBatch("org-1", "batch-1");

    expect(paymentService.create).not.toHaveBeenCalled();
    const record = repo.createRecord.mock.calls.find((c) => c[0].recordType === "Payment");
    expect(record?.[0].status).toBe("SKIPPED");
  });

  it("idempotency: existing Payment with an older ALTERID -> SKIPPED with explanatory message (no in-place update)", async () => {
    repo.findBatchById.mockResolvedValue(batchRow({ rawContent: envelope(receiptVoucherXml()) }));
    repo.findPaymentByGuid.mockResolvedValue({ id: "payment-existing", tallyGuid: "guid-vch-0002", tallyAlterId: 50 });

    await tallyImportService.runBatch("org-1", "batch-1");

    expect(paymentService.create).not.toHaveBeenCalled();
    const record = repo.createRecord.mock.calls.find((c) => c[0].recordType === "Payment");
    expect(record?.[0].status).toBe("SKIPPED");
    expect(record?.[0].message).toMatch(/not supported/i);
  });
});
