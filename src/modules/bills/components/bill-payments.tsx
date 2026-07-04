"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api/client";
import { Money } from "@/components/shared/money";
import type { BillPaymentDto } from "@/types";

/** "Payments applied" section for the bill detail page — payments allocated against this bill. */
export function BillPayments({ billId, currency }: { billId: string; currency: string }) {
  const { data: payments, isLoading } = useQuery({
    queryKey: ["bill-payments", billId],
    queryFn: () => apiFetch<BillPaymentDto[]>(`/api/bills/${billId}/payments`),
  });

  return (
    <div className="space-y-2" data-testid="bill-payments">
      <h2 className="text-lg font-semibold">Payments applied</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !payments || payments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No payments yet
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">
                {format(new Date(payment.paymentDate), "MMM d, yyyy")} · {payment.mode}
              </span>
              <span className="font-medium">
                <Money amount={payment.amount} currency={currency} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
