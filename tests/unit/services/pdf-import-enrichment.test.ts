import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoiceService } from "@/server/services/invoice.service";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { partyRepository } from "@/server/repositories/party.repository";
import { itemRepository } from "@/server/repositories/item.repository";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";
import type { PdfImportInvoiceInput } from "@/lib/validations/invoice";

vi.mock("@/server/repositories/invoice.repository", () => ({
  invoiceRepository: {
    findByInvoiceNumber: vi.fn(),
    create: vi.fn(),
    createWithLineItems: vi.fn(),
  },
}));

vi.mock("@/server/repositories/party.repository", () => ({
  partyRepository: {
    findByGstin: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/server/repositories/item.repository", () => ({
  itemRepository: {
    findByName: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/jobs/inngest/scheduler", () => ({
  getJobScheduler: vi.fn(),
}));

const ORG = "org-1";

function fakeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    organizationId: ORG,
    clientName: "Acme Traders",
    clientEmail: "billing@acme.test",
    clientPhone: null,
    amount: 236,
    currency: "INR",
    dueDate: new Date("2026-08-01T12:00:00.000Z"),
    invoiceNumber: "PDF-1",
    notes: null,
    status: "PENDING",
    paidAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    deletedAt: null,
    partyId: null,
    subtotal: null,
    taxAmount: null,
    totalAmount: null,
    amountPaid: 0,
    ...overrides,
  };
}

