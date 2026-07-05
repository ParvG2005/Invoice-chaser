import { NextResponse } from "next/server";
import { verifySvixSignature } from "@/lib/channels/webhook-signature";
import { communicationService } from "@/server/services/communication.service";
import { createLogger } from "@/lib/logger";
import type { CommunicationStatus } from "@/generated/prisma/client";

const log = createLogger("resend-webhook");

const EVENT_STATUS: Record<string, CommunicationStatus> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.opened": "READ",
  "email.complained": "BOUNCED",
};

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    log.error("RESEND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const payload = await request.text();
  const headers = {
    id: request.headers.get("svix-id") ?? "",
    timestamp: request.headers.get("svix-timestamp") ?? "",
    signature: request.headers.get("svix-signature") ?? "",
  };

  if (!verifySvixSignature(payload, headers, secret)) {
    log.warn("Invalid Resend webhook signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload) as {
    type: string;
    created_at?: string;
    data?: { email_id?: string; bounce?: { message?: string } };
  };

  const status = EVENT_STATUS[event.type];
  const providerId = event.data?.email_id;
  if (status && providerId) {
    await communicationService.handleProviderStatus(
      "EMAIL",
      providerId,
      status,
      event.created_at ? new Date(event.created_at) : new Date(),
      status === "BOUNCED" ? event.data?.bounce?.message : undefined,
    );
  }

  // Always 200 for verified payloads so Resend does not retry unknown event types.
  return NextResponse.json({ received: true });
}
