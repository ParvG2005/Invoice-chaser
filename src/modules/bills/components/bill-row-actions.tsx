"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useMarkBillPaid, useWriteOffBill } from "@/modules/bills/hooks";
import type { BillDto } from "@/types";

export function BillRowActions({ bill }: { bill: BillDto }) {
  const router = useRouter();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  const markPaid = useMarkBillPaid(bill.id);
  const writeOff = useWriteOffBill(bill.id);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMarkPaidOpen(true)}>Mark paid</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              router.push(`/dashboard/payments?record=1&direction=OUT&billId=${bill.id}`)
            }
          >
            Record payment
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setWriteOffOpen(true)}>
            Write off
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
    </>
  );
}
