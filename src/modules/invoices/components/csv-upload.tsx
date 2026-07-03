"use client";

import { useRef } from "react";
import Papa from "papaparse";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { csvInvoiceRowSchema, type CreateInvoiceInput } from "@/lib/validations/invoice";
import { apiFetch } from "@/lib/api/client";
import type { InvoiceDto } from "@/types";

export function CsvUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (invoices: CreateInvoiceInput[]) =>
      apiFetch<InvoiceDto[]>("/api/invoices/bulk", {
        method: "POST",
        body: JSON.stringify({ invoices }),
      }),
    onSuccess: (data) => {
      toast.success(`Imported ${data.length} invoices`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const invoices = results.data.map((row) => {
            const normalized = {
              clientName: row.clientName ?? row.client_name ?? row.ClientName,
              clientEmail: row.clientEmail ?? row.client_email ?? row.ClientEmail,
              amount: row.amount ?? row.Amount,
              dueDate: row.dueDate ?? row.due_date ?? row.DueDate,
              invoiceNumber: row.invoiceNumber ?? row.invoice_number ?? row.InvoiceNumber,
              notes: row.notes ?? row.Notes,
            };
            return csvInvoiceRowSchema.parse(normalized);
          });
          mutation.mutate(invoices);
        } catch {
          toast.error("Invalid CSV format. Check column names.");
        }
      },
      error: () => toast.error("Failed to parse CSV"),
    });
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        disabled={mutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {mutation.isPending ? "Uploading..." : "Upload CSV"}
      </Button>
    </>
  );
}
