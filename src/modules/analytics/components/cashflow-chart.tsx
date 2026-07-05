"use client";

import { Bar, BarChart, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CHART_COLORS } from "../palette";
import { useCashflowProjection } from "../hooks/use-analytics";

export function CashflowChart() {
  const { data } = useCashflowProjection();
  if (!data) return <Card className="h-[360px]" />;

  const chartData = data.weeks.map((w) => ({ ...w, outflow: -w.outflow }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash-flow projection (8 weeks)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Already overdue: {formatCurrency(data.overdue.inflow, "INR")} to collect ·{" "}
          {formatCurrency(data.overdue.outflow, "INR")} to pay
        </p>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} stackOffset="sign">
            <XAxis dataKey="weekStart" stroke={CHART_COLORS.neutral} fontSize={12} />
            <YAxis stroke={CHART_COLORS.neutral} fontSize={12} tickFormatter={(v: number) => formatCurrency(v, "INR")} width={90} />
            <Tooltip formatter={(v: number) => formatCurrency(Math.abs(v), "INR")} />
            <Legend />
            <ReferenceLine y={0} stroke={CHART_COLORS.neutral} />
            <Bar dataKey="inflow" name="Expected in" stackId="flow" fill={CHART_COLORS.inflow} />
            <Bar dataKey="outflow" name="Due out" stackId="flow" fill={CHART_COLORS.outflow} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
