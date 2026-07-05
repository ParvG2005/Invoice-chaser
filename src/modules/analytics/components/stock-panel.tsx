"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { CHART_COLORS } from "../palette";
import { useStockAnalytics } from "../hooks/use-analytics";

export function StockPanel() {
  const { data } = useStockAnalytics();
  if (!data) return <Card className="h-[360px]" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Stock — valuation {formatCurrency(data.totalValuation, "INR")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.movementTrend}>
              <XAxis dataKey="month" stroke={CHART_COLORS.neutral} fontSize={12} />
              <YAxis stroke={CHART_COLORS.neutral} fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="inQty" name="In" fill={CHART_COLORS.inflow} radius={[4, 4, 0, 0]} />
              <Bar dataKey="outQty" name="Out" fill={CHART_COLORS.outflow} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-medium">Low stock</h3>
            {data.lowStockItems.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
            <ul className="text-sm">
              {data.lowStockItems.map((i) => (
                <li key={i.itemId}>
                  {i.name}: {i.currentQty} {i.unit} (reorder at {i.reorderLevel})
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium">Dead stock (no movement 90d)</h3>
            {data.deadStockItems.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
            <ul className="text-sm">
              {data.deadStockItems.map((i) => (
                <li key={i.itemId}>
                  {i.name}: {i.currentQty} {i.unit} · {formatCurrency(i.valuation, "INR")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
