"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { apiFetch } from "@/lib/api/client";
import { DataTable } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { Skeleton } from "@/components/ui/skeleton";

interface AgentRollupEntry {
  party: { id: string; name: string };
  outstanding: string;
}

/** "Managed parties" section on an AGENT-type party's detail page. */
export function AgentRollup({ agentPartyId }: { agentPartyId: string }) {
  const { data: rollup, isLoading } = useQuery({
    queryKey: ["party-rollup", agentPartyId],
    queryFn: () => apiFetch<AgentRollupEntry[]>(`/api/parties/${agentPartyId}/rollup`),
  });

  const total = useMemo(
    () => (rollup ?? []).reduce((sum, entry) => sum + Number(entry.outstanding), 0),
    [rollup],
  );

  const columns = useMemo<ColumnDef<AgentRollupEntry, unknown>[]>(
    () => [
      {
        id: "party",
        header: "Party",
        cell: ({ row }) => (
          <Link
            href={`/dashboard/parties/${row.original.party.id}`}
            className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            {row.original.party.name}
          </Link>
        ),
      },
      {
        accessorKey: "outstanding",
        header: "Outstanding",
        cell: ({ row }) => <Money amount={row.original.outstanding} />,
      },
    ],
    [],
  );

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Managed parties</h2>
      <DataTable columns={columns} data={rollup ?? []} />
      <div
        role="row"
        className="flex items-center justify-between rounded-lg border px-4 py-2 text-sm font-semibold"
      >
        <span>Total outstanding</span>
        <Money amount={total} />
      </div>
    </div>
  );
}
