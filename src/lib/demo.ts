import { cache } from "react";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";
import { createLogger } from "@/lib/logger";

/**
 * Skip-login demo support. A single shared Clerk account (identified by
 * DEMO_CLERK_USER_EMAIL) lets interviewers preview the dashboard without
 * signing up: the landing page mints a Clerk sign-in ticket for this user
 * (see /api/demo-login) and auto-signs them in. They get a real, isolated
 * Clerk session scoped to the demo account's own organization, so the entire
 * existing auth/API/org path is reused untouched.
 *
 * Real outbound email/SMTP is BLOCKED for the demo org (see isDemoOrg callers)
 * so interviewer clicks never reach real inboxes.
 */

const log = createLogger("demo");

/** Email of the shared demo account, or null if demo mode isn't configured. */
export const DEMO_USER_EMAIL = process.env.DEMO_CLERK_USER_EMAIL ?? null;

/** True when a skip-login demo account is configured for this deployment. */
export function isDemoConfigured(): boolean {
  return Boolean(DEMO_USER_EMAIL);
}

/**
 * Clerk user id for the demo account, resolved from DEMO_CLERK_USER_EMAIL.
 * Memoized per request (React cache) — the lookup hits Clerk's API.
 */
export const getDemoClerkUserId = cache(async (): Promise<string | null> => {
  if (!DEMO_USER_EMAIL) return null;
  try {
    const client = await clerkClient();
    // getUserList's emailAddress filter is a case-insensitive PARTIAL match, so
    // pick the row whose email exactly equals DEMO_USER_EMAIL.
    const { data } = await client.users.getUserList({ emailAddress: [DEMO_USER_EMAIL] });
    const target = DEMO_USER_EMAIL.toLowerCase();
    const match = data.find((u) =>
      u.emailAddresses.some((e) => e.emailAddress.toLowerCase() === target),
    );
    return match?.id ?? null;
  } catch (err) {
    log.error("Failed to resolve demo Clerk user", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
});

/** True if the given Clerk user id is the demo account. */
export async function isDemoClerkUser(clerkId: string | null | undefined): Promise<boolean> {
  if (!clerkId) return false;
  const demoId = await getDemoClerkUserId();
  return demoId != null && demoId === clerkId;
}

/**
 * Organization id owned by the demo account. Env override
 * (DEMO_ORGANIZATION_ID) wins; otherwise resolved from the demo user's
 * email → membership. Memoized per request.
 */
export const getDemoOrganizationId = cache(async (): Promise<string | null> => {
  if (process.env.DEMO_ORGANIZATION_ID) return process.env.DEMO_ORGANIZATION_ID;
  if (!DEMO_USER_EMAIL) return null;
  const user = await prisma.user.findFirst({ where: { email: DEMO_USER_EMAIL } });
  if (!user) return null;
  const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id } });
  return membership?.organizationId ?? null;
});

/**
 * True if the org is the demo org. Callers use this to BLOCK real outbound
 * email/SMTP so interviewer clicks never hit real inboxes.
 */
export async function isDemoOrg(organizationId: string): Promise<boolean> {
  const demoOrgId = await getDemoOrganizationId();
  return demoOrgId != null && demoOrgId === organizationId;
}
