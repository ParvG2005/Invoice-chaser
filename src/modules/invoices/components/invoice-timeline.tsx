"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Mail, MessageCircle, IndianRupee, History } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/components/shared/money";
import type { TimelineEntry } from "@/types";

function TimelineIcon({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "PAYMENT") return <IndianRupee className="h-4 w-4" />;
  if (entry.channel === "WHATSAPP") return <MessageCircle className="h-4 w-4" />;
  return <Mail className="h-4 w-4" />;
}

/**
 * `invoiceService.timeline` builds `summary` with a raw numeric amount (no
 * currency symbol/grouping) for PAYMENT entries. Re-render that amount
 * through the invoice's actual currency here rather than hardcoding a
 * symbol, so the UI stays currency-aware per the source-of-truth rule.
 */
function displaySummary(entry: TimelineEntry, currency: string): string {
  if (entry.kind === "PAYMENT" && entry.amount) {
    return entry.summary.replace(entry.amount, formatMoney(entry.amount, currency));
  }
  return entry.summary;
}

export function InvoiceTimeline({ invoiceId, currency }: { invoiceId: string; currency: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["invoice-timeline", invoiceId],
    queryFn: () => apiFetch<TimelineEntry[]>(`/api/invoices/${invoiceId}/timeline`),
  });

  return (
    <div data-testid="invoice-timeline" className="space-y-4 rounded-xl border p-6">
      <h2 className="text-lg font-semibold">Communications &amp; payments</h2>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={History}
          title="No activity yet"
          description="Reminders, emails, and payments for this invoice will show up here."
        />
      ) : (
        <ol className="space-y-3">
          {data.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                <TimelineIcon entry={entry} />
              </span>
              <div>
                <p className="font-medium">{displaySummary(entry, currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(entry.at), "MMM d, yyyy h:mm a")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
