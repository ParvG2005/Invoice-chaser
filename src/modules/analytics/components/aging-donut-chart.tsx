"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { AGING_RAMP } from "../palette";
import { useAgingReport } from "../hooks/use-analytics";

const BUCKET_LABELS: Record<string, string> = {
  CURRENT: "Not due",
  "0_30": "0–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_PLUS": "90+ days",
};

export function AgingDonutChart() {
  const { data } = useAgingReport("RECEIVABLE");
  if (!data) return <Card className="h-[360px]" />;

  const slices = data.buckets
    .filter((b) => b.amount > 0)
    .map((b) => ({
      key: b.label,
      name: BUCKET_LABELS[b.label] ?? b.label,
      value: b.amount,
      color: AGING_RAMP[b.label],
    }));

  const overdue = data.buckets
    .filter((b) => b.label !== "CURRENT")
    .reduce((sum, b) => sum + b.amount, 0);
  const overduePct = data.total > 0 ? Math.round((overdue / data.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Receivables by age
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {overduePct}% overdue
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        {slices.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Nothing outstanding — every receivable is settled.
          </div>
        ) : (
          <div className="relative h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v, "INR")} />
                <Legend verticalAlign="bottom" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</span>
              <span className="text-2xl font-semibold tracking-tight">
                {formatCurrency(data.total, "INR")}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
