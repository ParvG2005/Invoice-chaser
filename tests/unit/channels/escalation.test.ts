import { describe, it, expect } from "vitest";
import { toneForOffset } from "@/lib/channels/escalation";

const TONES = ["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"] as const;

describe("toneForOffset", () => {
  it("maps each reminder step to the escalation tone at the same index", () => {
    expect(toneForOffset([3, 7, 14, 30], [...TONES], 3)).toBe("FRIENDLY");
    expect(toneForOffset([3, 7, 14, 30], [...TONES], 7)).toBe("PROFESSIONAL");
    expect(toneForOffset([3, 7, 14, 30], [...TONES], 14)).toBe("FIRM");
    expect(toneForOffset([3, 7, 14, 30], [...TONES], 30)).toBe("FINAL_NOTICE");
  });

  it("clamps to the last tone when there are more steps than tones", () => {
    expect(toneForOffset([1, 2, 3], ["FRIENDLY", "FIRM"], 3)).toBe("FIRM");
  });

  it("sorts reminderDays before indexing and falls back for unknown offsets", () => {
    expect(toneForOffset([14, 3, 7], [...TONES], 3)).toBe("FRIENDLY");
    expect(toneForOffset([3, 7], [...TONES], 99)).toBe("PROFESSIONAL"); // unknown → last step's tone
  });
});
