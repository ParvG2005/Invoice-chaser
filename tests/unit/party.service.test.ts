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
});
