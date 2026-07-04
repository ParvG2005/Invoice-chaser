"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils/cn";
import type { ItemDto } from "@/types";

/** Reorder-level-aware low-stock badge — shown whenever stockOnHand <= reorderLevel (reorderLevel set). */
export function LowStockBadge({ item }: { item: ItemDto }) {
  const isLow = item.reorderLevel !== null && item.stockOnHand <= item.reorderLevel;
  if (!isLow) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        "bg-destructive/15 text-destructive border-destructive/30",
      )}
    >
      Low stock
    </span>
  );
}

export function ItemTable({ items, isLoading = false }: { items: ItemDto[]; isLoading?: boolean }) {
  const columns = useMemo<ColumnDef<ItemDto, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/stock/${row.original.id}`}
              className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
            >
              {row.original.name}
            </Link>
            <LowStockBadge item={row.original} />
          </div>
        ),
      },
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) => <span className="text-sm text-zinc-500">{row.original.sku ?? "—"}</span>,
      },
      {
        accessorKey: "unit",
        header: "Unit",
      },
      {
        accessorKey: "stockOnHand",
        header: "Stock on hand",
        cell: ({ row }) => <span className="tabular-nums">{row.original.stockOnHand}</span>,
      },
      {
        accessorKey: "reorderLevel",
        header: "Reorder level",
        cell: ({ row }) => (
          <span className="tabular-nums text-zinc-500">{row.original.reorderLevel ?? "—"}</span>
        ),
      },
      {
        accessorKey: "valuation",
        header: "Valuation",
        cell: ({ row }) => <Money amount={row.original.valuation} />,
      },
    ],
    [],
  );

  return <DataTable columns={columns} data={items} isLoading={isLoading} />;
}
