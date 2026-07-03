"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import type { InvoiceDto } from "@/types";
import { format } from "date-fns";
import { Sparkles, Trash2 } from "lucide-react";

const statusVariant: Record<string, "secondary" | "warning" | "success"> = {
  PENDING: "secondary",
  OVERDUE: "warning",
  PAID: "success",
};

interface InvoiceTableProps {
  invoices: InvoiceDto[];
  onMarkPaid: (id: string) => void;
  onGenerateEmail: (id: string) => void;
  onDelete: (id: string) => void;
  loadingId?: string | null;
  deletingId?: string | null;
}

export function InvoiceTable({
  invoices,
  onMarkPaid,
  onGenerateEmail,
  onDelete,
  loadingId,
  deletingId,
}: InvoiceTableProps) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
        <p className="text-zinc-500">No invoices yet. Upload a CSV or create one manually.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
          <tr>
            <th className="px-4 py-3 font-medium">Invoice #</th>
            <th className="px-4 py-3 font-medium">Client</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-zinc-900 dark:text-zinc-100">{invoice.clientName}</div>
                <div className="text-xs text-zinc-500">{invoice.clientEmail}</div>
                {invoice.clientPhone && (
                  <div className="text-xs text-zinc-400 font-mono mt-0.5">{invoice.clientPhone}</div>
                )}
              </td>
              <td className="px-4 py-3">{formatCurrency(invoice.amount)}</td>
              <td className="px-4 py-3">{format(new Date(invoice.dueDate), "MMM d, yyyy")}</td>
              <td className="px-4 py-3">
                <Badge variant={statusVariant[invoice.status]}>{invoice.status}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingId === invoice.id || invoice.status === "PAID"}
                    onClick={() => onGenerateEmail(invoice.id)}
                  >
                    <Sparkles className="h-3 w-3" /> AI email
                  </Button>
                  {invoice.status !== "PAID" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={loadingId === invoice.id}
                      onClick={() => onMarkPaid(invoice.id)}
                    >
                      Mark paid
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    disabled={deletingId === invoice.id}
                    onClick={() => {
                      if (confirm(`Delete invoice ${invoice.invoiceNumber}?`)) {
                        onDelete(invoice.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
