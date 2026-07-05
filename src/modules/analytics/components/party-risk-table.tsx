"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { usePartyAnalytics } from "../hooks/use-analytics";

const FLAG_LABELS: Record<string, string> = {
  OVER_CREDIT_LIMIT: "Over credit limit",
  HABITUAL_LATE: "Habitually late",
};

export function PartyRiskTable() {
  const { data } = usePartyAnalytics();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Party exposure & payment behavior</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4">Party</th>
              <th className="py-2 pr-4 text-right">Receivable</th>
              <th className="py-2 pr-4 text-right">Payable</th>
              <th className="py-2 pr-4 text-right">Avg days to pay</th>
              <th className="py-2 pr-4 text-right">On-time %</th>
              <th className="py-2">Risk</th>
            </tr>
          </thead>
          <tbody>
            {(data?.parties ?? []).map((p) => (
              <tr key={p.partyId} className="border-b last:border-0">
                <td className="py-2 pr-4">{p.partyName}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(p.receivableExposure, "INR")}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(p.payableExposure, "INR")}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{p.avgDaysToPay ?? "—"}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{p.onTimePct != null ? `${p.onTimePct}%` : "—"}</td>
                <td className="py-2">
                  {p.riskFlags.map((f) => (
                    <span key={f} className="mr-1 rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                      {FLAG_LABELS[f]}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
