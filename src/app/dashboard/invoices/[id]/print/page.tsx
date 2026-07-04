"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api/client";
import { formatMoney } from "@/components/shared/money";
import type { InvoiceDto } from "@/types";

/**
 * Standalone print/export view — deliberately lives outside the
 * `(shell)` route group so it renders with zero dashboard chrome (no
 * sidebar/topbar), even though the URL still nests under `/dashboard`.
 * PDF export is browser print-to-PDF only (`window.print()`); no
 * server-side PDF generation.
 */
export default function InvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => apiFetch<InvoiceDto>(`/api/invoices/${invoiceId}`),
  });

  useEffect(() => {
    if (invoice) {
      window.print();
    }
  }, [invoice]);

  if (isLoading || !invoice) {
    return <p className="p-8 text-sm text-zinc-500">Loading invoice…</p>;
  }

  const total = invoice.totalAmount ?? invoice.amount;
  const balance = total - invoice.amountPaid;

  return (
    <div className="mx-auto max-w-3xl p-8 text-sm text-zinc-900">
      <style>{`
        @media print {
          .print-hidden { display: none !important; }
          body { margin: 0; }
        }
      `}</style>

      <div className="print-hidden mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border px-3 py-1.5 text-xs font-medium"
        >
          Print
        </button>
      </div>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Invoice Chaser</h1>
          <p className="text-zinc-500">Tax Invoice</p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-semibold">{invoice.invoiceNumber}</h2>
          <p className="text-zinc-500">
            Issued {format(new Date(invoice.createdAt), "MMM d, yyyy")}
          </p>
          <p className="text-zinc-500">Due {format(new Date(invoice.dueDate), "MMM d, yyyy")}</p>
        </div>
      </div>

      <div className="mb-8">
        <p className="font-medium text-zinc-500">Bill to</p>
        <p className="font-semibold">{invoice.party?.name ?? invoice.clientName}</p>
        {invoice.clientEmail && <p className="text-zinc-500">{invoice.clientEmail}</p>}
      </div>

      <table className="mb-8 w-full border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Rate</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.lineItems ?? []).map((li) => (
            <tr key={li.id} className="border-b">
              <td className="py-2">{li.description}</td>
              <td className="py-2 text-right">{li.quantity}</td>
              <td className="py-2 text-right">{formatMoney(li.rate, invoice.currency)}</td>
              <td className="py-2 text-right">{formatMoney(li.amount, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-full max-w-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-zinc-500">Subtotal</span>
          <span>{formatMoney(invoice.subtotal ?? invoice.amount, invoice.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Tax</span>
          <span>{formatMoney(invoice.taxAmount ?? 0, invoice.currency)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-semibold">
          <span>Total</span>
          <span>{formatMoney(total, invoice.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Amount paid</span>
          <span>{formatMoney(invoice.amountPaid, invoice.currency)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Balance due</span>
          <span>{formatMoney(balance, invoice.currency)}</span>
        </div>
      </div>

      {invoice.notes && (
        <div className="mt-8">
          <p className="font-medium text-zinc-500">Notes</p>
          <p className="whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}
    </div>
  );
}
