import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";

vi.mock("@/server/services/communication.service", () => ({
  communicationService: { handleProviderStatus: vi.fn().mockResolvedValue({ updated: true }) },
}));

import { POST } from "@/app/api/webhooks/resend/route";
import { communicationService } from "@/server/services/communication.service";

const secret = "whsec_" + Buffer.from("test-secret").toString("base64");

function makeRequest(body: object): Request {
  const payload = JSON.stringify(body);
  const id = "msg_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${sig}` },
    body: payload,
  });
}

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  });

  it("maps delivered/bounced/opened events to CommunicationLog statuses", async () => {
    for (const [type, status] of [
      ["email.delivered", "DELIVERED"],
      ["email.bounced", "BOUNCED"],
      ["email.opened", "READ"],
    ] as const) {
      const res = await POST(
        makeRequest({ type, created_at: "2026-07-03T10:00:00.000Z", data: { email_id: "re_1" } }),
      );
      expect(res.status).toBe(200);
      expect(communicationService.handleProviderStatus).toHaveBeenCalledWith(
        "EMAIL", "re_1", status, expect.any(Date), undefined,
      );
    }
  });

  it("returns 401 on a bad signature and 200 (ignored) on unknown event types", async () => {
    const bad = new Request("http://localhost/api/webhooks/resend", {
      method: "POST",
      headers: { "svix-id": "x", "svix-timestamp": "0", "svix-signature": "v1,bogus" },
      body: JSON.stringify({ type: "email.delivered", data: { email_id: "re_1" } }),
    });
    expect((await POST(bad)).status).toBe(401);

    const res = await POST(makeRequest({ type: "email.clicked", data: { email_id: "re_1" } }));
    expect(res.status).toBe(200);
  });
});
