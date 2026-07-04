/**
 * Client-side "Auto-allocate oldest first" helper for the record-payment
 * sheet's allocation editor. Pure/UI-only pre-fill — mirrors the FIFO logic
 * and 2dp rounding of the server's `planAllocations`
 * (`src/server/services/payment-allocation.ts`), but is its own function
 * since it operates on the UI's open-document shape (`dueDate` as an ISO
 * string, `balanceDue` instead of `outstanding`) rather than the server's.
 * The server is always the source of truth for what actually gets
 * persisted — this only pre-fills inputs the user can still edit.
 */
export interface OpenDoc {
  id: string;
  balanceDue: number;
  dueDate: string;
}

export interface AllocationTarget {
  targetId: string;
  amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function autoAllocate(amount: number, openDocs: OpenDoc[]): AllocationTarget[] {
  const sorted = [...openDocs]
    .filter((d) => d.balanceDue > 0)
    .sort(
      (a, b) =>
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() || a.id.localeCompare(b.id),
    );

  const targets: AllocationTarget[] = [];
  let remaining = round2(amount);

  for (const doc of sorted) {
    if (remaining <= 0) break;
    const allocated = round2(Math.min(remaining, doc.balanceDue));
    targets.push({ targetId: doc.id, amount: allocated });
    remaining = round2(remaining - allocated);
  }

  return targets;
}
