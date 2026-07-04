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
    return prisma.organizationMember.findFirst({
      where: { userId },
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

  softDelete(id: string) {
    return prisma.organization.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};
