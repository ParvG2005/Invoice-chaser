import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getDemoClerkUserId, isDemoConfigured } from "@/lib/demo";
import { checkRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("demo-login");

/**
 * Mints a short-lived Clerk sign-in ticket for the shared demo account so the
 * landing page can auto-sign interviewers in (strategy: "ticket"). Public
 * route — no session required. Returns 404 when demo mode isn't configured.
 */
export async function POST(request: Request) {
  if (!isDemoConfigured()) {
    return NextResponse.json({ error: "Demo not available" }, { status: 404 });
  }

  const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
  const rl = await checkRateLimit({ key: `demo-login:${ip}`, limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const userId = await getDemoClerkUserId();
  if (!userId) {
    log.error("Demo account not resolvable — check DEMO_CLERK_USER_EMAIL and that it signed in once");
    return NextResponse.json({ error: "Demo not available" }, { status: 503 });
  }

  const client = await clerkClient();
  const token = await client.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 300,
  });

  return NextResponse.json({ ticket: token.token });
}
