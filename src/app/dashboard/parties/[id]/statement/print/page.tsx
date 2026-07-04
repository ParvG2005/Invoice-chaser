"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api/client";
import { formatMoney } from "@/components/shared/money";
import type { PartyDto } from "@/types";

interface LedgerEntry {
  date: string;
  docType: "INVOICE" | "BILL" | "PAYMENT";
  docNumber: string;
  debit: string | null;
  credit: string | null;
  balance: string;
  currency: string;
}

/**
 * Standalone print/export view for a party's statement — mirrors
 * `src/app/dashboard/invoices/[id]/print/page.tsx` (Task 13): lives
 * outside the `(shell)` route group so it renders with zero dashboard
 * chrome, even though the URL still nests under `/dashboard`. PDF export
 * is browser print-to-PDF only (`window.print()`).
 */
export default function PartyStatementPrintPage() {
  const params = useParams<{ id: string }>();
  const partyId = params.id;

  const { data: party, isLoading: partyLoading } = useQuery({
    queryKey: ["party", partyId],
    queryFn: () => apiFetch<PartyDto>(`/api/parties/${partyId}`),
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["party-ledger", partyId],
    queryFn: () => apiFetch<LedgerEntry[]>(`/api/parties/${partyId}/ledger`),
  });

  const isLoading = partyLoading || ledgerLoading;

  useEffect(() => {
    if (!isLoading && party && ledger) {
      window.print();
    }
  }, [isLoading, party, ledger]);

  if (isLoading || !party || !ledger) {
    return <p className="p-8 text-sm text-zinc-500">Loading statement…</p>;
  }

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
          <p className="text-zinc-500">Account statement</p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-semibold">{party.name}</h2>
          <p className="text-zinc-500">As of {format(new Date(), "MMM d, yyyy")}</p>
        </div>
      </div>

      <table className="mb-8 w-full border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Date</th>
            <th className="py-2">Document</th>
            <th className="py-2 text-right">Debit</th>
            <th className="py-2 text-right">Credit</th>
            <th className="py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((entry, i) => (
            <tr key={i} className="border-b">
              <td className="py-2">{format(new Date(entry.date), "MMM d, yyyy")}</td>
              <td className="py-2">
                {entry.docType} {entry.docNumber}
              </td>
              <td className="py-2 text-right">
                {entry.debit ? formatMoney(entry.debit, entry.currency) : "—"}
              </td>
              <td className="py-2 text-right">
                {entry.credit ? formatMoney(entry.credit, entry.currency) : "—"}
              </td>
              <td className="py-2 text-right">{formatMoney(entry.balance, entry.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
