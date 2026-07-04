import { describe, it, expect } from "vitest";
import { hasRole, parseRole } from "@/lib/auth/roles";

describe("hasRole", () => {
  it("owner can do everything", () => {
    expect(hasRole("owner", "owner")).toBe(true);
    expect(hasRole("owner", "viewer")).toBe(true);
  });
  it("ranks viewer < member < admin < owner", () => {
    expect(hasRole("viewer", "member")).toBe(false);
    expect(hasRole("member", "member")).toBe(true);
    expect(hasRole("member", "admin")).toBe(false);
    expect(hasRole("admin", "owner")).toBe(false);
    expect(hasRole("admin", "member")).toBe(true);
  });
});

describe("parseRole", () => {
  it("passes through known roles", () => {
    expect(parseRole("admin")).toBe("admin");
  });
  it("fails closed to viewer on unknown values", () => {
    expect(parseRole("superuser")).toBe("viewer");
    expect(parseRole("")).toBe("viewer");
  });
});
