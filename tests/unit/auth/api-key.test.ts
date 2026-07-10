import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "@/lib/auth/api-key";

describe("api-key crypto", () => {
  it("generates a prefixed key whose hash matches hashApiKey", () => {
    const { raw, prefix, hash } = generateApiKey();
    expect(raw.startsWith("oc_live_")).toBe(true);
    expect(prefix).toBe(raw.slice(0, 12));
    expect(hash).toBe(hashApiKey(raw));
    expect(hash).toHaveLength(64); // sha-256 hex
  });

  it("produces distinct keys each call", () => {
    expect(generateApiKey().raw).not.toBe(generateApiKey().raw);
  });
});
