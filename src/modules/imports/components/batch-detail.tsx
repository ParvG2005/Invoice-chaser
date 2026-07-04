"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Download, Undo2 } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { BadgeProps } from "@/components/ui/badge";
import type {
  ImportBatchDto,
  ImportRecordDto,
} from "@/server/services/import/tally-import.service";

const ACTION_VARIANT: Record<ImportRecordDto["action"], BadgeProps["variant"]> = {
  CREATED: "success",
  UPDATED: "secondary",
  SKIPPED: "warning",
  ERRORED: "danger",
};

const UNDOABLE_STATUSES: ImportBatchDto["status"][] = ["COMPLETED", "FAILED"];

interface BatchDetailProps {
  batchId: string;
  onClose: () => void;
}

export function BatchDetail({ batchId, onClose }: BatchDetailProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["import-batch", batchId],
    queryFn: () =>
      apiFetch<{ batch: ImportBatchDto; records: ImportRecordDto[] }>(
        `/api/import/batches/${batchId}`,
      ),
    refetchInterval: (query) => {
      const status = query.state.data?.batch?.status;
      return status && status !== "PROCESSING" && status !== "PENDING" ? false : 2000;
    },
  });

  const undo = useMutation({
    mutationFn: () =>
      apiFetch<{ batch: ImportBatchDto }>(`/api/import/batches/${batchId}/undo`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Import batch reverted");
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
      queryClient.invalidateQueries({ queryKey: ["import-batch", batchId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleUndo = () => {
    if (!data) return;
    const { createdCount, updatedCount } = data.batch;
    const confirmed = window.confirm(
      `This reverts ${createdCount} created and ${updatedCount} updated records. Continue?`,
    );
    if (confirmed) undo.mutate();
  };

  const handleDownload = () => {
    window.open(`/api/import/batches/${batchId}/report`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold">Import batch detail</h2>
            {data && <p className="text-sm text-zinc-500">{data.batch.fileName ?? "—"}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {isLoading || !data ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">Created {data.batch.createdCount}</Badge>
                <Badge variant="secondary">Updated {data.batch.updatedCount}</Badge>
                <Badge variant="warning">Skipped {data.batch.skippedCount}</Badge>
                <Badge variant="danger">Errored {data.batch.erroredCount}</Badge>
              </div>

              {data.batch.error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
                  {data.batch.error}
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Type</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Action</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records.map((record) => (
                      <tr key={record.id} className="border-t border-zinc-100 dark:border-zinc-800">
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
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <Button variant="outline" onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Download report
          </Button>
          {data && UNDOABLE_STATUSES.includes(data.batch.status) && (
            <Button
              variant="outline"
              onClick={handleUndo}
              disabled={undo.isPending}
              className="gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20"
            >
              <Undo2 className="h-4 w-4" />
              {undo.isPending ? "Reverting..." : "Undo"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
