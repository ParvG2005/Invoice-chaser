import { describe, it, expect, afterEach } from "vitest";
import { resolveModel } from "@/lib/assistant/models";
import { assistantKillSwitchEnabled } from "@/lib/assistant/killswitch";

describe("resolveModel", () => {
  it("maps default tier to claude-sonnet-5", () => {
    expect(resolveModel("default")).toBe("claude-sonnet-5");
  });
  it("maps tier tier to claude-sonnet-5 too — fable-5 is not wired to any tier", () => {
    expect(resolveModel("tier")).toBe("claude-sonnet-5");
  });
  it("falls back to sonnet for unknown values", () => {
    expect(resolveModel("nonsense" as never)).toBe("claude-sonnet-5");
  });
});

describe("assistantKillSwitchEnabled", () => {
  afterEach(() => {
    delete process.env.ASSISTANT_KILL_SWITCH;
  });
  it("is false when unset", () => {
    delete process.env.ASSISTANT_KILL_SWITCH;
    expect(assistantKillSwitchEnabled()).toBe(false);
  });
  it("is true when set to '1' or 'true'", () => {
    process.env.ASSISTANT_KILL_SWITCH = "true";
    expect(assistantKillSwitchEnabled()).toBe(true);
    process.env.ASSISTANT_KILL_SWITCH = "1";
    expect(assistantKillSwitchEnabled()).toBe(true);
  });
});
