import { describe, it, expect } from "vitest";
import { buildRegistry } from "@/lib/assistant/tools/registry";
import type { ToolContext } from "@/lib/assistant/tools/types";

const base: Omit<ToolContext, "role"> = { organizationId: "org1", userId: "u1" };

describe("buildRegistry RBAC filtering", () => {
  it("viewer role gets only read tools", () => {
    const reg = buildRegistry({ ...base, role: "viewer" });
    for (const tool of reg.values()) {
      expect(tool.kind).toBe("read");
    }
  });

  it("viewer role has read tools", () => {
    const reg = buildRegistry({ ...base, role: "viewer" });
    expect(reg.size).toBeGreaterThan(0);
  });

  it("member role can see tools", () => {
    // Actually checking that buildRegistry works for member role without error
    const reg = buildRegistry({ ...base, role: "member" });
    expect(reg).toBeInstanceOf(Map);
  });

  it("member role gets both read and write tools", () => {
    const reg = buildRegistry({ ...base, role: "member" });
    const kinds = new Set([...reg.values()].map((t) => t.kind));
    expect(kinds.has("read")).toBe(true);
    expect(kinds.has("write")).toBe(true);
  });

  it("excludes disabled tools", () => {
    const reg = buildRegistry({ ...base, role: "owner" });
    for (const tool of reg.values()) {
      expect(tool.disabled).not.toBe(true);
    }
  });
});
