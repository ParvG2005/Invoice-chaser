import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoiceService } from "@/server/services/invoice.service";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";
import { NotFoundError } from "@/lib/api/errors";

vi.mock("@/server/repositories/invoice.repository", () => ({
  invoiceRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findByIdWithLineItems: vi.fn(),
    findByInvoiceNumber: vi.fn(),
    findByInvoiceNumbers: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
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
    amount: 1500.5, // decimalToNumber passes numbers through
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
});
