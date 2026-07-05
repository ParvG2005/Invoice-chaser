"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CHART_COLORS } from "../palette";
import { useAgingReport } from "../hooks/use-analytics";

const BUCKET_LABELS: Record<string, string> = {
  CURRENT: "Not due", "0_30": "0-30", "31_60": "31-60", "61_90": "61-90", "90_PLUS": "90+",
};

export function AgingChart() {
  const receivable = useAgingReport("RECEIVABLE");
  const payable = useAgingReport("PAYABLE");
  if (!receivable.data || !payable.data) return <Card className="h-[360px]" />;

  const data = receivable.data.buckets.map((b, i) => ({
    bucket: BUCKET_LABELS[b.label],
    receivable: b.amount,
    payable: payable.data!.buckets[i].amount,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Aging — receivables vs payables
          {receivable.data.dso != null && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">DSO {receivable.data.dso} days</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="bucket" stroke={CHART_COLORS.neutral} fontSize={12} />
            <YAxis stroke={CHART_COLORS.neutral} fontSize={12} tickFormatter={(v: number) => formatCurrency(v, "INR")} width={90} />
            <Tooltip formatter={(v: number) => formatCurrency(v, "INR")} />
            <Legend />
            <Bar dataKey="receivable" name="Receivable" fill={CHART_COLORS.inflow} radius={[4, 4, 0, 0]} />
            <Bar dataKey="payable" name="Payable" fill={CHART_COLORS.outflow} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
