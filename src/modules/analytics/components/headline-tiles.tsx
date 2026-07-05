"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { useHeadlineTiles } from "../hooks/use-analytics";

export function HeadlineTiles() {
  const { data, isLoading } = useHeadlineTiles();

  const tiles = [
    { label: "Money to come", value: data ? formatCurrency(data.moneyToCome, "INR") : "—" },
    { label: "Money to pay", value: data ? formatCurrency(data.moneyToPay, "INR") : "—" },
    {
      label: "Invoices pending",
      value: data ? `${data.pendingInvoices.count}` : "—",
      sub: data ? formatCurrency(data.pendingInvoices.value, "INR") : undefined,
    },
    { label: "Overdue value", value: data ? formatCurrency(data.overdueValue, "INR") : "—", danger: true },
    { label: "Collected this month", value: data ? formatCurrency(data.collectedThisMonth, "INR") : "—" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-busy={isLoading}>
      {tiles.map((t) => (
        // Red border reserved for the danger tile, matching the low-stock
        // card treatment on the Stitch "Analytics - Stock" screen.
        <Card key={t.label} className={t.danger ? "border-destructive/50" : undefined}>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold tabular-nums ${t.danger ? "text-destructive" : ""}`}>{t.value}</div>
            {t.sub && <div className="text-sm text-muted-foreground tabular-nums">{t.sub}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
