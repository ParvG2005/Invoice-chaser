"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, AlertTriangle, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api/client";
import { MAX_TALLY_XML_BYTES } from "@/lib/validations/import";
import { parseLedgers, parseStockItems } from "@/lib/import/tally/parse-masters";
import { parseVouchers } from "@/lib/import/tally/parse-vouchers";
import { parseCsv } from "@/lib/import/csv-parser";
import { formatCurrency } from "@/lib/utils/currency";
import type { ParseResult, ParseWarning, TallyLedger, TallyStockItem, TallyVoucher } from "@/lib/import/tally/types";
import type { ExtractedInvoice } from "@/lib/import/pdf";
import type { CreateInvoiceInput, PdfImportInvoiceInput } from "@/lib/validations/invoice";
import type { ApiResponse, InvoiceDto } from "@/types";
import type { ImportBatchDto } from "@/server/services/import/tally-import.service";
import type { TallyImportSource } from "@/server/services/import/tally-import.service";

type SourceKey = "ledgers" | "stockitems" | "vouchers" | "csv-invoices" | "pdf-invoices";

interface TallySourceConfig {
  key: Exclude<SourceKey, "csv-invoices" | "pdf-invoices">;
  label: string;
  hint: string;
  accept: string;
  source: TallyImportSource;
  parse: (xml: string) => ParseResult<TallyLedger> | ParseResult<TallyStockItem> | ParseResult<TallyVoucher>;
}

const TALLY_SOURCES: TallySourceConfig[] = [
  {
    key: "ledgers",
    label: "Ledgers",
    hint: "Gateway of Tally → Display → Export → XML (Ledgers)",
    accept: ".xml",
    source: "TALLY_MASTERS_LEDGERS",
    parse: parseLedgers,
  },
  {
    key: "stockitems",
    label: "Stock Items",
    hint: "Gateway of Tally → Display → Export → XML (Stock Items)",
    accept: ".xml",
    source: "TALLY_MASTERS_STOCKITEMS",
    parse: parseStockItems,
  },
  {
    key: "vouchers",
    label: "Vouchers",
    hint: "Gateway of Tally → Display → Export → XML (Vouchers)",
    accept: ".xml",
    source: "TALLY_VOUCHERS",
    parse: parseVouchers,
  },
];

const NON_TERMINAL_STATUSES: ImportBatchDto["status"][] = ["PENDING", "PROCESSING"];

interface TallyPreview {
  kind: "tally";
  fileName: string;
  xml: string;
  count: number;
  warnings: ParseWarning[];
  kindBreakdown?: Record<string, number>;
  missingContactCount?: number;
}

interface CsvPreview {
  kind: "csv";
  fileName: string;
  invoices: CreateInvoiceInput[];
  errors: string[];
}

interface PdfPreview {
  kind: "pdf";
  results: ExtractedInvoice[];
}

type Preview = TallyPreview | CsvPreview | PdfPreview;

/** Add whole days to an ISO yyyy-mm-dd date, returning ISO yyyy-mm-dd (UTC, no tz drift). */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Basic email-format check — a client-side filter to keep malformed emails
 * (parsed or user-typed) from tripping `bulkCreateInvoicesSchema`'s
 * `z.string().email()` and 422-ing the entire batch. Not exhaustive; the
 * server remains the source of truth. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (email: string) => EMAIL_RE.test(email);

/**
 * Page-embedded import wizard (Stitch "Imports Wizard" design). Source is
 * chosen up front via tabs; each source runs its own Upload → Preview → Done
 * flow. Tally sources create a polled ImportBatch (real API: POST
 * /api/import/tally auto-starts processing, no separate commit step). CSV
 * invoice import stays on the pre-existing synchronous /api/invoices/bulk
 * endpoint — it does not produce an ImportBatch, so it never appears in
 * Batch history below.
 */
