"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils/cn";
import type { StockMovementDto } from "@/types";

const SOURCE_TYPE_LABELS: Record<StockMovementDto["sourceType"], string> = {
  OPENING: "Opening",
  INVOICE: "Invoice",
  BILL: "Bill",
  ADJUSTMENT: "Adjustment",
};

const SOURCE_TYPE_STYLES: Record<StockMovementDto["sourceType"], string> = {
  OPENING: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  INVOICE: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  BILL: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  ADJUSTMENT: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

function SourceTypeBadge({ sourceType }: { sourceType: StockMovementDto["sourceType"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        SOURCE_TYPE_STYLES[sourceType],
      )}
    >
      {SOURCE_TYPE_LABELS[sourceType]}
    </span>
  );
}

/**
 * Movement history table for the item detail page. Source document links
 * (INVOICE/BILL) are deliberately deferred — the brief calls for a "source
 * doc link" but Task 22's DTO only carries a bare `sourceId`, not enough to
 * build a route without a lookup this task doesn't otherwise need; shown as
 * plain text for now.
 */
export function MovementTable({
  movements,
  isLoading = false,
}: {
  movements: StockMovementDto[];
  isLoading?: boolean;
}) {
  const columns = useMemo<ColumnDef<StockMovementDto, unknown>[]>(
    () => [
      {
        accessorKey: "movementDate",
        header: "Date",
        cell: ({ row }) => format(new Date(row.original.movementDate), "MMM d, yyyy"),
      },
      {
        accessorKey: "sourceType",
        header: "Type",
        cell: ({ row }) => <SourceTypeBadge sourceType={row.original.sourceType} />,
      },
      {
        accessorKey: "qty",
        header: "Qty",
        cell: ({ row }) => <span className="tabular-nums">{row.original.qty}</span>,
      },
      {
        accessorKey: "rate",
        header: "Rate",
        cell: ({ row }) =>
          row.original.rate != null ? <Money amount={row.original.rate} /> : "—",
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) => (
          <span className="text-sm text-zinc-500">
            {row.original.notes || row.original.sourceId || "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div data-testid="movement-table">
      <DataTable columns={columns} data={movements} isLoading={isLoading} />
    </div>
  );
}
