import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoiceService } from "@/server/services/invoice.service";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";
import { NotFoundError } from "@/lib/api/errors";

vi.mock("@/server/repositories/invoice.repository", () => ({
  invoiceRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findByInvoiceNumbers: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    markOverdueBatch: vi.fn(),
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
});
