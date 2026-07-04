"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { BillTable } from "@/modules/bills/components/bill-table";
import { BillFormDialog } from "@/modules/bills/components/bill-form";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { exportCsv } from "@/lib/utils/csv";
import type { BillDto } from "@/types";

export default function BillsPage() {
  const { data: bills, isLoading } = useQuery({
    queryKey: ["bills"],
    queryFn: () => apiFetch<BillDto[]>("/api/bills?limit=200"),
  });

  function handleExport() {
    exportCsv(
      (bills ?? []).map((bill) => ({
        billNumber: bill.billNumber,
        supplier: bill.party?.name ?? "",
        amount: bill.amount,
        dueDate: bill.dueDate,
        status: bill.status,
      })),
      "bills.csv",
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bills</h1>
          <p className="text-zinc-500">Track payables owed to suppliers.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={handleExport}>
            Export CSV
          </Button>
          <BillFormDialog />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <BillTable bills={bills ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
