"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { BillSummaryCard } from "@/modules/bills/components/bill-summary-card";
import { BillActions } from "@/modules/bills/components/bill-actions";
import { BillPayments } from "@/modules/bills/components/bill-payments";
import type { BillDto } from "@/types";

export default function BillDetailPage() {
  const params = useParams<{ id: string }>();
  const billId = params.id;

  const { data: bill, isLoading } = useQuery({
    queryKey: ["bill", billId],
    queryFn: () => apiFetch<BillDto>(`/api/bills/${billId}`),
  });

  if (isLoading || !bill) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <BillSummaryCard bill={bill} />
      <BillActions bill={bill} />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Notes</h2>
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          {bill.notes || "No notes."}
        </p>
      </div>

      <BillPayments billId={bill.id} currency={bill.currency} />
    </div>
  );
}
