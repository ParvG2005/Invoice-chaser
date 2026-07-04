"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { BadgeProps } from "@/components/ui/badge";
import type { ImportBatchDto } from "@/server/services/import/tally-import.service";

const SOURCE_LABEL: Record<ImportBatchDto["source"], string> = {
  TALLY_MASTERS_LEDGERS: "Ledgers (Parties)",
  TALLY_MASTERS_STOCKITEMS: "Stock Items",
  TALLY_VOUCHERS: "Vouchers",
};

const STATUS_VARIANT: Record<ImportBatchDto["status"], BadgeProps["variant"]> = {
  PENDING: "secondary",
  PROCESSING: "warning",
  COMPLETED: "success",
  FAILED: "danger",
  REVERTED: "secondary",
};

const NON_TERMINAL: ImportBatchDto["status"][] = ["PENDING", "PROCESSING"];

interface BatchListProps {
  onSelect: (batchId: string) => void;
}

export function BatchList({ onSelect }: BatchListProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["import-batches"],
    queryFn: () => apiFetch<{ batches: ImportBatchDto[] }>("/api/import/batches"),
    refetchInterval: (query) => {
      const batches = query.state.data?.batches ?? [];
      return batches.some((b) => NON_TERMINAL.includes(b.status)) ? 2000 : false;
    },
  });

  const batches = data?.batches ?? [];

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (batches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800">
        No imports yet. Click &quot;New import&quot; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Source</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">File</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Status</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Progress</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Created</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Updated</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Skipped</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Errored</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Created At</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr
              key={batch.id}
              onClick={() => onSelect(batch.id)}
              className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
            >
              <td className="px-4 py-3 font-medium">{SOURCE_LABEL[batch.source]}</td>
              <td className="px-4 py-3 text-zinc-500">{batch.fileName ?? "—"}</td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANT[batch.status]}>{batch.status}</Badge>
              </td>
              <td className="px-4 py-3">
                {batch.processedCount}/{batch.totalCount}
              </td>
              <td className="px-4 py-3">{batch.createdCount}</td>
              <td className="px-4 py-3">{batch.updatedCount}</td>
              <td className="px-4 py-3">{batch.skippedCount}</td>
              <td className="px-4 py-3">{batch.erroredCount}</td>
              <td className="px-4 py-3 text-zinc-500">
                {new Date(batch.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
