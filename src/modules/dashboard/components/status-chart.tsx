"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardStats } from "@/types";

export function StatusChart({ stats }: { stats: DashboardStats }) {
  const data = [
    { name: "Pending", count: stats.invoiceCountByStatus.PENDING },
    { name: "Overdue", count: stats.invoiceCountByStatus.OVERDUE },
    { name: "Paid", count: stats.invoiceCountByStatus.PAID },
  ];

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Invoice status</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="name" stroke="#888888" fontSize={12} />
            <YAxis allowDecimals={false} stroke="#888888" fontSize={12} />
            <Tooltip />
            <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
