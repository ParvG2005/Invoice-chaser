import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifySvixSignature } from "@/lib/channels/webhook-signature";

const secret = "whsec_" + Buffer.from("test-secret-bytes").toString("base64");

function sign(payload: string, id: string, timestamp: string): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return `v1,${mac}`;
}

describe("verifySvixSignature", () => {
  const payload = JSON.stringify({ type: "email.delivered" });
  const id = "msg_1";
  const timestamp = String(Math.floor(Date.now() / 1000));

  it("accepts a valid signature (including multi-signature headers)", () => {
    const sig = sign(payload, id, timestamp);
    expect(verifySvixSignature(payload, { id, timestamp, signature: sig }, secret)).toBe(true);
    expect(
      verifySvixSignature(payload, { id, timestamp, signature: `v1,AAAA ${sig}` }, secret),
    ).toBe(true);
  });

  it("rejects a tampered payload or wrong secret", () => {
    const sig = sign(payload, id, timestamp);
    expect(verifySvixSignature(payload + "x", { id, timestamp, signature: sig }, secret)).toBe(false);
    expect(
      verifySvixSignature(payload, { id, timestamp, signature: sig }, "whsec_" + Buffer.from("other").toString("base64")),
    ).toBe(false);
  });
});
