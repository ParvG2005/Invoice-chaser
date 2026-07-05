import { test, expect } from "@playwright/test";

test.describe("security headers @smoke", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("root document carries hardening headers", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["strict-transport-security"]).toContain("max-age=63072000");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers()["permissions-policy"]).toContain("camera=()");
    const csp = res.headers()["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("clerk");
  });
});
