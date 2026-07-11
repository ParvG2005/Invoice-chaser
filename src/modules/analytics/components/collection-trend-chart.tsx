"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="fillInvoiced" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.outflow} stopOpacity={0.35} />
                <stop offset="95%" stopColor={CHART_COLORS.outflow} stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="fillCollected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.positive} stopOpacity={0.4} />
                <stop offset="95%" stopColor={CHART_COLORS.positive} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.neutral} strokeOpacity={0.25} />
            <XAxis dataKey="month" stroke={CHART_COLORS.neutral} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              stroke={CHART_COLORS.neutral}
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatCurrency(v, "INR")}
              width={90}
            />
            <Tooltip formatter={(v: number) => formatCurrency(v, "INR")} />
            <Legend iconType="plainline" />
            <Area
              type="monotone"
              dataKey="invoiced"
              name="Invoiced"
              stroke={CHART_COLORS.outflow}
              strokeWidth={2}
              fill="url(#fillInvoiced)"
            />
            <Area
              type="monotone"
              dataKey="collected"
              name="Collected"
              stroke={CHART_COLORS.positive}
              strokeWidth={2}
              fill="url(#fillCollected)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
