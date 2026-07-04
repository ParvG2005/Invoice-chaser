import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseDueDate, computeInvoiceStatus } from "@/server/services/mappers";

describe("parseDueDate (characterization)", () => {
  it("treats a bare YYYY-MM-DD as noon UTC", () => {
    expect(parseDueDate("2026-07-15").toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("passes through ISO datetimes unchanged", () => {
    expect(parseDueDate("2026-07-15T09:30:00.000Z").toISOString()).toBe(
      "2026-07-15T09:30:00.000Z",
    );
  });
});

describe("computeInvoiceStatus (characterization)", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-07-03T00:00:00.000Z") }));
  afterEach(() => vi.useRealTimers());

  it("explicit PAID wins regardless of due date", () => {
    expect(computeInvoiceStatus(new Date("2020-01-01"), "PAID")).toBe("PAID");
  });

  it("explicit OVERDUE wins", () => {
    expect(computeInvoiceStatus(new Date("2099-01-01"), "OVERDUE")).toBe("OVERDUE");
  });

  it("past due date without explicit status is OVERDUE", () => {
    expect(computeInvoiceStatus(new Date("2026-07-01T00:00:00.000Z"))).toBe("OVERDUE");
  });

  it("future due date without explicit status is PENDING", () => {
    expect(computeInvoiceStatus(new Date("2026-07-10T00:00:00.000Z"))).toBe("PENDING");
  });

  it("explicit PENDING on a past date is still OVERDUE (current behavior)", () => {
    expect(computeInvoiceStatus(new Date("2026-07-01T00:00:00.000Z"), "PENDING")).toBe("OVERDUE");
  });
});
