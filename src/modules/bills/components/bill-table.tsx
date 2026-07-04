"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { DataTable } from "@/components/shared/data-table";
import { StatusChip } from "@/components/shared/status-chip";
import { Money } from "@/components/shared/money";
import { BillRowActions } from "@/modules/bills/components/bill-row-actions";
import type { BillDto } from "@/types";

export function BillTable({ bills, isLoading }: { bills: BillDto[]; isLoading?: boolean }) {
  const columns = useMemo<ColumnDef<BillDto, unknown>[]>(
    () => [
      {
        accessorKey: "billNumber",
        header: "Bill #",
        cell: ({ row }) => (
          <Link
            href={`/dashboard/bills/${row.original.id}`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {row.original.billNumber}
          </Link>
        ),
      },
      {
        id: "supplier",
        header: "Supplier",
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.party?.name ?? "—"}</span>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => <Money amount={row.original.amount} currency={row.original.currency} />,
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => format(new Date(row.original.dueDate), "MMM d, yyyy"),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => <BillRowActions bill={row.original} />,
        enableSorting: false,
      },
    ],
    [],
  );

  if (!isLoading && bills.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <p className="text-muted-foreground">No bills yet. Record a payable to get started.</p>
      </div>
    );
  }

  return <DataTable columns={columns} data={bills} isLoading={isLoading} />;
}
