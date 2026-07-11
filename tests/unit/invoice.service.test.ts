import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoiceService } from "@/server/services/invoice.service";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";
import { AppError, NotFoundError } from "@/lib/api/errors";

vi.mock("@/server/repositories/invoice.repository", () => ({
  invoiceRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findByIdWithLineItems: vi.fn(),
    findByInvoiceNumber: vi.fn(),
    findByInvoiceNumbers: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    createManyLineItems: vi.fn(),
    createWithLineItems: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    markOverdueBatch: vi.fn(),
    shiftPendingReminders: vi.fn(),
    findCommunicationLogs: vi.fn(),
    findEmailLogs: vi.fn(),
    findPaymentAllocations: vi.fn(),
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

vi.mock("@/server/services/reminder.service", () => ({
  reminderService: {
    scheduleRemindersForOrganization: vi.fn().mockResolvedValue({ scheduled: 0 }),
    scheduleRemindersForInvoices: vi.fn().mockResolvedValue({ scheduled: 0 }),
  },
}));

const ORG = "org-1";

function fakeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    organizationId: ORG,
    clientName: "Acme Traders",
    clientEmail: "billing@acme.test",
    clientPhone: null,
    amount: 1500.5, // decimalToNumber passes numbers through
    currency: "INR",
    dueDate: new Date("2026-07-10T12:00:00.000Z"),
    invoiceNumber: "INV-001",
    notes: null,
    status: "PENDING",
    paidAt: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("invoiceService (characterization)", () => {
  const enqueueOverdueCheck = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-03T00:00:00.000Z") });
    vi.mocked(getJobScheduler).mockReturnValue({
      enqueueOverdueCheck,
      enqueueOverdueChecks: vi.fn(),
      enqueueReminder: vi.fn(),
      enqueueInvoicePaid: vi.fn(),
    } as never);
  });
  afterEach(() => vi.useRealTimers());

  it("create computes OVERDUE for a past due date and enqueues an overdue check", async () => {
    vi.mocked(invoiceRepository.create).mockResolvedValue(
      fakeInvoice({ status: "OVERDUE" }) as never,
    );

    await invoiceService.create(ORG, {
      clientName: "Acme Traders",
      clientEmail: "billing@acme.test",
      amount: 1500.5,
      dueDate: "2026-06-01",
      invoiceNumber: "INV-001",
    });

    expect(invoiceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "OVERDUE", organization: { connect: { id: ORG } } }),
    );
    expect(enqueueOverdueCheck).toHaveBeenCalledWith(ORG);
  });

  it("create does not throw and still returns the invoice when enqueueOverdueCheck fails", async () => {
    // Regression: Task 13's round-trip integration test found that a real
    // Inngest send failure (e.g. missing INNGEST_EVENT_KEY) thrown from
    // enqueueOverdueCheck propagated out of `create` even though the
    // Invoice row had already been durably written — the caller (including
    // tally-import's importSalesVoucher) treated this as "nothing created"
    // and lost the entityId, orphaning the row from undo.
    vi.mocked(invoiceRepository.create).mockResolvedValue(fakeInvoice() as never);
    enqueueOverdueCheck.mockRejectedValueOnce(new Error("Failed to send event"));

    const dto = await invoiceService.create(ORG, {
      clientName: "Acme Traders",
      clientEmail: "billing@acme.test",
      amount: 1500.5,
      dueDate: "2026-08-01",
      invoiceNumber: "INV-002",
    });

    expect(dto).toMatchObject({ id: "inv-1" });
    expect(enqueueOverdueCheck).toHaveBeenCalledWith(ORG);
  });

  it("get throws NotFoundError when the repo returns null", async () => {
    vi.mocked(invoiceRepository.findById).mockResolvedValue(null);
    await expect(invoiceService.get(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("get maps the invoice to a DTO with ISO date strings", async () => {
    vi.mocked(invoiceRepository.findById).mockResolvedValue(fakeInvoice() as never);
    const dto = await invoiceService.get(ORG, "inv-1");
    expect(dto).toMatchObject({
      id: "inv-1",
      amount: 1500.5,
      dueDate: "2026-07-10T12:00:00.000Z",
      status: "PENDING",
    });
  });

  it("get nulls out a soft-deleted party instead of surfacing it", async () => {
    // Regression: findById's `party: true` include has no soft-delete filter
    // (Prisma can't filter a to-one include without relation-filter preview
    // features), so a soft-deleted Party must be stripped in the mapper —
    // otherwise its name/link would leak onto the invoice detail/print pages.
    vi.mocked(invoiceRepository.findById).mockResolvedValue(
      fakeInvoice({
        party: { id: "party-1", name: "Deleted Co", type: "CUSTOMER", deletedAt: new Date() },
      }) as never,
    );

    const dto = await invoiceService.get(ORG, "inv-1");

    expect(dto.party).toBeNull();
  });

  it("update to PAID sets paidAt", async () => {
    vi.mocked(invoiceRepository.findById).mockResolvedValue(fakeInvoice() as never);
    vi.mocked(invoiceRepository.update).mockResolvedValue({ count: 1 } as never);

    await invoiceService.update(ORG, "inv-1", { status: "PAID" });

    expect(invoiceRepository.update).toHaveBeenCalledWith(
      ORG,
      "inv-1",
      expect.objectContaining({ status: "PAID", paidAt: expect.any(Date) }),
    );
  });

  it("remove throws NotFoundError when nothing was soft-deleted", async () => {
    vi.mocked(invoiceRepository.softDelete).mockResolvedValue({ count: 0 } as never);
    await expect(invoiceService.remove(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  describe("duplicate", () => {
    it("copies the invoice and its line items as a new PENDING invoice with amountPaid zeroed", async () => {
      vi.mocked(invoiceRepository.findByIdWithLineItems).mockResolvedValue({
        ...fakeInvoice({ status: "PAID", amountPaid: 500 }),
        partyId: null,
        type: "RECEIVABLE",
        subtotal: null,
        taxAmount: null,
        totalAmount: null,
        lineItems: [
          { id: "li-1", itemId: null, description: "Widget", quantity: 2, rate: 750.25, amount: 1500.5 },
        ],
      } as never);
      vi.mocked(invoiceRepository.findByInvoiceNumber).mockResolvedValue(null);
      vi.mocked(invoiceRepository.createWithLineItems).mockResolvedValue(
        fakeInvoice({ id: "inv-2", invoiceNumber: "INV-001-COPY", status: "PENDING", amountPaid: 0 }) as never,
      );

      const dto = await invoiceService.duplicate(ORG, "inv-1");

      expect(invoiceRepository.createWithLineItems).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceNumber: "INV-001-COPY", status: "PENDING" }),
        [expect.objectContaining({ description: "Widget", quantity: 2, rate: 750.25, amount: 1500.5 })],
      );
      expect(dto).toMatchObject({ id: "inv-2", invoiceNumber: "INV-001-COPY", status: "PENDING" });
    });

    it("appends an incrementing suffix when the -COPY number already exists", async () => {
      vi.mocked(invoiceRepository.findByIdWithLineItems).mockResolvedValue({
        ...fakeInvoice(),
        partyId: null,
        type: "RECEIVABLE",
        subtotal: null,
        taxAmount: null,
        totalAmount: null,
        lineItems: [],
      } as never);
      vi.mocked(invoiceRepository.findByInvoiceNumber).mockImplementation(((
        _org: string,
        num: string,
      ) =>
        Promise.resolve(
          num === "INV-001-COPY" ? (fakeInvoice({ invoiceNumber: "INV-001-COPY" }) as never) : null,
        )) as never);
      vi.mocked(invoiceRepository.create).mockResolvedValue(
        fakeInvoice({ id: "inv-2", invoiceNumber: "INV-001-COPY-2" }) as never,
      );

      await invoiceService.duplicate(ORG, "inv-1");

      expect(invoiceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceNumber: "INV-001-COPY-2" }),
      );
    });

    it("throws NotFoundError when the source invoice does not exist", async () => {
      vi.mocked(invoiceRepository.findByIdWithLineItems).mockResolvedValue(null);
      await expect(invoiceService.duplicate(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("writeOff", () => {
    it("sets status to WRITTEN_OFF", async () => {
      vi.mocked(invoiceRepository.findById)
        .mockResolvedValueOnce(fakeInvoice() as never)
        .mockResolvedValueOnce(fakeInvoice({ status: "WRITTEN_OFF" }) as never);
      vi.mocked(invoiceRepository.update).mockResolvedValue({ count: 1 } as never);

      const dto = await invoiceService.writeOff(ORG, "inv-1", "customer went bankrupt");

      expect(invoiceRepository.update).toHaveBeenCalledWith(
        ORG,
        "inv-1",
        expect.objectContaining({ status: "WRITTEN_OFF" }),
      );
      expect(dto.status).toBe("WRITTEN_OFF");
    });

    it("throws NotFoundError for a missing invoice", async () => {
      vi.mocked(invoiceRepository.findById).mockResolvedValue(null);
      await expect(invoiceService.writeOff(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejects writing off an already-paid invoice", async () => {
      vi.mocked(invoiceRepository.findById).mockResolvedValue(
        fakeInvoice({ status: "PAID" }) as never,
      );
      await expect(invoiceService.writeOff(ORG, "inv-1")).rejects.toBeInstanceOf(AppError);
      expect(invoiceRepository.update).not.toHaveBeenCalled();
    });
  });

  describe("snooze", () => {
    it("shifts only unsent reminders forward by the given number of days", async () => {
      vi.mocked(invoiceRepository.findById).mockResolvedValue(fakeInvoice() as never);
      vi.mocked(invoiceRepository.shiftPendingReminders).mockResolvedValue(2 as never);

      await invoiceService.snooze(ORG, "inv-1", 5);

      expect(invoiceRepository.shiftPendingReminders).toHaveBeenCalledWith(ORG, "inv-1", 5);
    });

    it("throws NotFoundError for a missing invoice", async () => {
      vi.mocked(invoiceRepository.findById).mockResolvedValue(null);
      await expect(invoiceService.snooze(ORG, "missing", 5)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("timeline", () => {
    it("merge-sorts communication logs and payment allocations, newest first", async () => {
      vi.mocked(invoiceRepository.findById).mockResolvedValue(fakeInvoice() as never);
      vi.mocked(invoiceRepository.findCommunicationLogs).mockResolvedValue([
        {
          id: "cl-1",
          channel: "EMAIL",
          toAddress: "billing@acme.test",
          status: "SENT",
          sentAt: new Date("2026-06-05T00:00:00.000Z"),
          createdAt: new Date("2026-06-05T00:00:00.000Z"),
        },
      ] as never);
      vi.mocked(invoiceRepository.findPaymentAllocations).mockResolvedValue([
        {
          id: "pa-1",
          amount: 500,
          createdAt: new Date("2026-06-10T00:00:00.000Z"),
          payment: { mode: "BANK_TRANSFER" },
        },
      ] as never);

      const entries = await invoiceService.timeline(ORG, "inv-1");

      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ id: "pa-1", kind: "PAYMENT", amount: "500" });
      expect(entries[1]).toMatchObject({ id: "cl-1", kind: "COMMUNICATION", channel: "EMAIL" });
      expect(invoiceRepository.findEmailLogs).not.toHaveBeenCalled();
    });

    it("falls back to legacy EmailLog rows when there are no CommunicationLog rows", async () => {
      vi.mocked(invoiceRepository.findById).mockResolvedValue(fakeInvoice() as never);
      vi.mocked(invoiceRepository.findCommunicationLogs).mockResolvedValue([] as never);
      vi.mocked(invoiceRepository.findEmailLogs).mockResolvedValue([
        {
          id: "el-1",
          toEmail: "billing@acme.test",
          status: "SENT",
          sentAt: new Date("2026-06-01T00:00:00.000Z"),
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      ] as never);
      vi.mocked(invoiceRepository.findPaymentAllocations).mockResolvedValue([] as never);

      const entries = await invoiceService.timeline(ORG, "inv-1");

      expect(entries).toEqual([
        expect.objectContaining({ id: "el-1", kind: "COMMUNICATION", channel: "EMAIL" }),
      ]);
    });

    it("throws NotFoundError for a missing invoice", async () => {
      vi.mocked(invoiceRepository.findById).mockResolvedValue(null);
      await expect(invoiceService.timeline(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("list (Task 12 additive filters)", () => {
    beforeEach(() => {
      vi.mocked(invoiceRepository.findMany).mockResolvedValue([fakeInvoice()] as never);
    });

    it("passes partyId through to the repository", async () => {
      await invoiceService.list(ORG, { partyId: "party-1" });
      expect(invoiceRepository.findMany).toHaveBeenCalledWith(
        ORG,
        expect.objectContaining({ partyId: "party-1" }),
      );
    });

    it("passes dueBefore through to the repository", async () => {
      await invoiceService.list(ORG, { dueBefore: "2026-08-01" });
      expect(invoiceRepository.findMany).toHaveBeenCalledWith(
        ORG,
        expect.objectContaining({ dueBefore: "2026-08-01" }),
      );
    });

    it("passes dueAfter through to the repository", async () => {
      await invoiceService.list(ORG, { dueAfter: "2026-06-01" });
      expect(invoiceRepository.findMany).toHaveBeenCalledWith(
        ORG,
        expect.objectContaining({ dueAfter: "2026-06-01" }),
      );
    });

    it("passes search through to the repository", async () => {
      await invoiceService.list(ORG, { search: "Acme" });
      expect(invoiceRepository.findMany).toHaveBeenCalledWith(
        ORG,
        expect.objectContaining({ search: "Acme" }),
      );
    });

    it("still supports calling with no filters (existing callers unaffected)", async () => {
      await invoiceService.list(ORG);
      expect(invoiceRepository.findMany).toHaveBeenCalledWith(ORG, {});
    });
  });

  describe("bulkAction", () => {
    it("soft-deletes every id for the delete action", async () => {
      vi.mocked(invoiceRepository.softDelete).mockResolvedValue({ count: 1 } as never);
      const result = await invoiceService.bulkAction(ORG, "delete", ["inv-1", "inv-2"]);
      expect(invoiceRepository.softDelete).toHaveBeenCalledWith(ORG, "inv-1");
      expect(invoiceRepository.softDelete).toHaveBeenCalledWith(ORG, "inv-2");
      expect(result).toEqual({ action: "delete", count: 2 });
    });

    it("marks every id PAID for the markPaid action", async () => {
      vi.mocked(invoiceRepository.update).mockResolvedValue({ count: 1 } as never);
      const result = await invoiceService.bulkAction(ORG, "markPaid", ["inv-1"]);
      expect(invoiceRepository.update).toHaveBeenCalledWith(
        ORG,
        "inv-1",
        expect.objectContaining({ status: "PAID" }),
      );
      expect(result).toEqual({ action: "markPaid", count: 1 });
    });

    it("scopes the reminder scan to the selected invoice ids for the sendReminders action", async () => {
      const { reminderService } = await import("@/server/services/reminder.service");
      const result = await invoiceService.bulkAction(ORG, "sendReminders", ["inv-1", "inv-2"]);
      expect(reminderService.scheduleRemindersForInvoices).toHaveBeenCalledWith(ORG, [
        "inv-1",
        "inv-2",
      ]);
      expect(reminderService.scheduleRemindersForOrganization).not.toHaveBeenCalled();
      expect(result).toEqual({ action: "sendReminders", count: 2 });
    });
  });

  describe("bulkCreate", () => {
    beforeEach(() => {
      vi.mocked(invoiceRepository.createMany).mockResolvedValue({ count: 1 } as never);
      vi.mocked(invoiceRepository.createManyLineItems).mockResolvedValue({ count: 0 } as never);
    });

    it("persists computed line items and subtotal/tax/total for inputs that carry line items", async () => {
      // No pre-existing row, then the re-fetch returns the created invoice.
      vi.mocked(invoiceRepository.findByInvoiceNumbers)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([fakeInvoice({ invoiceNumber: "PDF-1" })] as never);

      await invoiceService.bulkCreate(ORG, [
        {
          clientName: "Acme",
          clientEmail: "a@acme.test",
          amount: 236,
          dueDate: "2026-08-01",
          invoiceNumber: "PDF-1",
          lineItems: [{ description: "Widget", qty: 2, rate: 100, discountPct: 0, taxRatePct: 18 }],
        },
      ] as never);

      // Scalar totals land on the invoice row.
      expect(invoiceRepository.createMany).toHaveBeenCalledWith([
        expect.objectContaining({
          invoiceNumber: "PDF-1",
          subtotal: 200,
          taxAmount: 36,
          totalAmount: 236,
        }),
      ]);
      // Line items are attached to the newly-created invoice, in persisted shape.
      expect(invoiceRepository.createManyLineItems).toHaveBeenCalledWith([
        {
          organizationId: ORG,
          invoiceId: "inv-1",
          lineItems: [
            expect.objectContaining({
              description: "Widget",
              quantity: 2,
              rate: 100,
              discount: 0,
              taxRate: 18,
              amount: 236,
            }),
          ],
        },
      ]);
    });

    it("does not attach line items to a pre-existing (skipped-duplicate) invoice number", async () => {
      const existing = fakeInvoice({ invoiceNumber: "PDF-1" });
      // The number already exists before insert, so createMany skips it and its
      // line items must NOT be duplicated.
      vi.mocked(invoiceRepository.findByInvoiceNumbers)
        .mockResolvedValueOnce([existing] as never)
        .mockResolvedValueOnce([existing] as never);

      await invoiceService.bulkCreate(ORG, [
        {
          clientName: "Acme",
          clientEmail: "a@acme.test",
          amount: 236,
          dueDate: "2026-08-01",
          invoiceNumber: "PDF-1",
          lineItems: [{ description: "Widget", qty: 2, rate: 100, discountPct: 0, taxRatePct: 18 }],
        },
      ] as never);

      expect(invoiceRepository.createManyLineItems).not.toHaveBeenCalled();
    });

    it("keeps plain CSV inputs (no line items) as a flat amount with no totals or line items", async () => {
      vi.mocked(invoiceRepository.findByInvoiceNumbers)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([fakeInvoice({ invoiceNumber: "CSV-1" })] as never);

      await invoiceService.bulkCreate(ORG, [
        {
          clientName: "Acme",
          clientEmail: "a@acme.test",
          amount: 500,
          dueDate: "2026-08-01",
          invoiceNumber: "CSV-1",
        },
      ] as never);

      const [rows] = vi.mocked(invoiceRepository.createMany).mock.calls[0];
      expect(rows[0]).not.toHaveProperty("subtotal");
      expect(rows[0]).not.toHaveProperty("taxAmount");
      expect(rows[0]).not.toHaveProperty("totalAmount");
      expect(rows[0]).toMatchObject({ invoiceNumber: "CSV-1", amount: 500 });
      expect(invoiceRepository.createManyLineItems).not.toHaveBeenCalled();
    });
  });
});
