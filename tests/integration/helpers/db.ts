import { prisma } from "@/lib/db/prisma";

/**
 * Wipes all rows relevant to integration tests. Most organization-scoped
 * models cascade from Organization (`onDelete: Cascade`, verified against
 * prisma/schema.prisma), so deleting all Organizations clears them in one
 * shot. Two exceptions, verified against prisma/schema.prisma: `EmailLog`
 * and `AiGeneration` have no foreign key to Organization at all (only
 * nullable `onDelete: SetNull` relations to Invoice/Reminder), so they are
 * cleared explicitly. User is also NOT cascade-deleted from Organization (a
 * User can belong to multiple orgs via OrganizationMember), so it is
 * cleared explicitly too.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.emailLog.deleteMany({});
  await prisma.aiGeneration.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
}

/**
 * Creates a minimal Organization + User + OrganizationMember trio for
 * integration tests. The membership/user are needed because
 * `tallyImportService.undoBatch` requires an actor user id, and the
 * round-trip test resolves one via `prisma.user.findFirstOrThrow()`.
 */
export async function createTestOrganization(): Promise<{ id: string }> {
  const organization = await prisma.organization.create({
    data: {
      name: "Test Org",
      slug: `test-org-${Date.now()}`,
    },
  });

  const user = await prisma.user.create({
    data: {
      clerkId: `test-clerk-${Date.now()}`,
      email: "test-user@example.com",
    },
  });

  await prisma.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
    },
  });

  return { id: organization.id };
}
