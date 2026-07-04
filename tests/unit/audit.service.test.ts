import { describe, it, expect, vi } from "vitest";
import { withAudit, SYSTEM_ACTOR } from "@/server/services/audit.service";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";

vi.mock("@/server/repositories/audit-log.repository", () => ({
  auditLogRepository: { create: vi.fn() },
}));

const ORG = "org-1";

describe("withAudit", () => {
  it("returns fn's result and writes an audit row with entityId from the result", async () => {
    vi.mocked(auditLogRepository.create).mockResolvedValue({} as never);

    const result = await withAudit(
      { type: "USER", id: "user-1" },
      "party.create",
      { organizationId: ORG, entityType: "Party" },
      async () => ({ id: "party-9", name: "Acme" }),
    );

    expect(result).toEqual({ id: "party-9", name: "Acme" });
    expect(auditLogRepository.create).toHaveBeenCalledWith({
      organizationId: ORG,
      actorType: "USER",
      actorId: "user-1",
      action: "party.create",
      entityType: "Party",
      entityId: "party-9",
      before: undefined,
      after: { id: "party-9", name: "Acme" },
    });
  });

  it("prefers an explicit entityId and serializes before", async () => {
    vi.mocked(auditLogRepository.create).mockResolvedValue({} as never);

    await withAudit(
      SYSTEM_ACTOR,
      "invoice.update",
      { organizationId: ORG, entityType: "Invoice", entityId: "inv-1", before: { status: "PENDING" } },
      async () => ({ deleted: true }),
    );

    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "SYSTEM",
        actorId: null,
        entityId: "inv-1",
        before: { status: "PENDING" },
      }),
    );
  });

  it("does not audit when fn throws, and rethrows", async () => {
    await expect(
      withAudit(SYSTEM_ACTOR, "x", { organizationId: ORG, entityType: "X" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(auditLogRepository.create).not.toHaveBeenCalled();
  });

  it("swallows audit-write failures (mutation already committed)", async () => {
    vi.mocked(auditLogRepository.create).mockRejectedValue(new Error("db down"));
    const result = await withAudit(
      SYSTEM_ACTOR,
      "x",
      { organizationId: ORG, entityType: "X" },
      async () => "ok",
    );
    expect(result).toBe("ok");
  });
});
