import { describe, expect, it } from "vitest";
import { lineAmount, totals, type LineItemInput } from "@/modules/invoices/line-items";

function li(overrides: Partial<LineItemInput> = {}): LineItemInput {
  return {
    description: "Widget",
    qty: 1,
    rate: 100,
    discountPct: 0,
    taxRatePct: 0,
    ...overrides,
  };
}

describe("lineAmount", () => {
  it("computes qty * rate with no discount/tax", () => {
    expect(lineAmount(li({ qty: 2, rate: 100 }))).toBe(200);
  });

  it("applies a discount percentage", () => {
    expect(lineAmount(li({ qty: 2, rate: 100, discountPct: 10 }))).toBe(180);
  });

  it("applies a tax percentage on top of the discounted amount", () => {
    expect(lineAmount(li({ qty: 2, rate: 100, discountPct: 10, taxRatePct: 18 }))).toBe(212.4);
  });

  it("rounds to 2dp", () => {
    expect(lineAmount(li({ qty: 3, rate: 33.333, discountPct: 5, taxRatePct: 12.5 }))).toBe(106.87);
  });
});

describe("totals", () => {
  it("returns zeros for an empty list", () => {
    expect(totals([])).toEqual({ subtotal: 0, taxAmount: 0, total: 0 });
  });

  it("sums subtotal/tax/total across three rows", () => {
    const items: LineItemInput[] = [
      li({ qty: 2, rate: 500, discountPct: 0, taxRatePct: 18 }), // 1000 + 180 = 1180
      li({ qty: 1, rate: 250, discountPct: 10, taxRatePct: 5 }), // 225 + 11.25 = 236.25
      li({ qty: 5, rate: 40, discountPct: 0, taxRatePct: 0 }), // 200
    ];

    const result = totals(items);

    expect(result.subtotal).toBe(1425); // 1000 + 225 + 200
    expect(result.taxAmount).toBe(191.25); // 180 + 11.25 + 0
    expect(result.total).toBe(1616.25);
    expect(result.total).toBeCloseTo(result.subtotal + result.taxAmount, 5);
  });
});
