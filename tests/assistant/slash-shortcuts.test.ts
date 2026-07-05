import { describe, it, expect } from "vitest";
import { expandSlashShortcut, SLASH_SHORTCUTS } from "@/components/assistant/SlashShortcuts";

describe("slash shortcuts", () => {
  it("expands /remind with an argument", () => {
    const out = expandSlashShortcut("/remind all overdue > 30d");
    expect(out).toContain("overdue");
    expect(out).toContain("30");
    expect(out).not.toMatch(/^\//);
  });

  it("returns the raw text unchanged when no shortcut matches", () => {
    expect(expandSlashShortcut("what is my total receivable?")).toBe("what is my total receivable?");
  });

  it("every registered shortcut has a template and a description", () => {
    for (const s of SLASH_SHORTCUTS) {
      expect(s.command.startsWith("/")).toBe(true);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.expand("x").length).toBeGreaterThan(0);
    }
  });
});
