import { createHmac, timingSafeEqual } from "crypto";

/** Verifies a Resend (svix) webhook signature: HMAC-SHA256 over `${id}.${timestamp}.${payload}`. */
export function verifySvixSignature(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
): boolean {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${payload}`)
    .digest();

  return headers.signature.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    const candidate = Buffer.from(sig, "base64");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}
