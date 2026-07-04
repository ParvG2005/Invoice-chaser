import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { billService } from "@/server/services/bill.service";
import { billRepository } from "@/server/repositories/bill.repository";
import { partyRepository } from "@/server/repositories/party.repository";
import { NotFoundError } from "@/lib/api/errors";

vi.mock("@/server/repositories/bill.repository", () => ({
  billRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findOpenForParty: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

vi.mock("@/server/repositories/party.repository", () => ({
  partyRepository: { findById: vi.fn() },
}));

vi.mock("@/server/services/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/audit.service")>();
  return { ...actual, withAudit: vi.fn((_a, _b, _c, fn) => fn()) };
});

const ORG = "org-1";

function fakeBill(overrides: Record<string, unknown> = {}) {
  return {
    id: "bill-1",
    organizationId: ORG,
    partyId: "party-1",
    billNumber: "PB-001",
    billDate: null,
    dueDate: new Date("2026-08-01T12:00:00.000Z"),
    amount: 5000,
    amountPaid: 0,
    currency: "INR",
    status: "PENDING",
    notes: null,
    tallyGuid: null,
    paidAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("billService", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-07-03T00:00:00.000Z") }));
  afterEach(() => vi.useRealTimers());

  it("create rejects an unknown party", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue(null);
    await expect(
      billService.create(ORG, {
        partyId: "missing",
        billNumber: "PB-001",
        dueDate: "2026-08-01",
        amount: 5000,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("create computes status from dueDate (future → PENDING) and persists", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue({ id: "party-1" } as never);
    vi.mocked(billRepository.create).mockResolvedValue(fakeBill() as never);

    const dto = await billService.create(ORG, {
      partyId: "party-1",
      billNumber: "PB-001",
      dueDate: "2026-08-01",
      amount: 5000,
    });

    expect(billRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING", billNumber: "PB-001" }),
    );
    expect(dto).toMatchObject({ id: "bill-1", amount: 5000, outstanding: 5000, status: "PENDING" });
  });

  it("get throws NotFoundError when missing", async () => {
    vi.mocked(billRepository.findById).mockResolvedValue(null);
    await expect(billService.get(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("update to PAID sets paidAt", async () => {
    vi.mocked(billRepository.findById).mockResolvedValue(fakeBill() as never);
    vi.mocked(billRepository.update).mockResolvedValue({ count: 1 } as never);

    await billService.update(ORG, "bill-1", { status: "PAID" });

    expect(billRepository.update).toHaveBeenCalledWith(
      ORG,
      "bill-1",
      expect.objectContaining({ status: "PAID", paidAt: expect.any(Date) }),
    );
  });

  it("update on an already-PAID bill without a status change does not overwrite paidAt", async () => {
    const originalPaidAt = new Date("2026-06-15T00:00:00.000Z");
    vi.mocked(billRepository.findById).mockResolvedValue(
      fakeBill({ status: "PAID", paidAt: originalPaidAt }) as never,
    );
    vi.mocked(billRepository.update).mockResolvedValue({ count: 1 } as never);

    await billService.update(ORG, "bill-1", { notes: "updated notes" });

    expect(billRepository.update).toHaveBeenCalledWith(
      ORG,
      "bill-1",
      expect.objectContaining({ status: "PAID", notes: "updated notes" }),
    );
    const updateData = vi.mocked(billRepository.update).mock.calls[0][2];
    expect(updateData).not.toHaveProperty("paidAt");
  });
});
