"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentTable } from "@/modules/payments/components/payment-table";
import { RecordPaymentSheet } from "@/modules/payments/components/record-payment-sheet";
import type { PartyDto, PaymentDto } from "@/types";

function PaymentsPageContent() {
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: () => apiFetch<PaymentDto[]>("/api/payments?limit=200"),
  });

  // Payments don't carry a denormalized party name, so resolve it client-side
  // from the same full-directory fetch the parties page uses (Task 17).
  const { data: parties, isLoading: partiesLoading } = useQuery({
    queryKey: ["parties", "directory"],
    queryFn: () => apiFetch<PartyDto[]>("/api/parties?limit=500"),
  });

  const isLoading = paymentsLoading || partiesLoading;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-zinc-500">Record and allocate payments against invoices and bills.</p>
        </div>
        <RecordPaymentSheet />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <PaymentTable payments={payments ?? []} parties={parties ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}

export default function PaymentsPage() {
  // RecordPaymentSheet reads `useSearchParams()` (for the `?record=1&invoiceId=`
  // deep link), which requires a Suspense boundary in the app router.
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PaymentsPageContent />
    </Suspense>
  );
}
