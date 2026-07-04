"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, X, AlertTriangle, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api/client";
import { MAX_TALLY_XML_BYTES } from "@/lib/validations/import";
import { parseLedgers, parseStockItems } from "@/lib/import/tally/parse-masters";
import { parseVouchers } from "@/lib/import/tally/parse-vouchers";
import type { ParseResult, ParseWarning, TallyLedger, TallyStockItem, TallyVoucher } from "@/lib/import/tally/types";
import type { ImportBatchDto } from "@/server/services/import/tally-import.service";
import type { TallyImportSource } from "@/server/services/import/tally-import.service";

type StepKey = "ledgers" | "stockitems" | "vouchers";

interface StepConfig {
  key: StepKey;
  label: string;
  hint: string;
  source: TallyImportSource;
  parse: (xml: string) => ParseResult<TallyLedger> | ParseResult<TallyStockItem> | ParseResult<TallyVoucher>;
}

const STEPS: StepConfig[] = [
  {
    key: "ledgers",
    label: "Upload masters — Ledgers",
    hint: "Gateway of Tally → Display → Export → XML (Ledgers)",
    source: "TALLY_MASTERS_LEDGERS",
    parse: parseLedgers,
  },
  {
    key: "stockitems",
    label: "Upload masters — Stock Items",
    hint: "Gateway of Tally → Display → Export → XML (Stock Items)",
    source: "TALLY_MASTERS_STOCKITEMS",
    parse: parseStockItems,
  },
  {
    key: "vouchers",
    label: "Upload vouchers",
    hint: "Gateway of Tally → Display → Export → XML (Vouchers)",
    source: "TALLY_VOUCHERS",
    parse: parseVouchers,
  },
];

const NON_TERMINAL_STATUSES: ImportBatchDto["status"][] = ["PENDING", "PROCESSING"];

interface Preview {
  fileName: string;
  xml: string;
  count: number;
  warnings: ParseWarning[];
  kindBreakdown?: Record<string, number>;
  missingContactCount?: number;
}

interface ImportWizardProps {
  onClose: () => void;
}

export function ImportWizard({ onClose }: ImportWizardProps) {
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  const startImport = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Nothing parsed yet");
      return apiFetch<{ batch: ImportBatchDto }>("/api/import/tally", {
        method: "POST",
        body: JSON.stringify({ source: step.source, fileName: preview.fileName, xml: preview.xml }),
      });
    },
    onSuccess: (data) => {
      setBatchId(data.batch.id);
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
      toast.success(`Import started for ${step.label}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: batchData } = useQuery({
    queryKey: ["import-batch", batchId],
    queryFn: () => apiFetch<{ batch: ImportBatchDto }>(`/api/import/batches/${batchId}`),
    enabled: !!batchId,
    refetchInterval: (query) => {
      const status = query.state.data?.batch?.status;
      return status && !NON_TERMINAL_STATUSES.includes(status) ? false : 2000;
    },
  });

  const batch = batchData?.batch;
  const isTerminal = !!batch && !NON_TERMINAL_STATUSES.includes(batch.status);

  const resetStepState = () => {
    setPreview(null);
    setBatchId(null);
  };

  const goToNextStep = () => {
    if (isLastStep) {
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
      onClose();
      return;
    }
    resetStepState();
    setStepIndex((i) => i + 1);
  };

  const handleSkip = () => {
    resetStepState();
    goToNextStep();
  };

  const handleFile = async (file: File) => {
    if (file.size > MAX_TALLY_XML_BYTES) {
      toast.error(
        `File exceeds ${Math.round(MAX_TALLY_XML_BYTES / (1024 * 1024))} MB — split the Tally export by period`,
      );
      return;
    }
    const xml = await file.text();
    try {
      const result = step.parse(xml);
      let kindBreakdown: Record<string, number> | undefined;
      let missingContactCount: number | undefined;

      if (step.key === "vouchers") {
        const records = result.records as TallyVoucher[];
        kindBreakdown = {};
        for (const record of records) {
          kindBreakdown[record.kind] = (kindBreakdown[record.kind] ?? 0) + 1;
        }
      } else if (step.key === "ledgers") {
        const records = result.records as TallyLedger[];
        missingContactCount = records.filter((r) => !r.email).length;
      }

      setPreview({
        fileName: file.name,
        xml,
        count: result.records.length,
        warnings: result.warnings,
        kindBreakdown,
        missingContactCount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse Tally XML";
      toast.error(message);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold">Import from Tally</h2>
            <p className="text-sm text-zinc-500">Upload masters and vouchers, one file at a time</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex flex-col gap-2 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:gap-4">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`flex items-center gap-2 text-sm font-medium ${
                i === stepIndex
                  ? "text-zinc-900 dark:text-zinc-100"
                  : i < stepIndex
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-400"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  i === stepIndex
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : i < stepIndex
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
                      : "bg-zinc-100 dark:bg-zinc-800"
                }`}
              >
                {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s.label}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="rounded-lg bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            {step.hint}
          </div>

          {!batchId && !preview && (
            <div
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 transition-colors cursor-pointer ${
                dragging
                  ? "border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/20"
                  : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mb-3 h-8 w-8 text-zinc-400" />
              <p className="font-medium text-zinc-700 dark:text-zinc-300">Drag & drop or click to browse</p>
              <p className="mt-1 text-sm text-zinc-400">.xml TallyPrime export files</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {!batchId && preview && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{preview.fileName}</span>
                <span className="ml-auto">
                  <span className="font-semibold text-emerald-600">{preview.count}</span> record
                  {preview.count !== 1 ? "s" : ""} parsed
                </span>
              </div>

              {preview.kindBreakdown && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(preview.kindBreakdown).map(([kind, count]) => (
                    <Badge key={kind} variant="secondary">
                      {kind}: {count}
                    </Badge>
                  ))}
                </div>
              )}

              {typeof preview.missingContactCount === "number" && preview.missingContactCount > 0 && (
                <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {preview.missingContactCount} part
                  {preview.missingContactCount !== 1 ? "ies have" : "y has"} no email — reminders
                  can&apos;t be sent; fill it on the Party page after import.
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="max-h-32 overflow-auto rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {w.path}: {w.message}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setPreview(null)}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
              >
                Choose different file
              </button>
            </div>
          )}

          {batchId && (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-xs text-zinc-500">
                  <span>{batch?.status ?? "Starting…"}</span>
                  <span>
                    {batch?.processedCount ?? 0}/{batch?.totalCount ?? preview?.count ?? 0}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{
                      width: `${
                        batch && batch.totalCount > 0
                          ? Math.min(100, (batch.processedCount / batch.totalCount) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {isTerminal && batch && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="success">Created {batch.createdCount}</Badge>
                  <Badge variant="secondary">Updated {batch.updatedCount}</Badge>
                  <Badge variant="warning">Skipped {batch.skippedCount}</Badge>
                  <Badge variant="danger">Errored {batch.erroredCount}</Badge>
                </div>
              )}

              {isTerminal && batch?.error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
                  {batch.error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          {!batchId && (
            <Button variant="outline" onClick={handleSkip}>
              Skip this step
            </Button>
          )}
          {!batchId && (
            <Button
              disabled={!preview || startImport.isPending}
              onClick={() => startImport.mutate()}
            >
              {startImport.isPending ? "Starting..." : "Start import"}
            </Button>
          )}
          {batchId && isTerminal && (
            <Button onClick={goToNextStep}>{isLastStep ? "Finish" : "Next step"}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
