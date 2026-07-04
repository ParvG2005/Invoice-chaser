"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { cn } from "@/lib/utils/cn";
import type { PartyDto, PartyType } from "@/types";

const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  CUSTOMER: "Customer",
  SUPPLIER: "Supplier",
  AGENT: "Agent",
  BOTH: "Customer & Supplier",
};

const PARTY_TYPE_STYLES: Record<PartyType, string> = {
  CUSTOMER: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  SUPPLIER: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  AGENT: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  BOTH: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30",
};

/**
 * Minimal, party-type-specific badge — deliberately separate from
 * `StatusChip` (`src/components/shared/status-chip.tsx`), whose
 * `ChipStatus` union is invoice-status-specific and shouldn't be widened
 * to cover an unrelated domain.
 */
export function PartyTypeBadge({ type }: { type: PartyType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        PARTY_TYPE_STYLES[type],
      )}
    >
      {PARTY_TYPE_LABELS[type]}
    </span>
  );
}

export function PartyTable({
  parties,
  isLoading = false,
}: {
  parties: PartyDto[];
  isLoading?: boolean;
}) {
  const partiesById = useMemo(() => {
    const map = new Map<string, PartyDto>();
    for (const party of parties) map.set(party.id, party);
    return map;
  }, [parties]);

  const columns = useMemo<ColumnDef<PartyDto, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/dashboard/parties/${row.original.id}`}
            className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => <PartyTypeBadge type={row.original.type} />,
      },
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => (
          <div className="text-sm text-zinc-500">
            {row.original.email ?? "—"}
            {row.original.phone && <div className="text-xs text-zinc-400">{row.original.phone}</div>}
          </div>
        ),
      },
      {
        id: "agent",
        header: "Agent",
        cell: ({ row }) => {
          const agent = row.original.agentId ? partiesById.get(row.original.agentId) : undefined;
          return <span className="text-sm text-zinc-500">{agent?.name ?? "—"}</span>;
        },
      },
    ],
    [partiesById],
  );

  return <DataTable columns={columns} data={parties} isLoading={isLoading} />;
}
