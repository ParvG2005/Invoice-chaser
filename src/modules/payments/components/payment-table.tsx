"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { DataTable } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils/cn";
import type { PartyDto, PaymentDto } from "@/types";

const MODE_LABELS: Record<PaymentDto["mode"], string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
};

type AllocationStatus = "Allocated" | "Partially allocated" | "Unallocated";

function allocationStatus(payment: PaymentDto): AllocationStatus {
  if (payment.unallocated <= 0) return "Allocated";
  if (payment.unallocated >= payment.amount) return "Unallocated";
  return "Partially allocated";
}

const ALLOCATION_STYLES: Record<AllocationStatus, string> = {
  Allocated: "bg-success/15 text-success border-success/30",
  "Partially allocated": "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  Unallocated: "bg-warning/15 text-warning border-warning/30",
};

export function AllocationStatusBadge({ payment }: { payment: PaymentDto }) {
  const status = allocationStatus(payment);
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        ALLOCATION_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

export function PaymentTable({
  payments,
  parties,
  isLoading = false,
}: {
  payments: PaymentDto[];
  parties: PartyDto[];
  isLoading?: boolean;
}) {
  const partyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const party of parties) map.set(party.id, party.name);
    return map;
  }, [parties]);

  const columns = useMemo<ColumnDef<PaymentDto, unknown>[]>(
    () => [
      {
        accessorKey: "paymentDate",
        header: "Date",
        cell: ({ row }) => format(new Date(row.original.paymentDate), "MMM d, yyyy"),
      },
      {
        id: "party",
        header: "Party",
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {partyNameById.get(row.original.partyId) ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "direction",
        header: "Direction",
        cell: ({ row }) => (row.original.direction === "IN" ? "In" : "Out"),
      },
      {
        accessorKey: "mode",
        header: "Mode",
        cell: ({ row }) => MODE_LABELS[row.original.mode],
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => <Money amount={row.original.amount} currency={row.original.currency} />,
      },
      {
        id: "allocation",
        header: "Allocation status",
        cell: ({ row }) => <AllocationStatusBadge payment={row.original} />,
      },
    ],
    [partyNameById],
  );

  if (!isLoading && payments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <p className="text-muted-foreground">No payments yet. Record one to get started.</p>
      </div>
    );
  }

  return <DataTable columns={columns} data={payments} isLoading={isLoading} />;
}
