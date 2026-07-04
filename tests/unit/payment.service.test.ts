import { describe, it, expect, vi } from "vitest";
import { paymentService } from "@/server/services/payment.service";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { partyRepository } from "@/server/repositories/party.repository";
import { billRepository } from "@/server/repositories/bill.repository";
import { NotFoundError, ValidationError } from "@/lib/api/errors";

vi.mock("@/server/repositories/payment.repository", () => ({
  paymentRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findOpenInvoicesForParty: vi.fn(),
    createWithAllocations: vi.fn(),
    addAllocations: vi.fn(),
  },
}));

vi.mock("@/server/repositories/party.repository", () => ({
  partyRepository: { findById: vi.fn() },
}));

vi.mock("@/server/repositories/bill.repository", () => ({
  billRepository: { findOpenForParty: vi.fn() },
}));

vi.mock("@/server/services/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/audit.service")>();
  return { ...actual, withAudit: vi.fn((_a, _b, _c, fn) => fn()) };
});

const ORG = "org-1";

function openInvoice(id: string, due: string, amount: number, amountPaid = 0) {
  return {
    id,
    organizationId: ORG,
    dueDate: new Date(due),
    amount,
    totalAmount: null,
    amountPaid,
    status: "PENDING",
  };
}

function fakePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    organizationId: ORG,
    partyId: "party-1",
    direction: "IN",
    amount: 1000,
    unallocated: 0,
    mode: "UPI",
    paymentDate: new Date("2026-07-03T00:00:00.000Z"),
    reference: null,
    notes: null,
    currency: "INR",
    tallyGuid: null,
    createdAt: new Date("2026-07-03T00:00:00.000Z"),
    updatedAt: new Date("2026-07-03T00:00:00.000Z"),
    deletedAt: null,
    allocations: [
      {
        id: "alloc-1",
        organizationId: ORG,
        paymentId: "pay-1",
        invoiceId: "inv-old",
        billId: null,
        amount: 800,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
        deletedAt: null,
      },
    ],
    ...overrides,
  };
}

describe("paymentService.create", () => {
  it("rejects an unknown party", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue(null);
    await expect(
      paymentService.create(ORG, { partyId: "x", direction: "IN", amount: 100, mode: "CASH" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("auto-allocates IN payments to the party's oldest open invoices", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue({ id: "party-1" } as never);
    vi.mocked(paymentRepository.findOpenInvoicesForParty).mockResolvedValue([
      openInvoice("inv-new", "2026-08-01", 500),
      openInvoice("inv-old", "2026-06-01", 800),
    ] as never);
    vi.mocked(paymentRepository.createWithAllocations).mockResolvedValue(fakePayment() as never);

    await paymentService.create(ORG, {
      partyId: "party-1",
      direction: "IN",
      amount: 1000,
      mode: "UPI",
    });

    expect(paymentRepository.createWithAllocations).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, amount: 1000, unallocated: 0 }),
      [
        { documentId: "inv-old", amount: 800 },
        { documentId: "inv-new", amount: 200 },
      ],
    );
  });

  it("uses bill outstanding for OUT payments", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue({ id: "party-1" } as never);
    vi.mocked(billRepository.findOpenForParty).mockResolvedValue([
      { id: "bill-1", dueDate: new Date("2026-06-15"), amount: 400, amountPaid: 100 },
    ] as never);
    vi.mocked(paymentRepository.createWithAllocations).mockResolvedValue(
      fakePayment({ direction: "OUT", amount: 500, unallocated: 200 }) as never,
    );

    await paymentService.create(ORG, {
      partyId: "party-1",
      direction: "OUT",
      amount: 500,
      mode: "BANK_TRANSFER",
    });

    expect(paymentRepository.createWithAllocations).toHaveBeenCalledWith(
      expect.objectContaining({ unallocated: 200 }),
      [{ documentId: "bill-1", amount: 300 }],
    );
  });

  it("validates explicit allocations against document outstanding", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue({ id: "party-1" } as never);
    vi.mocked(paymentRepository.findOpenInvoicesForParty).mockResolvedValue([
      openInvoice("inv-1", "2026-06-01", 300),
    ] as never);

    await expect(
      paymentService.create(ORG, {
        partyId: "party-1",
        direction: "IN",
        amount: 500,
        mode: "CASH",
        allocations: [{ documentId: "inv-1", amount: 400 }], // > 300 outstanding
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects explicit allocations that exceed the payment amount", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue({ id: "party-1" } as never);
    vi.mocked(paymentRepository.findOpenInvoicesForParty).mockResolvedValue([
      openInvoice("inv-1", "2026-06-01", 900),
    ] as never);

    await expect(
      paymentService.create(ORG, {
        partyId: "party-1",
        direction: "IN",
        amount: 500,
        mode: "CASH",
        allocations: [{ documentId: "inv-1", amount: 600 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("paymentService.allocatePayment", () => {
  it("allocates the remaining unallocated balance FIFO", async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue(
      fakePayment({ unallocated: 700, allocations: [] }) as never,
    );
    vi.mocked(paymentRepository.findOpenInvoicesForParty).mockResolvedValue([
      openInvoice("inv-2", "2026-07-01", 400),
    ] as never);
    vi.mocked(paymentRepository.addAllocations).mockResolvedValue(
      fakePayment({ unallocated: 300 }) as never,
    );

    await paymentService.allocatePayment(ORG, "pay-1");

    expect(paymentRepository.addAllocations).toHaveBeenCalledWith(
      ORG,
      "pay-1",
      "IN",
      [{ documentId: "inv-2", amount: 400 }],
      300,
    );
  });

  it("throws when the payment has no unallocated balance", async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue(
      fakePayment({ unallocated: 0 }) as never,
    );
    await expect(paymentService.allocatePayment(ORG, "pay-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
