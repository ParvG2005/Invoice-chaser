import { cache } from "react";
import { clerkClient } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { createLogger } from "@/lib/logger";

const log = createLogger("organization-service");

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function resolveUserOrganization(clerkId: string) {
  let user = await userRepository.findByClerkId(clerkId);

  if (!user) {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkId);
    const email =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      `${clerkId}@placeholder.local`;

    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

    // upsertFromClerk is keyed on the unique clerkId, so concurrent first requests
    // converge on the same user row.
    user = await userRepository.upsertFromClerk({ clerkId, email, name });
  }

  const existing = await organizationRepository.findFirstForUser(user.id);
  if (existing) {
    return {
      userId: user.id,
      organizationId: existing.organizationId,
      organization: existing.organization,
    };
  }

  const baseSlug = slugify(user.email.split("@")[0] || "workspace");
  const slug = `${baseSlug}-${user.id.slice(0, 6)}`;

  try {
    const org = await organizationRepository.createWithOwner({
      name: `${user.name ?? "My"} Workspace`,
      slug,
      userId: user.id,
    });
    return { userId: user.id, organizationId: org.id, organization: org };
  } catch (error) {
    // Lost a race with a concurrent first request (duplicate slug or membership):
    // the other request already provisioned the org, so just read it back.
    if (isUniqueViolation(error)) {
      const membership = await organizationRepository.findFirstForUser(user.id);
      if (membership) {
        return {
          userId: user.id,
          organizationId: membership.organizationId,
          organization: membership.organization,
        };
      }
    }
    log.error("Failed to provision organization", {
      clerkId,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

export const organizationService = {
  // cache() dedupes this within a single request so multiple service calls in one
  // route handler don't each re-run the lookup queries.
  ensureUserOrganization: cache(resolveUserOrganization),
};
