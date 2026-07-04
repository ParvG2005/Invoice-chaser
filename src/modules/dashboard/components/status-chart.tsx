"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardStats } from "@/types";

const STATUS_META: {
  key: keyof DashboardStats["invoiceCountByStatus"];
  label: string;
  color: string;
}[] = [
  { key: "PENDING", label: "Pending", color: "#f59e0b" },
  { key: "OVERDUE", label: "Overdue", color: "#ef4444" },
  { key: "PAID", label: "Paid", color: "#10b981" },
  { key: "PARTIALLY_PAID", label: "Partially paid", color: "#3b82f6" },
  { key: "WRITTEN_OFF", label: "Written off", color: "#9ca3af" },
];

export function StatusChart({ stats }: { stats: DashboardStats }) {
  const data = STATUS_META.map(({ key, label, color }) => ({
    name: label,
    count: stats.invoiceCountByStatus[key],
    color,
  }));

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Receivables by status</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="name" stroke="#888888" fontSize={12} />
            <YAxis allowDecimals={false} stroke="#888888" fontSize={12} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
