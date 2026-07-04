"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { apiFetch } from "@/lib/api/client";
import { DataTable } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceSummaryCard } from "@/modules/invoices/components/invoice-summary-card";
import { InvoiceActions } from "@/modules/invoices/components/invoice-actions";
import { InvoiceTimeline } from "@/modules/invoices/components/invoice-timeline";
import type { InvoiceDto, InvoiceLineItemDto } from "@/types";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => apiFetch<InvoiceDto>(`/api/invoices/${invoiceId}`),
  });

  const columns = useMemo<ColumnDef<InvoiceLineItemDto, unknown>[]>(
    () => [
      { accessorKey: "description", header: "Description" },
      { accessorKey: "quantity", header: "Qty" },
      {
        accessorKey: "rate",
        header: "Rate",
        cell: ({ row }) => <Money amount={row.original.rate} currency={invoice?.currency ?? "INR"} />,
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => <Money amount={row.original.amount} currency={invoice?.currency ?? "INR"} />,
      },
    ],
    [invoice?.currency],
  );

  if (isLoading || !invoice) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <InvoiceSummaryCard invoice={invoice} />
      <InvoiceActions invoice={invoice} />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Line items</h2>
        <DataTable columns={columns} data={invoice.lineItems ?? []} />
      </div>

      <InvoiceTimeline invoiceId={invoice.id} currency={invoice.currency} />
    </div>
  );
}
