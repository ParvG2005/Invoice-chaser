"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CHART_COLORS } from "../palette";
import { useCollectionTrend } from "../hooks/use-analytics";

export function CollectionTrendChart() {
  const { data } = useCollectionTrend();
  if (!data) return <Card className="h-[360px]" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collection trend (6 months)</CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="month" stroke={CHART_COLORS.neutral} fontSize={12} />
            <YAxis stroke={CHART_COLORS.neutral} fontSize={12} tickFormatter={(v: number) => formatCurrency(v, "INR")} width={90} />
            <Tooltip formatter={(v: number) => formatCurrency(v, "INR")} />
            <Legend />
            <Bar dataKey="invoiced" name="Invoiced" fill={CHART_COLORS.neutral} radius={[4, 4, 0, 0]} />
            <Bar dataKey="collected" name="Collected" fill={CHART_COLORS.positive} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
