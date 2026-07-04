import { describe, it, expect, vi } from "vitest";
import { partyService } from "@/server/services/party.service";
import { partyRepository } from "@/server/repositories/party.repository";
import { withAudit } from "@/server/services/audit.service";
import { NotFoundError, ValidationError } from "@/lib/api/errors";

vi.mock("@/server/repositories/party.repository", () => ({
  partyRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    findByIdWithLedgerRelations: vi.fn(),
    findManagedParties: vi.fn(),
  },
}));

vi.mock("@/server/services/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/audit.service")>();
  return {
    ...actual,
    withAudit: vi.fn((_actor, _action, _entity, fn) => fn()),
  };
});

const ORG = "org-1";

function fakeParty(overrides: Record<string, unknown> = {}) {
  return {
    id: "party-1",
    organizationId: ORG,
    type: "CUSTOMER",
    name: "Acme Traders",
    email: "a@acme.test",
    phone: null,
    whatsapp: null,
    gstin: null,
    billingAddress: null,
    creditLimit: null,
    creditDays: null,
    openingBalance: null,
    notes: null,
    tallyGuid: null,
    agentId: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("partyService", () => {
  it("create rejects a duplicate name in the same org", async () => {
    vi.mocked(partyRepository.findByName).mockResolvedValue(fakeParty() as never);
    await expect(
      partyService.create(ORG, { type: "CUSTOMER", name: "Acme Traders" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(partyRepository.create).not.toHaveBeenCalled();
  });

  it("create validates that agentId points to an AGENT/BOTH party in the org", async () => {
    vi.mocked(partyRepository.findByName).mockResolvedValue(null);
    vi.mocked(partyRepository.findById).mockResolvedValue(
      fakeParty({ id: "agent-1", type: "CUSTOMER" }) as never,
    );
    await expect(
      partyService.create(ORG, { type: "CUSTOMER", name: "New Co", agentId: "agent-1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("create persists and wraps in withAudit with action party.create", async () => {
    vi.mocked(partyRepository.findByName).mockResolvedValue(null);
    vi.mocked(partyRepository.create).mockResolvedValue(fakeParty() as never);

    const dto = await partyService.create(ORG, { type: "CUSTOMER", name: "Acme Traders" });

    expect(dto).toMatchObject({ id: "party-1", name: "Acme Traders", type: "CUSTOMER" });
    expect(withAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SYSTEM" }),
      "party.create",
      expect.objectContaining({ organizationId: ORG, entityType: "Party" }),
      expect.any(Function),
    );
  });

  it("get throws NotFoundError for a missing party", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue(null);
    await expect(partyService.get(ORG, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("remove throws NotFoundError when nothing was deleted", async () => {
    vi.mocked(partyRepository.findById).mockResolvedValue(fakeParty() as never);
    vi.mocked(partyRepository.softDelete).mockResolvedValue({ count: 0 } as never);
    await expect(partyService.remove(ORG, "party-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  describe("ledger", () => {
    it("nets a CUSTOMER refund (OUT payment) as a debit, opposite sign from a normal IN payment", async () => {
      vi.mocked(partyRepository.findByIdWithLedgerRelations).mockResolvedValue({
        ...fakeParty({ type: "CUSTOMER" }),
        openingBalance: 0,
        invoices: [
          {
            invoiceNumber: "INV-1",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            totalAmount: 1000,
            amount: 1000,
            currency: "INR",
          },
        ],
        bills: [],
        payments: [
          {
            id: "pay-normal-00000000",
            reference: "PMT-NORMAL",
            paymentDate: new Date("2026-01-02T00:00:00.000Z"),
            amount: 400,
            direction: "IN",
            currency: "INR",
          },
          {
            id: "pay-refund-00000000",
            reference: "PMT-REFUND",
            paymentDate: new Date("2026-01-03T00:00:00.000Z"),
            amount: 100,
            direction: "OUT",
            currency: "INR",
          },
        ],
      } as never);

      const ledger = await partyService.ledger(ORG, "party-1");

      // Invoice: +1000 -> balance 1000
      expect(ledger[0]).toMatchObject({ docType: "INVOICE", debit: "1000.00", credit: null, balance: "1000.00" });
      // Normal IN payment is a credit (reduces balance): 1000 - 400 = 600
      expect(ledger[1]).toMatchObject({
        docType: "PAYMENT",
        docNumber: "PMT-NORMAL",
        debit: null,
        credit: "400.00",
        balance: "600.00",
      });
      // Refund (OUT) inverts to a debit (increases balance again): 600 + 100 = 700
      expect(ledger[2]).toMatchObject({
        docType: "PAYMENT",
        docNumber: "PMT-REFUND",
        debit: "100.00",
        credit: null,
        balance: "700.00",
      });
    });

    it("nets a BOTH-type party's invoice (receivable) and bill (payable) into one real net balance", async () => {
      vi.mocked(partyRepository.findByIdWithLedgerRelations).mockResolvedValue({
        ...fakeParty({ type: "BOTH" }),
        openingBalance: 0,
        invoices: [
          {
            invoiceNumber: "INV-1",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            totalAmount: 1000,
            amount: 1000,
            currency: "INR",
          },
        ],
        bills: [
          {
            billNumber: "BILL-1",
            billDate: new Date("2026-01-02T00:00:00.000Z"),
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
            amount: 300,
            currency: "INR",
          },
        ],
        payments: [],
      } as never);

      const ledger = await partyService.ledger(ORG, "party-1");

      // Invoice (receivable side): balance += 1000 -> 1000
      expect(ledger[0]).toMatchObject({ docType: "INVOICE", debit: "1000.00", balance: "1000.00" });
      // Bill (payable side): net balance -= 300 -> 700 (a real net owed-to-us figure)
      expect(ledger[1]).toMatchObject({ docType: "BILL", debit: "300.00", balance: "700.00" });
    });

    it("carries each entry's currency from its own source document, not a hardcoded default", async () => {
      vi.mocked(partyRepository.findByIdWithLedgerRelations).mockResolvedValue({
        ...fakeParty({ type: "CUSTOMER" }),
        openingBalance: 0,
        invoices: [
          {
            invoiceNumber: "INV-USD",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            totalAmount: 500,
            amount: 500,
            currency: "USD",
          },
          {
            invoiceNumber: "INV-INR",
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
            totalAmount: 500,
            amount: 500,
            currency: "INR",
          },
        ],
        bills: [],
        payments: [],
      } as never);

      const ledger = await partyService.ledger(ORG, "party-1");

      expect(ledger[0]).toMatchObject({ docNumber: "INV-USD", currency: "USD" });
      expect(ledger[1]).toMatchObject({ docNumber: "INV-INR", currency: "INR" });
    });
  });
});
