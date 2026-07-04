import { describe, expect, it, beforeAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { organizationService } from "@/server/services/organization.service";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { resetDatabase } from "./helpers/db";

/**
 * Regression for: soft-deleting a user's only org used to permanently brick
 * their account. `resolveUserOrganization` generates a *deterministic* slug
 * (`slugify(email-prefix)-userId.slice(0,6)`) when re-provisioning, and
 * `Organization.slug` is `@unique` at the DB level with no `deletedAt`
 * scoping — so the re-provision's `createWithOwner` hit a real P2002 against
 * the orphaned soft-deleted row and threw on every subsequent request.
 *
 * This exercises the *full* path against a real database: create a user +
 * org, soft-delete the org (the actual danger-zone delete path, which now
 * frees the slug), then call `ensureUserOrganization` again exactly like a
 * fresh `/dashboard` load would, and assert it succeeds without throwing —
 * a shallow mock of `findFirstForUser` returning null would never have hit
 * the real slug collision this test is guarding against.
 */
describe("org self-delete + re-provisioning (real DB)", () => {
  beforeAll(resetDatabase);

  it("re-provisions a fresh org after the user's only org is soft-deleted, with no slug collision", async () => {
    const clerkId = `test-clerk-self-delete-${Date.now()}`;
    const email = "self-delete-user@example.com";

    const user = await prisma.user.create({ data: { clerkId, email } });

    // First resolution: provisions the user's initial org (deterministic slug).
    const first = await organizationService.ensureUserOrganization(clerkId);
    expect(first.organizationId).toBeTruthy();

    // Danger-zone delete: soft-delete via the real repository path (mutates
    // the slug as part of the same operation).
    await organizationRepository.softDelete(first.organizationId);

    const deletedOrg = await prisma.organization.findUniqueOrThrow({
      where: { id: first.organizationId },
    });
    expect(deletedOrg.deletedAt).not.toBeNull();

    // Next request for this user (e.g. the next /dashboard load) must
    // re-provision successfully instead of throwing P2002 on the freed slug.
    const second = await organizationService.ensureUserOrganization(clerkId);
    expect(second.organizationId).toBeTruthy();
    expect(second.organizationId).not.toBe(first.organizationId);

    const newOrg = await prisma.organization.findUniqueOrThrow({
      where: { id: second.organizationId },
    });
    expect(newOrg.deletedAt).toBeNull();
  });
});
