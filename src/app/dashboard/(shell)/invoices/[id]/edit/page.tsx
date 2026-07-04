"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceForm } from "@/modules/invoices/components/invoice-form";
import type { InvoiceDto } from "@/types";

export default function EditInvoicePage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => apiFetch<InvoiceDto>(`/api/invoices/${invoiceId}`),
  });

  if (isLoading || !invoice) {
    return (
      <div className="space-y-6 pb-20">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit invoice</h1>
        <p className="text-zinc-500">{invoice.invoiceNumber}</p>
      </div>
      <InvoiceForm mode="edit" invoiceId={invoice.id} invoice={invoice} />
    </div>
  );
}
