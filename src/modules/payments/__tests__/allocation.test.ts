import { describe, expect, it } from "vitest";
import { autoAllocate, type OpenDoc } from "@/modules/payments/allocation";

function doc(overrides: Partial<OpenDoc> = {}): OpenDoc {
  return {
    id: "doc-1",
    balanceDue: 100,
    dueDate: "2026-01-01",
    ...overrides,
  };
}

describe("autoAllocate", () => {
  it("fills oldest-due documents first", () => {
    const docs: OpenDoc[] = [
      doc({ id: "new", balanceDue: 500, dueDate: "2026-08-01" }),
      doc({ id: "old", balanceDue: 800, dueDate: "2026-06-01" }),
    ];
    expect(autoAllocate(1000, docs)).toEqual([
      { targetId: "old", amount: 800 },
      { targetId: "new", amount: 200 },
    ]);
  });

  it("partially fills the last document once the amount runs out", () => {
    const docs: OpenDoc[] = [
      doc({ id: "inv-001", balanceDue: 10000, dueDate: "2026-05-01" }),
      doc({ id: "inv-002", balanceDue: 18500, dueDate: "2026-04-01" }),
    ];
    expect(autoAllocate(1000, docs)).toEqual([{ targetId: "inv-002", amount: 1000 }]);
  });

  it("leaves a remainder unallocated when the amount exceeds total outstanding", () => {
    const docs: OpenDoc[] = [doc({ id: "a", balanceDue: 100, dueDate: "2026-01-01" })];
    // 150 requested, only 100 available across all docs -> only 100 allocated,
    // remainder (50) is simply not represented in the returned allocations.
    expect(autoAllocate(150, docs)).toEqual([{ targetId: "a", amount: 100 }]);
  });

  it("returns an empty array for no open documents", () => {
    expect(autoAllocate(500, [])).toEqual([]);
  });

  it("rounds to 2dp", () => {
    const docs: OpenDoc[] = [doc({ id: "a", balanceDue: 33.333, dueDate: "2026-01-01" })];
    expect(autoAllocate(100, docs)).toEqual([{ targetId: "a", amount: 33.33 }]);
  });
});
