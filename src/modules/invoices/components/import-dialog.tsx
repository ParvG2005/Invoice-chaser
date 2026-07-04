"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Upload, FileText, X, AlertTriangle, CheckCircle, ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import type { CreateInvoiceInput } from "@/lib/validations/invoice";
import type { InvoiceDto } from "@/types";
import { parseCsv } from "@/lib/import/csv-parser";

interface ParsedPreview {
  invoices: CreateInvoiceInput[];
  errors: string[];
  warnings: string[];
  missingEmailCount: number;
  fileName: string;
}

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: (invoices: CreateInvoiceInput[]) =>
      apiFetch<InvoiceDto[]>("/api/invoices/bulk", {
        method: "POST",
        body: JSON.stringify({ invoices }),
      }),
    onSuccess: (data) => {
      toast.success(`Successfully imported ${data.length} invoice${data.length !== 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
      setPreview(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCsvFile = async (file: File) => {
    const result = await parseCsv(file);
    setPreview({
      invoices: result.invoices,
      errors: result.errors,
      warnings: [],
      missingEmailCount: 0,
      fileName: file.name,
    });
  };

  const handleFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      handleCsvFile(file);
    } else {
      toast.error("Unsupported file type. Upload a .csv file, or use the import wizard for TallyPrime XML.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const readyToImport = preview && preview.invoices.length > 0;
  const validInvoices = preview?.invoices.filter((inv) => inv.clientEmail) ?? [];

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        Import
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold">Import Invoices</h2>
            <p className="text-sm text-zinc-500">Upload a CSV export</p>
          </div>
          <button
            onClick={() => { setOpen(false); setPreview(null); }}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Format hints */}
          <div className="rounded-lg bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            Supports standard CSV and TallyPrime CSV exports. Required columns: <code>clientName</code>, <code>clientEmail</code>, <code>amount</code>, <code>dueDate</code>, <code>invoiceNumber</code>. Many column name variants supported automatically.
          </div>

          {/* Tally XML redirect */}
          <Link
            href="/dashboard/imports"
            className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-100"
            onClick={() => { setOpen(false); setPreview(null); }}
          >
            Importing from Tally? Use the new import wizard
            <ArrowRight className="h-4 w-4" />
          </Link>

          {/* Drop zone */}
          {!preview && (
            <div
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 transition-colors cursor-pointer ${
                dragging
                  ? "border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/20"
                  : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => csvRef.current?.click()}
            >
              <Upload className="mb-3 h-8 w-8 text-zinc-400" />
              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                Drag & drop or click to browse
              </p>
              <p className="mt-1 text-sm text-zinc-400">.csv files</p>
              <input
                ref={csvRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ""; }}
              />
            </div>
          )}

          {/* Preview table */}
          {preview && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <FileText className="h-4 w-4" />
                <span className="font-medium">{preview.fileName}</span>
                <span className="ml-auto">
                  <span className="text-emerald-600 font-semibold">{validInvoices.length}</span> ready to import
                  {preview.errors.length > 0 && (
                    <span className="ml-2 text-red-500">• {preview.errors.length} error{preview.errors.length > 1 ? "s" : ""}</span>
                  )}
                </span>
              </div>

              {/* Errors */}
              {preview.errors.length > 0 && (
                <div className="max-h-32 overflow-auto rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/30">
                  {preview.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400 py-0.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {err}
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div className="max-h-24 overflow-auto rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 py-0.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Invoice table preview */}
              <div className="max-h-48 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Invoice #</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Client</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Contact Details</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Amount</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Due Date</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.invoices.map((inv, i) => (
                      <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="px-3 py-2 font-medium">{inv.invoiceNumber}</td>
                        <td className="px-3 py-2">
                          <div className="font-semibold">{inv.clientName}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-zinc-500">{inv.clientEmail || <span className="text-red-400">No email</span>}</div>
                          {inv.clientPhone && <div className="text-xs text-zinc-400">{inv.clientPhone}</div>}
                        </td>
                        <td className="px-3 py-2">{Number(inv.amount).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</td>
                        <td className="px-3 py-2">{inv.dueDate}</td>
                        <td className="px-3 py-2">
                          {inv.clientEmail
                            ? <span className="text-emerald-600"><CheckCircle className="inline h-3.5 w-3.5" /></span>
                            : <span className="text-red-500"><AlertTriangle className="inline h-3.5 w-3.5" /></span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => setPreview(null)}
                className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
              >
                <ChevronRight className="h-3 w-3 rotate-180" />
                Choose different file
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <Button variant="outline" onClick={() => { setOpen(false); setPreview(null); }}>
            Cancel
          </Button>
          <Button
            disabled={!readyToImport || validInvoices.length === 0 || importMutation.isPending}
            onClick={() => importMutation.mutate(validInvoices)}
          >
            {importMutation.isPending
              ? "Importing..."
              : `Import ${validInvoices.length} Invoice${validInvoices.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
