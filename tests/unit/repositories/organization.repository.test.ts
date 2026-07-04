import { describe, expect, it, vi } from "vitest";

const { findUniqueOrThrow, update } = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: { findUniqueOrThrow, update },
  },
}));

import { organizationRepository } from "@/server/repositories/organization.repository";

describe("organizationRepository.softDelete", () => {
  it("mutates the slug (in addition to setting deletedAt) so it's freed for reuse", async () => {
    // Regression: `Organization.slug` is `@unique` at the DB level with no
    // `deletedAt` scoping, so a soft-deleted org's slug otherwise stays
    // reserved forever. If a user's only org gets soft-deleted,
    // resolveUserOrganization's re-provisioning generates a *deterministic*
    // slug (from email/userId) that would collide with the orphaned row and
    // throw P2002 on every future request — permanently bricking the user's
    // dashboard. Freeing the slug on delete closes that hole.
    findUniqueOrThrow.mockResolvedValue({ id: "org-1", slug: "acme-abc123" });
    update.mockResolvedValue({ id: "org-1", slug: "acme-abc123-deleted-1" });

    await organizationRepository.softDelete("org-1");

    expect(update).toHaveBeenCalledTimes(1);
    const call = update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "org-1" });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
    expect(call.data.slug).toMatch(/^acme-abc123-deleted-\d+$/);
    expect(call.data.slug).not.toBe("acme-abc123");
  });
});
