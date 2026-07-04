import { prisma } from "@/lib/db/prisma";
import type { OrganizationSettingsInput } from "@/lib/validations/organization";

export const organizationRepository = {
  findById(id: string) {
    return prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: { reminderSettings: true },
    });
  },

  findBySlug(slug: string) {
    return prisma.organization.findFirst({
      where: { slug, deletedAt: null },
    });
  },

  findMembership(userId: string, organizationId: string) {
    return prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
    });
  },

  findFirstForUser(userId: string) {
    // Filter on the joined organization's `deletedAt` (mirrors `findSettings`),
    // so a soft-deleted org never keeps resolving as the user's active org —
    // `ensureUserOrganization` falls through to provisioning a fresh one instead.
    return prisma.organizationMember.findFirst({
      where: { userId, organization: { deletedAt: null } },
      include: { organization: { include: { reminderSettings: true } } },
      orderBy: { createdAt: "asc" },
    });
  },

  createWithOwner(data: { name: string; slug: string; userId: string }) {
    return prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: data.name, slug: data.slug },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: data.userId,
          role: "owner",
        },
      });

      await tx.reminderSettings.create({
        data: { organizationId: org.id },
      });

      return org;
    });
  },

  /** Org-scoped profile/sender-identity/appearance fields (Task 26). */
  findSettings(id: string) {
    return prisma.organization.findFirst({
      where: { id, deletedAt: null },
    });
  },

  updateSettings(id: string, data: OrganizationSettingsInput) {
    return prisma.organization.update({
      where: { id },
      data,
    });
  },

  /**
   * Soft-deletes the org AND frees its `slug` (which is `@unique` at the
   * DB level and is not scoped by `deletedAt`) by suffixing it with a
   * timestamp. Without this, a user whose only org is soft-deleted can
   * never be re-provisioned a fresh org: `resolveUserOrganization`
   * generates a deterministic slug from the same email/userId, which would
   * collide with the now-orphaned soft-deleted row's slug and throw P2002
   * on every subsequent `/dashboard` load.
   */
  async softDelete(id: string) {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id } });
    return prisma.organization.update({
      where: { id },
      data: { deletedAt: new Date(), slug: `${org.slug}-deleted-${Date.now()}` },
    });
  },
};