export function ImportWizard() {
  const queryClient = useQueryClient();
  const [sourceKey, setSourceKey] = useState<SourceKey>("ledgers");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [netDays, setNetDays] = useState(30);
  const [emailOverrides, setEmailOverrides] = useState<Record<number, string>>({});
  const [nameOverrides, setNameOverrides] = useState<Record<number, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const tallySource = TALLY_SOURCES.find((s) => s.key === sourceKey);

  const startTallyImport = useMutation({
    mutationFn: () => {
      if (!preview || preview.kind !== "tally" || !tallySource) throw new Error("Nothing parsed yet");
      return apiFetch<{ batch: ImportBatchDto }>("/api/import/tally", {
        method: "POST",
        body: JSON.stringify({ source: tallySource.source, fileName: preview.fileName, xml: preview.xml }),
      });
    },
    onSuccess: (data) => {
      setBatchId(data.batch.id);
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
      toast.success(`Import started for ${tallySource?.label}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startCsvImport = useMutation({
    mutationFn: (invoices: CreateInvoiceInput[]) =>
      apiFetch<InvoiceDto[]>("/api/invoices/bulk", {
        method: "POST",
        body: JSON.stringify({ invoices }),
      }),
    onSuccess: (data) => {
      toast.success(`Imported ${data.length} invoice${data.length !== 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // PDF import commits to its own endpoint (not /api/invoices/bulk) so it can
  // enrich master data — upsert the buyer Party + per-line Stock Items — which
  // the generic CSV bulk path deliberately does not do. Payload is JSON, so
  // apiFetch is fine here (unlike the multipart parse call below).
  const startPdfImport = useMutation({
    mutationFn: (invoices: PdfImportInvoiceInput[]) =>
      apiFetch<InvoiceDto[]>("/api/import/pdf-invoices/commit", {
        method: "POST",
        body: JSON.stringify({ invoices }),
      }),
    onSuccess: (data) => {
      toast.success(`Imported ${data.length} invoice${data.length !== 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // apiFetch hardcodes a JSON Content-Type header, which breaks
  // request.formData() on the server for multipart uploads — use a raw
  // fetch here and unwrap the { success, data, error } envelope by hand.
  const parsePdfMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const response = await fetch("/api/import/pdf-invoices/parse", { method: "POST", body: form });
      const json = (await response.json()) as ApiResponse<{ results: ExtractedInvoice[] }>;
      if (!json.success) throw new Error(json.error.message);
      return json.data.results;
    },
    onSuccess: (results) => {
      setPreview({ kind: "pdf", results });
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
  const isTallyTerminal = !!batch && !NON_TERMINAL_STATUSES.includes(batch.status);
  const isCsvDone = startCsvImport.isSuccess;
  const isPdfDone = startPdfImport.isSuccess;
  const isBulkDone = isCsvDone || isPdfDone;
  const isBulkSource = sourceKey === "csv-invoices" || sourceKey === "pdf-invoices";

  /** An import is mid-flight (parsing PDFs, committing rows, or a Tally batch
   * still processing). Switching source tabs calls reset(), which wipes that
   * state — so we block the switch while this is true rather than silently
   * cancelling the user's import. */
  const isImporting =
    parsePdfMutation.isPending ||
    startPdfImport.isPending ||
    startCsvImport.isPending ||
    startTallyImport.isPending ||
    (!!batchId && !isTallyTerminal);

  const stepIndex = !preview ? 0 : isBulkSource ? (isBulkDone ? 2 : 1) : batchId ? (isTallyTerminal ? 2 : 1) : 1;

  const reset = () => {
    setPreview(null);
    setBatchId(null);
    setNetDays(30);
    setEmailOverrides({});
    setNameOverrides({});
    startCsvImport.reset();
    startPdfImport.reset();
    parsePdfMutation.reset();
  };

  const handleSourceChange = (key: string) => {
    if (key === sourceKey) return;
    if (isImporting) {
      toast.error("Finish or cancel the current import before switching tabs.");
      return;
    }
    setSourceKey(key as SourceKey);
    reset();
  };

  const handleTallyFile = async (config: TallySourceConfig, file: File) => {
    if (file.size > MAX_TALLY_XML_BYTES) {
      toast.error(
        `File exceeds ${Math.round(MAX_TALLY_XML_BYTES / (1024 * 1024))} MB — split the Tally export by period`,
      );
      return;
    }
    const xml = await file.text();
    try {
      const result = config.parse(xml);
      let kindBreakdown: Record<string, number> | undefined;
      let missingContactCount: number | undefined;

      if (config.key === "vouchers") {
        const records = result.records as TallyVoucher[];
        kindBreakdown = {};
        for (const record of records) {
          kindBreakdown[record.kind] = (kindBreakdown[record.kind] ?? 0) + 1;
        }
      } else if (config.key === "ledgers") {
        const records = result.records as TallyLedger[];
        missingContactCount = records.filter((r) => !r.email).length;
      }

      setPreview({
        kind: "tally",
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

  const handleCsvFile = async (file: File) => {
    const result = await parseCsv(file);
    setPreview({ kind: "csv", fileName: file.name, invoices: result.invoices, errors: result.errors });
  };

  const handlePdfFiles = (files: File[]) => {
    parsePdfMutation.mutate(files);
  };

  const handleFile = (file: File) => {
    if (sourceKey === "csv-invoices") {
      void handleCsvFile(file);
    } else if (tallySource) {
      void handleTallyFile(tallySource, file);
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    if (sourceKey === "pdf-invoices") {
      handlePdfFiles(arr);
    } else {
      handleFile(arr[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const csvPreview = preview?.kind === "csv" ? preview : null;
  const csvValidInvoices = csvPreview?.invoices.filter((inv) => inv.clientEmail) ?? [];
  const tallyPreview = preview?.kind === "tally" ? preview : null;

  const pdfPreview = preview?.kind === "pdf" ? preview : null;
  /** Row's invoice with the user's net-N days and any typed-in email applied, plus the enrichment fields (GSTIN/address) the commit endpoint upserts onto the buyer Party. Keyed by row index (stable within a single parse result set) rather than fileName, since two uploaded files can share the same name. */
  const effectivePdfInvoice = (r: ExtractedInvoice, index: number): PdfImportInvoiceInput | null => {
    if (!r.invoice) return null;
    const email = emailOverrides[index]?.trim() || r.invoice.clientEmail;
    const clientName = nameOverrides[index]?.trim() || r.invoice.clientName;
    const dueDate = r.invoiceDate ? addDaysIso(r.invoiceDate, netDays) : r.invoice.dueDate;
    return {
      ...r.invoice,
      clientName,
      clientEmail: email,
      dueDate,
      buyerGstin: r.buyerGstin,
      buyerAddress: r.buyerAddress,
    };
  };
  const emailOk = (email?: string | null) => {
    const v = (email ?? "").trim();
    return v === "" || isValidEmail(v);
  };
  const pdfEffective = (pdfPreview?.results ?? [])
    .map((r, i) => effectivePdfInvoice(r, i))
    .filter((inv): inv is PdfImportInvoiceInput => !!inv);
  // Email is OPTIONAL for import: the invoice still imports with a blank email
  // (reminders just can't send until it's filled — same policy as the Tally
  // path). Only a NON-EMPTY, malformed email blocks a row, since the server
  // rejects that specific case.
  const pdfValidInvoices = pdfEffective.filter((inv) => emailOk(inv.clientEmail));
  const pdfBlockedCount = pdfEffective.length - pdfValidInvoices.length;
  const pdfMissingEmailCount = pdfValidInvoices.filter(
    (inv) => (inv.clientEmail ?? "").trim() === "",
  ).length;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {/* Header + stepper */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold">Import from Tally, CSV, or PDF</h2>
          <p className="text-sm text-zinc-500">Review and start imports into your records.</p>
        </div>
        <ol className="flex items-center gap-2 text-xs" aria-label="Import progress">
          {["Upload", "Preview", "Done"].map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full font-bold ${
                  i < stepIndex
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
                    : i === stepIndex
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                }`}
              >
                {i < stepIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={i === stepIndex ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}>
                {label}
              </span>
              {i < 2 && <span className="h-px w-6 bg-zinc-200 dark:bg-zinc-800" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="p-6">
        <Tabs value={sourceKey} onValueChange={handleSourceChange}>
          <TabsList>
            {TALLY_SOURCES.map((s) => (
              <TabsTrigger key={s.key} value={s.key} disabled={isImporting && s.key !== sourceKey}>
                {s.label}
              </TabsTrigger>
            ))}
            <TabsTrigger value="csv-invoices" disabled={isImporting && sourceKey !== "csv-invoices"}>
              CSV Invoices
            </TabsTrigger>
            <TabsTrigger value="pdf-invoices" disabled={isImporting && sourceKey !== "pdf-invoices"}>
              PDF Invoices
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            {sourceKey === "csv-invoices"
              ? "Standard or TallyPrime CSV export. Required columns: clientName, clientEmail, amount, dueDate, invoiceNumber."
              : sourceKey === "pdf-invoices"
                ? "TallyPrime sales-invoice PDF exports. Upload one or more PDFs — invoice fields are extracted automatically."
                : tallySource?.hint}
          </div>

          {/* Dropzone */}
          {!batchId && !isCsvDone && !preview && !parsePdfMutation.isPending && (
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
              <p className="mt-1 text-sm text-zinc-400">
                {sourceKey === "csv-invoices"
                  ? ".csv files"
                  : sourceKey === "pdf-invoices"
                    ? ".pdf files (multiple allowed)"
                    : ".xml TallyPrime export files"}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept={sourceKey === "csv-invoices" ? ".csv" : sourceKey === "pdf-invoices" ? ".pdf" : ".xml"}
                multiple={sourceKey === "pdf-invoices"}
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files ?? []);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {parsePdfMutation.isPending && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 py-10 text-sm text-zinc-500 dark:border-zinc-700">
              Parsing PDFs…
            </div>
          )}

          {/* Preview: Tally */}
          {tallyPreview && !batchId && (
            <div data-testid="import-preview" className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{tallyPreview.fileName}</span>
                <span className="ml-auto">
                  <span className="font-semibold text-emerald-600">{tallyPreview.count}</span> record
                  {tallyPreview.count !== 1 ? "s" : ""} parsed
                </span>
              </div>

              {tallyPreview.kindBreakdown && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(tallyPreview.kindBreakdown).map(([kind, count]) => (
                    <Badge key={kind} variant="secondary">
                      {kind}: {count}
                    </Badge>
                  ))}
                </div>
              )}

              {typeof tallyPreview.missingContactCount === "number" && tallyPreview.missingContactCount > 0 && (
                <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {tallyPreview.missingContactCount} part
                  {tallyPreview.missingContactCount !== 1 ? "ies have" : "y has"} no email — reminders
                  can&apos;t be sent; fill it on the Party page after import.
                </div>
              )}

              {tallyPreview.warnings.length > 0 && (
                <div className="max-h-32 overflow-auto rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                  {tallyPreview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {w.path}: {w.message}
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setPreview(null)} className="text-xs text-zinc-400 hover:text-zinc-600">
                Choose different file
              </button>
            </div>
          )}

          {/* Preview: CSV invoices */}
          {csvPreview && !isCsvDone && (
            <div data-testid="import-preview" className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{csvPreview.fileName}</span>
                <span className="ml-auto">
                  <span className="font-semibold text-emerald-600">{csvPreview.invoices.length}</span> record
                  {csvPreview.invoices.length !== 1 ? "s" : ""} parsed —{" "}
                  <span className="font-semibold text-emerald-600">{csvValidInvoices.length}</span> ready to import
                  {csvPreview.errors.length > 0 && (
                    <span className="ml-2 text-red-500">
                      • {csvPreview.errors.length} error{csvPreview.errors.length > 1 ? "s" : ""}
                    </span>
                  )}
                </span>
              </div>

              {csvPreview.errors.length > 0 && (
                <div className="max-h-32 overflow-auto rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/30">
                  {csvPreview.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-0.5 text-xs text-red-700 dark:text-red-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {err}
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setPreview(null)} className="text-xs text-zinc-400 hover:text-zinc-600">
                Choose different file
              </button>
            </div>
          )}

          {/* Preview: PDF invoices */}
          {pdfPreview && !isPdfDone && (
            <div data-testid="import-preview" className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{pdfPreview.results.length} file{pdfPreview.results.length !== 1 ? "s" : ""} parsed</span>
                <span>
                  <span className="font-semibold text-emerald-600">{pdfValidInvoices.length}</span> ready to import
                </span>
                <label className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
                  Net
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={netDays}
                    onChange={(e) => setNetDays(Math.max(0, Number(e.target.value) || 0))}
                    className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  days
                </label>
              </div>

              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">File</th>
                      <th className="px-3 py-2 font-medium">Method</th>
                      <th className="px-3 py-2 font-medium">Invoice #</th>
                      <th className="px-3 py-2 font-medium">Client</th>
                      <th className="px-3 py-2 font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Due date</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {pdfPreview.results.map((r, i) => {
                      const effective = effectivePdfInvoice(r, i);
                      const emailValue = (effective?.clientEmail ?? "").trim();
                      const emailBad = !!effective && emailValue !== "" && !isValidEmail(emailValue);
                      const showEmailInput = !!effective && (emailBad || emailValue === "");
                      return (
                        <tr key={`${r.fileName}-${i}`} className={r.method === "failed" ? "bg-red-50 dark:bg-red-950/20" : undefined}>
                          <td className="px-3 py-2">{r.fileName}</td>
                          <td className="px-3 py-2">
                            <Badge variant={r.method === "failed" ? "danger" : r.method === "llm" ? "warning" : "secondary"}>
                              {r.method}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{r.invoice?.invoiceNumber ?? "—"}</td>
                          <td className="px-3 py-2">
                            {r.invoice ? (
                              <input
                                type="text"
                                value={nameOverrides[i] ?? r.invoice.clientName}
                                onChange={(e) =>
                                  setNameOverrides((prev) => ({ ...prev, [i]: e.target.value }))
                                }
                                className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                              />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2">{r.invoice ? formatCurrency(r.invoice.amount, "INR") : "—"}</td>
                          <td className="px-3 py-2">{effective?.dueDate ?? "—"}</td>
                          <td className="px-3 py-2">
                            {r.invoice && showEmailInput ? (
                              <input
                                type="email"
                                placeholder="optional — for reminders"
                                value={emailOverrides[i] ?? r.invoice.clientEmail}
                                onChange={(e) =>
                                  setEmailOverrides((prev) => ({ ...prev, [i]: e.target.value }))
                                }
                                className={`w-full rounded border bg-white px-2 py-1 text-xs dark:bg-zinc-900 ${
                                  emailBad
                                    ? "border-red-400 dark:border-red-700"
                                    : "border-zinc-300 dark:border-zinc-700"
                                }`}
                              />
                            ) : (
                              r.invoice?.clientEmail ?? "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pdfPreview.results.some((r) => r.warnings.length > 0) && (
                <div className="max-h-32 overflow-auto rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                  {pdfPreview.results.flatMap((r) =>
                    r.warnings.map((w, i) => (
                      <div key={`${r.fileName}-${i}`} className="flex items-start gap-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {r.fileName}: {w}
                      </div>
                    )),
                  )}
                </div>
              )}

              {pdfBlockedCount > 0 && (
                <div className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {pdfBlockedCount} row{pdfBlockedCount !== 1 ? "s have" : " has"} an invalid email —
                  fix it in the Email column, or clear it to import without one. Only these rows are
                  held back.
                </div>
              )}
              {pdfBlockedCount === 0 && pdfMissingEmailCount > 0 && (
                <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {pdfMissingEmailCount} invoice{pdfMissingEmailCount !== 1 ? "s" : ""} will import
                  without an email — add it on the Party page later to send reminders.
                </div>
              )}

              <button onClick={() => setPreview(null)} className="text-xs text-zinc-400 hover:text-zinc-600">
                Choose different files
              </button>
            </div>
          )}

          {/* Done: Tally batch progress + result */}
          {batchId && (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-xs text-zinc-500">
                  <span data-testid="import-status">{batch?.status ?? "PENDING"}</span>
                  <span>
                    {batch?.processedCount ?? 0}/{batch?.totalCount ?? tallyPreview?.count ?? 0}
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

              {isTallyTerminal && batch && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="success">Created {batch.createdCount}</Badge>
                  <Badge variant="secondary">Updated {batch.updatedCount}</Badge>
                  <Badge variant="warning">Skipped {batch.skippedCount}</Badge>
                  <Badge variant="danger">Errored {batch.erroredCount}</Badge>
                </div>
              )}

              {isTallyTerminal && batch?.error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
                  {batch.error}
                </div>
              )}

              {isTallyTerminal && (
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => window.open(`/api/import/batches/${batchId}/report`, "_blank")}
                  >
                    Download report
                  </Button>
                  <Button onClick={reset}>Start another import</Button>
                </div>
              )}
            </div>
          )}

          {/* Done: CSV result */}
          {isCsvDone && (
            <div className="space-y-4">
              <Badge variant="success">
                Imported {startCsvImport.data?.length ?? 0} invoice{startCsvImport.data?.length !== 1 ? "s" : ""}
              </Badge>
              <div className="flex justify-end">
                <Button onClick={reset}>Start another import</Button>
              </div>
            </div>
          )}

          {/* Done: PDF result */}
          {isPdfDone && (
            <div className="space-y-4">
              <Badge variant="success">
                Imported {startPdfImport.data?.length ?? 0} invoice{startPdfImport.data?.length !== 1 ? "s" : ""}
              </Badge>
              <div className="flex justify-end">
                <Button onClick={reset}>Start another import</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions for Upload/Preview steps */}
      {!batchId && !isBulkDone && preview && (
        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <Button variant="outline" onClick={() => setPreview(null)}>
            Cancel
          </Button>
          {sourceKey === "csv-invoices" ? (
            <Button
              disabled={csvValidInvoices.length === 0 || startCsvImport.isPending}
              onClick={() => startCsvImport.mutate(csvValidInvoices)}
            >
              {startCsvImport.isPending ? "Importing..." : `Import ${csvValidInvoices.length} invoice${csvValidInvoices.length !== 1 ? "s" : ""}`}
            </Button>
          ) : sourceKey === "pdf-invoices" ? (
            <Button
              disabled={pdfValidInvoices.length === 0 || startPdfImport.isPending}
              onClick={() => startPdfImport.mutate(pdfValidInvoices)}
            >
              {startPdfImport.isPending ? "Importing..." : `Import ${pdfValidInvoices.length} invoice${pdfValidInvoices.length !== 1 ? "s" : ""}`}
            </Button>
          ) : (
            <Button disabled={startTallyImport.isPending} onClick={() => startTallyImport.mutate()}>
              {startTallyImport.isPending ? "Starting..." : "Start import"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
