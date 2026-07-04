import { cache } from "react";
import { clerkClient } from "@clerk/nextjs/server";
import { Prisma } from "@/generated/prisma/client";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { createLogger } from "@/lib/logger";
import { parseRole, type Role } from "@/lib/auth/roles";
import { NotFoundError } from "@/lib/api/errors";
import type { OrganizationSettingsInput } from "@/lib/validations/organization";
import type { OrganizationSettingsDto } from "@/types";

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
      role: parseRole(existing.role),
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
    return { userId: user.id, organizationId: org.id, organization: org, role: "owner" as Role };
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
          role: parseRole(membership.role),
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

function toSettingsDto(org: {
  name: string;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  logoUrl: string | null;
  senderName: string | null;
  senderReplyTo: string | null;
  emailSignature: string | null;
  theme: string | null;
}): OrganizationSettingsDto {
  return {
    name: org.name,
    gstin: org.gstin,
    addressLine1: org.addressLine1,
    addressLine2: org.addressLine2,
    city: org.city,
    state: org.state,
    postalCode: org.postalCode,
    logoUrl: org.logoUrl,
    senderName: org.senderName,
    senderReplyTo: org.senderReplyTo,
    emailSignature: org.emailSignature,
    theme: (org.theme as OrganizationSettingsDto["theme"]) ?? "system",
  };
}

export const organizationService = {
  // cache() dedupes this within a single request so multiple service calls in one
  // route handler don't each re-run the lookup queries.
  ensureUserOrganization: cache(resolveUserOrganization),

  async getSettings(organizationId: string): Promise<OrganizationSettingsDto> {
    const org = await organizationRepository.findSettings(organizationId);
    if (!org) throw new NotFoundError("Organization not found");
    return toSettingsDto(org);
  },

  async updateSettings(
    organizationId: string,
    input: OrganizationSettingsInput,
  ): Promise<OrganizationSettingsDto> {
    const org = await organizationRepository.updateSettings(organizationId, input);
    return toSettingsDto(org);
  },

  /**
   * Danger-zone "Delete organization". Soft-delete only (sets `deletedAt`),
   * matching every other entity's delete convention in this codebase
   * (Party/Item/Invoice etc.) — not a hard/destructive delete.
   */
  async deleteOrganization(organizationId: string) {
    await organizationRepository.softDelete(organizationId);
    return { deleted: true };
  },
};
