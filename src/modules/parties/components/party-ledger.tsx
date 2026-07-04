"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api/client";
import { DataTable } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { Skeleton } from "@/components/ui/skeleton";

interface LedgerEntry {
  date: string;
  docType: "INVOICE" | "BILL" | "PAYMENT";
  docNumber: string;
  debit: string | null;
  credit: string | null;
  balance: string;
  currency: string;
}

const DOC_TYPE_LABELS: Record<LedgerEntry["docType"], string> = {
  INVOICE: "Invoice",
  BILL: "Bill",
  PAYMENT: "Payment",
};

export function PartyLedger({ partyId }: { partyId: string }) {
  const { data: ledger, isLoading } = useQuery({
    queryKey: ["party-ledger", partyId],
    queryFn: () => apiFetch<LedgerEntry[]>(`/api/parties/${partyId}/ledger`),
  });

  const columns = useMemo<ColumnDef<LedgerEntry, unknown>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }) => format(new Date(row.original.date), "MMM d, yyyy"),
      },
      {
        id: "document",
        header: "Document",
        cell: ({ row }) => (
          <span>
            {DOC_TYPE_LABELS[row.original.docType]} · {row.original.docNumber}
          </span>
        ),
      },
      {
        accessorKey: "debit",
        header: "Debit",
        cell: ({ row }) =>
          row.original.debit ? (
            <Money amount={row.original.debit} currency={row.original.currency} />
          ) : (
            "—"
          ),
      },
      {
        accessorKey: "credit",
        header: "Credit",
        cell: ({ row }) =>
          row.original.credit ? (
            <Money amount={row.original.credit} currency={row.original.currency} />
          ) : (
            "—"
          ),
      },
      {
        accessorKey: "balance",
        header: "Balance",
        cell: ({ row }) => <Money amount={row.original.balance} currency={row.original.currency} />,
      },
    ],
    [],
  );

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-2" data-testid="party-ledger">
      <h2 className="text-lg font-semibold">Ledger</h2>
      <DataTable columns={columns} data={ledger ?? []} />
    </div>
  );
}
