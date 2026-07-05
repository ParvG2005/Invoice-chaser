import { describe, it, expect } from "vitest";
import { nextAllowedSendTime } from "@/lib/channels/quiet-hours";

// 2026-07-03T18:30:00Z == 2026-07-04 00:00 IST
const IST = "Asia/Kolkata";

describe("nextAllowedSendTime", () => {
  it("returns now when quiet hours are not configured", () => {
    const now = new Date("2026-07-03T18:30:00Z");
    expect(
      nextAllowedSendTime(now, { quietHoursStart: null, quietHoursEnd: null, timezone: IST }),
    ).toEqual(now);
  });

  it("returns now when outside quiet hours", () => {
    const now = new Date("2026-07-03T09:00:00Z"); // 14:30 IST
    expect(
      nextAllowedSendTime(now, { quietHoursStart: "21:00", quietHoursEnd: "09:00", timezone: IST }),
    ).toEqual(now);
  });

  it("defers to the end of an overnight quiet window", () => {
    const now = new Date("2026-07-03T18:30:00Z"); // 00:00 IST, inside 21:00→09:00
    const result = nextAllowedSendTime(now, {
      quietHoursStart: "21:00",
      quietHoursEnd: "09:00",
      timezone: IST,
    });
    // 09:00 IST == 03:30 UTC
    expect(result).toEqual(new Date("2026-07-04T03:30:00Z"));
  });

  it("defers within a same-day window", () => {
    const now = new Date("2026-07-03T08:00:00Z"); // 13:30 IST, inside 13:00→14:00
    const result = nextAllowedSendTime(now, {
      quietHoursStart: "13:00",
      quietHoursEnd: "14:00",
      timezone: IST,
    });
    expect(result).toEqual(new Date("2026-07-03T08:30:00Z")); // 14:00 IST
  });
});
