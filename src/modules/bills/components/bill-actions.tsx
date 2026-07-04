"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useMarkBillPaid, useWriteOffBill } from "@/modules/bills/hooks";
import type { BillDto } from "@/types";

/**
 * Action bar for the bill detail page. Drives the same mutation hooks as
 * `bill-row-actions.tsx` (the bills-list row menu) — no duplicated fetch
 * logic between the two surfaces. Mirrors `invoice-actions.tsx`.
 */
export function BillActions({ bill }: { bill: BillDto }) {
  const router = useRouter();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  const markPaid = useMarkBillPaid(bill.id);
  const writeOff = useWriteOffBill(bill.id);

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={() => setMarkPaidOpen(true)}>
        Mark paid
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          router.push(`/dashboard/payments?record=1&direction=OUT&billId=${bill.id}`)
        }
      >
        Record payment
      </Button>
      <Button
        type="button"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        onClick={() => setWriteOffOpen(true)}
      >
        Write off
      </Button>

      <ConfirmDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        title="Mark bill as paid?"
        description={`This will mark ${bill.billNumber} as fully paid.`}
        confirmLabel="Mark paid"
        onConfirm={() => markPaid.mutate()}
      />

      <ConfirmDialog
        open={writeOffOpen}
        onOpenChange={setWriteOffOpen}
        title="Write off this bill?"
        description={`${bill.billNumber} will be marked as written off. This cannot be easily undone.`}
        confirmLabel="Write off"
        destructive
        onConfirm={() => writeOff.mutate()}
      />
    </div>
  );
}
