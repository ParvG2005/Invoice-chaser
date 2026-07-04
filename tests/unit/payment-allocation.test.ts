import { describe, it, expect } from "vitest";
import { planAllocations } from "@/server/services/payment-allocation";

const doc = (id: string, due: string, outstanding: number) => ({
  id,
  dueDate: new Date(due),
  outstanding,
});

describe("planAllocations", () => {
  it("allocates to the oldest due document first", () => {
    const plan = planAllocations(1000, [
      doc("new", "2026-08-01", 800),
      doc("old", "2026-06-01", 800),
    ]);
    expect(plan.allocations).toEqual([
      { documentId: "old", amount: 800 },
      { documentId: "new", amount: 200 },
    ]);
    expect(plan.unallocated).toBe(0);
  });

  it("leaves a remainder unallocated when payment exceeds all outstanding", () => {
    const plan = planAllocations(1000, [doc("a", "2026-06-01", 300)]);
    expect(plan.allocations).toEqual([{ documentId: "a", amount: 300 }]);
    expect(plan.unallocated).toBe(700);
  });

  it("partially pays a single document", () => {
    const plan = planAllocations(250, [doc("a", "2026-06-01", 1000)]);
    expect(plan.allocations).toEqual([{ documentId: "a", amount: 250 }]);
    expect(plan.unallocated).toBe(0);
  });

  it("skips documents with zero or negative outstanding", () => {
    const plan = planAllocations(100, [doc("paid", "2026-05-01", 0), doc("b", "2026-06-01", 50)]);
    expect(plan.allocations).toEqual([{ documentId: "b", amount: 50 }]);
    expect(plan.unallocated).toBe(50);
  });

  it("handles rupee-paise rounding to 2dp", () => {
    const plan = planAllocations(100.1, [
      doc("a", "2026-06-01", 33.33),
      doc("b", "2026-07-01", 66.77),
    ]);
    expect(plan.allocations).toEqual([
      { documentId: "a", amount: 33.33 },
      { documentId: "b", amount: 66.77 },
    ]);
    expect(plan.unallocated).toBe(0);
  });

  it("returns everything unallocated when there are no open documents", () => {
    expect(planAllocations(500, [])).toEqual({ allocations: [], unallocated: 500 });
  });
});
