import { describe, it, expect, vi } from "vitest";
import { organizationService } from "@/server/services/organization.service";
import { organizationRepository } from "@/server/repositories/organization.repository";

vi.mock("@/server/repositories/organization.repository", () => ({
  organizationRepository: {
    findSettings: vi.fn(),
    updateSettings: vi.fn(),
    softDelete: vi.fn(),
  },
}));

const ORG = "org-1";

function fakeOrg(overrides: Record<string, unknown> = {}) {
  return {
    name: "Acme",
    gstin: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    logoUrl: null,
    senderName: null,
    senderReplyTo: null,
    emailSignature: null,
    theme: "system",
    ...overrides,
  };
}

describe("organizationService.getSettings", () => {
  it("is org-scoped: queries only the given organization id", async () => {
    vi.mocked(organizationRepository.findSettings).mockResolvedValue(fakeOrg() as never);

    await organizationService.getSettings(ORG);

    expect(organizationRepository.findSettings).toHaveBeenCalledWith(ORG);
  });

  it("throws NotFoundError when the org doesn't exist (or belongs to another org / is soft-deleted)", async () => {
    vi.mocked(organizationRepository.findSettings).mockResolvedValue(null);

    await expect(organizationService.getSettings(ORG)).rejects.toThrow("Organization not found");
  });

  it("maps the theme default and passes through profile fields", async () => {
    vi.mocked(organizationRepository.findSettings).mockResolvedValue(
      fakeOrg({ name: "Acme Co", gstin: "GST123", theme: null }) as never,
    );

    const result = await organizationService.getSettings(ORG);

    expect(result.name).toBe("Acme Co");
    expect(result.gstin).toBe("GST123");
    expect(result.theme).toBe("system");
  });
});

describe("organizationService.updateSettings", () => {
  it("is org-scoped: passes organizationId through to the repository update", async () => {
    vi.mocked(organizationRepository.updateSettings).mockResolvedValue(fakeOrg() as never);

    const input = { name: "New Name" } as never;
    await organizationService.updateSettings(ORG, input);

    expect(organizationRepository.updateSettings).toHaveBeenCalledWith(ORG, input);
  });
});

describe("organizationService.deleteOrganization", () => {
  it("soft-deletes (calls repository.softDelete), never a hard delete", async () => {
    vi.mocked(organizationRepository.softDelete).mockResolvedValue(fakeOrg() as never);

    const result = await organizationService.deleteOrganization(ORG);

    expect(organizationRepository.softDelete).toHaveBeenCalledWith(ORG);
    expect(organizationRepository.softDelete).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deleted: true });
  });
});