function fakeParty(overrides: Record<string, unknown> = {}) {
  return {
    id: "party-1",
    organizationId: ORG,
    type: "CUSTOMER",
    name: "Acme Traders",
    email: null,
    phone: null,
    whatsapp: null,
    gstin: null,
    billingAddress: null,
    deletedAt: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<PdfImportInvoiceInput> = {}): PdfImportInvoiceInput {
  return {
    invoiceNumber: "PDF-1",
    clientName: "Acme Traders",
    clientEmail: "billing@acme.test",
    clientPhone: null,
    buyerGstin: null,
    buyerAddress: null,
    dueDate: "2026-08-01",
    amount: 236,
    lineItems: [],
    ...overrides,
  };
}

describe("invoiceService.importPdfInvoices (enrichment)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date("2026-07-03T00:00:00.000Z") });
    vi.mocked(getJobScheduler).mockReturnValue({
      enqueueOverdueCheck: vi.fn(),
      enqueueInvoicePaid: vi.fn(),
    } as never);
    vi.mocked(invoiceRepository.findByInvoiceNumber).mockResolvedValue(null);
    vi.mocked(invoiceRepository.create).mockResolvedValue(fakeInvoice() as never);
    vi.mocked(invoiceRepository.createWithLineItems).mockResolvedValue(fakeInvoice() as never);
  });
  afterEach(() => vi.useRealTimers());

  it("creates a new party when none matches and links partyId on the invoice", async () => {
    vi.mocked(partyRepository.findByGstin).mockResolvedValue(null as never);
    vi.mocked(partyRepository.findByName).mockResolvedValue(null as never);
    vi.mocked(partyRepository.create).mockResolvedValue(fakeParty({ id: "party-new" }) as never);

    await invoiceService.importPdfInvoices(ORG, [
      baseInput({ buyerGstin: "23ABRPV7692P1ZC", buyerAddress: "12 MG Road" }),
    ]);

    expect(partyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Acme Traders",
        gstin: "23ABRPV7692P1ZC",
        email: "billing@acme.test",
        billingAddress: "12 MG Road",
        type: "CUSTOMER",
      }),
    );
    expect(invoiceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ party: { connect: { id: "party-new" } } }),
    );
  });

  it("links an existing party matched by GSTIN and backfills its missing email/phone", async () => {
    vi.mocked(partyRepository.findByGstin).mockResolvedValue(
      fakeParty({ id: "party-9", gstin: "23ABRPV7692P1ZC", email: null, phone: null }) as never,
    );

    await invoiceService.importPdfInvoices(ORG, [
      baseInput({ buyerGstin: "23ABRPV7692P1ZC", clientEmail: "new@acme.test", clientPhone: "999" }),
    ]);

    expect(partyRepository.findByName).not.toHaveBeenCalled();
    expect(partyRepository.create).not.toHaveBeenCalled();
    expect(partyRepository.update).toHaveBeenCalledWith(
      ORG,
      "party-9",
      expect.objectContaining({ email: "new@acme.test", phone: "999" }),
    );
    expect(invoiceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ party: { connect: { id: "party-9" } } }),
    );
  });

  it("backfills a name-matched party's null GSTIN from the invoice", async () => {
    vi.mocked(partyRepository.findByGstin).mockResolvedValue(null as never);
    vi.mocked(partyRepository.findByName).mockResolvedValue(
      fakeParty({ id: "party-2", gstin: null, email: "old@acme.test" }) as never,
    );

    await invoiceService.importPdfInvoices(ORG, [
      baseInput({ buyerGstin: "23ABRPV7692P1ZC", clientEmail: "new@acme.test" }),
    ]);

    // gstin was null → backfilled; email already set → left untouched.
    expect(partyRepository.update).toHaveBeenCalledWith(
      ORG,
      "party-2",
      { gstin: "23ABRPV7692P1ZC" },
    );
  });

  it("creates a stock item from a line description and reuses an existing one found by name", async () => {
    vi.mocked(partyRepository.findByName).mockResolvedValue(fakeParty() as never);
    // First line: no existing item → create. Second line: existing item → reuse.
    vi.mocked(itemRepository.findByName)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: "item-existing" } as never);
    vi.mocked(itemRepository.create).mockResolvedValue({ id: "item-new" } as never);

    await invoiceService.importPdfInvoices(ORG, [
      baseInput({
        lineItems: [
          { description: "Widget", qty: 2, rate: 100, discountPct: 0, taxRatePct: 18, hsnCode: "38245090" },
          { description: "Gadget", qty: 1, rate: 50, discountPct: 0, taxRatePct: 12 },
        ],
      }),
    ]);

    expect(itemRepository.create).toHaveBeenCalledTimes(1);
    expect(itemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Widget", hsnCode: "38245090", gstRate: 18 }),
    );
    // Resolved itemIds are attached to the persisted line items, in order.
    const [, lineItems] = vi.mocked(invoiceRepository.createWithLineItems).mock.calls[0];
    expect(lineItems[0]).toMatchObject({ description: "Widget", itemId: "item-new" });
    expect(lineItems[1]).toMatchObject({ description: "Gadget", itemId: "item-existing" });
  });

  it("tolerates null email / null gstin / no line items without throwing", async () => {
    vi.mocked(partyRepository.findByName).mockResolvedValue(null as never);
    vi.mocked(partyRepository.create).mockResolvedValue(fakeParty({ id: "party-new" }) as never);

    const result = await invoiceService.importPdfInvoices(ORG, [
      baseInput({ clientEmail: null, buyerGstin: null, lineItems: [] }),
    ]);

    expect(result).toHaveLength(1);
    expect(itemRepository.create).not.toHaveBeenCalled();
    expect(invoiceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientEmail: "", party: { connect: { id: "party-new" } } }),
    );
    // Created a party from name alone even with no contact fields.
    expect(partyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Acme Traders", email: null, gstin: null }),
    );
  });

  it("skips an invoice whose invoiceNumber already exists", async () => {
    vi.mocked(invoiceRepository.findByInvoiceNumber).mockResolvedValue(fakeInvoice() as never);

    const result = await invoiceService.importPdfInvoices(ORG, [baseInput()]);

    expect(result).toEqual([]);
    expect(invoiceRepository.create).not.toHaveBeenCalled();
    expect(invoiceRepository.createWithLineItems).not.toHaveBeenCalled();
    expect(partyRepository.create).not.toHaveBeenCalled();
    expect(partyRepository.findByGstin).not.toHaveBeenCalled();
    expect(itemRepository.create).not.toHaveBeenCalled();
  });
});
