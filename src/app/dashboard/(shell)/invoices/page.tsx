"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RowSelectionState } from "@tanstack/react-table";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { InvoiceTable } from "@/modules/invoices/components/invoice-table";
import { InvoiceFiltersBar } from "@/modules/invoices/components/invoice-filters";
import { BulkActionsBar } from "@/modules/invoices/components/bulk-actions-bar";
import { ImportDialog } from "@/modules/invoices/components/import-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useInvoiceFilters } from "@/store/invoice-filters";
import type { InvoiceDto } from "@/types";

const PAGE_SIZE = 50;

function buildQueryString(filters: ReturnType<typeof useInvoiceFilters.getState>["filters"], cursor: string | null) {
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  if (cursor) params.set("cursor", cursor);
  if (filters.status?.[0]) params.set("status", filters.status[0]);
  if (filters.partyId) params.set("partyId", filters.partyId);
  if (filters.dueBefore) params.set("dueBefore", filters.dueBefore);
  if (filters.dueAfter) params.set("dueAfter", filters.dueAfter);
  if (filters.search) params.set("search", filters.search);
  return params.toString();
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { filters } = useInvoiceFilters();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["invoices", filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<InvoiceDto[]>(`/api/invoices?${buildQueryString(filters, pageParam)}`),
    // A full page implies there may be more; the last invoice id is the next cursor.
    getNextPageParam: (lastPage) =>
      lastPage.length === PAGE_SIZE ? lastPage[lastPage.length - 1].id : undefined,
  });

  const invoices = useMemo(() => data?.pages.flat() ?? [], [data]);

  const selectedInvoices = useMemo(
    () => invoices.filter((invoice) => rowSelection[invoice.id]),
    [invoices, rowSelection],
  );

  function clearSelection() {
    setRowSelection({});
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-zinc-500">Manage clients, track status, and generate AI reminders.</p>
        </div>
        <div className="flex gap-2">
          <ImportDialog />
          <Button asChild>
            <Link href="/dashboard/invoices/new">New invoice</Link>
          </Button>
        </div>
      </div>

      <InvoiceFiltersBar />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <InvoiceTable
          invoices={invoices}
          isLoading={isLoading}
          selection={{ state: rowSelection, onChange: setRowSelection }}
        />
      )}
      {!isLoading && hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      <BulkActionsBar selected={selectedInvoices} onClear={clearSelection} />
    </div>
  );
}
