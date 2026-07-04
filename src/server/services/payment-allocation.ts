export interface OpenDocument {
  id: string;
  dueDate: Date;
  outstanding: number;
}

export interface PlannedAllocation {
  documentId: string;
  amount: number;
}

export interface AllocationPlan {
  allocations: PlannedAllocation[];
  unallocated: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Plans how a payment amount spreads across open documents:
 * oldest due date first (FIFO), partial on the last one, remainder unallocated.
 * Pure function — mirrors Tally's default bill-wise "On Account → FIFO" behavior.
 */
export function planAllocations(amount: number, openDocuments: OpenDocument[]): AllocationPlan {
  const sorted = [...openDocuments]
    .filter((d) => d.outstanding > 0)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.id.localeCompare(b.id));

  const allocations: PlannedAllocation[] = [];
  let remaining = round2(amount);

  for (const document of sorted) {
    if (remaining <= 0) break;
    const allocated = round2(Math.min(remaining, document.outstanding));
    allocations.push({ documentId: document.id, amount: allocated });
    remaining = round2(remaining - allocated);
  }

  return { allocations, unallocated: remaining };
}
