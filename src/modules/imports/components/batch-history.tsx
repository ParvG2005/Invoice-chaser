"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Undo2, ChevronDown, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { BadgeProps } from "@/components/ui/badge";
import type { ImportBatchDto, ImportRecordDto } from "@/server/services/import/tally-import.service";

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

const ACTION_VARIANT: Record<ImportRecordDto["action"], BadgeProps["variant"]> = {
  CREATED: "success",
  UPDATED: "secondary",
  SKIPPED: "warning",
  ERRORED: "danger",
};

const NON_TERMINAL: ImportBatchDto["status"][] = ["PENDING", "PROCESSING"];
const UNDOABLE_STATUSES: ImportBatchDto["status"][] = ["COMPLETED", "FAILED"];

/** Batch history table (Stitch design) with per-row download/undo and an
 * expandable record-level detail panel — replaces the old modal-based
 * BatchDetail. */
export function BatchHistory() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [undoTargetId, setUndoTargetId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["import-batches"],
    queryFn: () => apiFetch<{ batches: ImportBatchDto[] }>("/api/import/batches"),
    refetchInterval: (query) => {
      const batches = query.state.data?.batches ?? [];
      return batches.some((b) => NON_TERMINAL.includes(b.status)) ? 2000 : false;
    },
  });

  const batches = data?.batches ?? [];
  const undoTarget = batches.find((b) => b.id === undoTargetId) ?? null;

  const undo = useMutation({
    mutationFn: (batchId: string) =>
      apiFetch<{ batch: ImportBatchDto }>(`/api/import/batches/${batchId}/undo`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Import batch reverted");
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
      queryClient.invalidateQueries({ queryKey: ["import-batch", undoTargetId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section aria-label="Batch history" className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">Batch history</h2>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : batches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No imports yet. Upload a file above to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="w-8" />
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Source</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">File</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">New</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Upd.</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Skp.</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Err.</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <BatchRow
                  key={batch.id}
                  batch={batch}
                  expanded={expandedId === batch.id}
                  onToggle={() => setExpandedId((id) => (id === batch.id ? null : batch.id))}
                  onUndo={() => setUndoTargetId(batch.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!undoTargetId}
        onOpenChange={(open) => !open && setUndoTargetId(null)}
        title="Undo this import batch?"
        description={
          undoTarget
            ? `This reverts ${undoTarget.createdCount} created and ${undoTarget.updatedCount} updated records.`
            : ""
        }
        confirmLabel="Undo"
        destructive
        onConfirm={() => {
          if (undoTargetId) undo.mutate(undoTargetId);
          setUndoTargetId(null);
        }}
      />
    </section>
  );
}

function BatchRow({
  batch,
  expanded,
  onToggle,
  onUndo,
}: {
  batch: ImportBatchDto;
  expanded: boolean;
  onToggle: () => void;
  onUndo: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["import-batch", batch.id],
    queryFn: () => apiFetch<{ batch: ImportBatchDto; records: ImportRecordDto[] }>(`/api/import/batches/${batch.id}`),
    enabled: expanded,
  });

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
      >
        <td className="px-2 text-zinc-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-4 py-3 text-zinc-500">{new Date(batch.createdAt).toLocaleString()}</td>
        <td className="px-4 py-3 font-medium">{SOURCE_LABEL[batch.source]}</td>
        <td className="px-4 py-3 text-zinc-500">{batch.fileName ?? "—"}</td>
        <td className="px-4 py-3">
          <Badge variant={STATUS_VARIANT[batch.status]}>{batch.status}</Badge>
        </td>
        <td className="px-4 py-3">{batch.createdCount}</td>
        <td className="px-4 py-3">{batch.updatedCount}</td>
        <td className="px-4 py-3">{batch.skippedCount}</td>
        <td className="px-4 py-3">{batch.erroredCount}</td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(`/api/import/batches/${batch.id}/report`, "_blank")}
            >
              <Download className="h-4 w-4" />
              Download report
            </Button>
            {UNDOABLE_STATUSES.includes(batch.status) && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-red-600 dark:text-red-400" onClick={onUndo}>
                <Undo2 className="h-4 w-4" />
                Undo
              </Button>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-t border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30">
          <td colSpan={10} className="px-6 py-4">
            {batch.error && (
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
                {batch.error}
              </div>
            )}
            {!data ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-100 dark:bg-zinc-900">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Type</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Action</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records.map((record) => (
                      <tr key={record.id} className="border-t border-zinc-200 dark:border-zinc-800">
                        <td className="px-3 py-2 font-medium">{record.entityType}</td>
                        <td className="px-3 py-2">
                          <Badge variant={ACTION_VARIANT[record.action]}>{record.action}</Badge>
                        </td>
                        <td className="px-3 py-2 text-zinc-500">{record.message ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
