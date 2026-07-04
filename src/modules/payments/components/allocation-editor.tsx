"use client";

import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/shared/money";
import { autoAllocate, type OpenDoc } from "@/modules/payments/allocation";

export interface AllocationEditorDoc extends OpenDoc {
  label: string;
  currency: string;
}

interface AllocationEditorProps {
  amount: number;
  openDocs: AllocationEditorDoc[];
  allocations: Record<string, string>;
  onChange: (targetId: string, value: string) => void;
  focusTargetId?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function unallocatedAmount(amount: number, allocations: Record<string, string>): number {
  const allocated = Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0);
  return round2(amount - allocated);
}

export function AllocationEditor({
  amount,
  openDocs,
  allocations,
  onChange,
  focusTargetId,
}: AllocationEditorProps) {
  const unallocated = unallocatedAmount(amount, allocations);
  // All open docs for a single party+direction share one currency in
  // practice (Invoice/Bill currency isn't per-line-item); fall back to the
  // schema default when there are no open docs to read it from.
  const currency = openDocs[0]?.currency ?? "INR";

  function handleAutoAllocate() {
    const plan = autoAllocate(amount, openDocs);
    const planned = new Map(plan.map((p) => [p.targetId, p.amount]));
    for (const doc of openDocs) {
      onChange(doc.id, (planned.get(doc.id) ?? 0).toFixed(2));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Open documents</p>
        <Button type="button" variant="outline" size="sm" onClick={handleAutoAllocate}>
          Auto-allocate oldest first
        </Button>
      </div>

      {openDocs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No open documents for this party.
        </div>
      ) : (
        <div className="space-y-2">
          {openDocs.map((doc) => (
            <div
              key={doc.id}
              data-testid={`allocation-row-${doc.id}`}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium text-foreground">{doc.label}</p>
                <p className="text-xs text-muted-foreground">
                  Due {format(new Date(doc.dueDate), "MMM d, yyyy")} · Balance{" "}
                  <Money amount={doc.balanceDue} currency={doc.currency} />
                </p>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={doc.balanceDue}
                step="0.01"
                className="w-32 text-right"
                aria-label={`Allocation for ${doc.label}`}
                autoFocus={focusTargetId === doc.id}
                value={allocations[doc.id] ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  const clamped =
                    raw === "" ? "" : String(Math.min(Number(raw) || 0, doc.balanceDue));
                  onChange(doc.id, clamped);
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div
        className="flex items-center justify-end gap-2 border-t pt-3 text-sm"
        data-testid="unallocated-amount"
      >
        <span className="text-muted-foreground">Unallocated</span>
        <span className="font-medium tabular-nums">
          <Money amount={unallocated} currency={currency} />
        </span>
      </div>
    </div>
  );
}
