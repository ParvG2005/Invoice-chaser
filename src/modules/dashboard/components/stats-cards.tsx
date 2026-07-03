"use client";

import { AlertCircle, CheckCircle2, Mail, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import type { DashboardStats } from "@/types";

export function StatsCards({ stats }: { stats: DashboardStats }) {
  const items = [
    {
      title: "Unpaid total",
      value: formatCurrency(stats.totalUnpaidAmount),
      icon: Wallet,
      description: "Outstanding across all open invoices",
    },
    {
      title: "Overdue",
      value: stats.overdueCount.toString(),
      icon: AlertCircle,
      description: "Invoices past due date",
    },
    {
      title: "Reminders sent",
      value: stats.remindersSent.toString(),
      icon: Mail,
      description: "Automated follow-ups delivered",
    },
    {
      title: "Recovered",
      value: formatCurrency(stats.recoveredAmount),
      icon: CheckCircle2,
      description: "Paid invoice value",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ title, value, icon: Icon, description }) => (
        <Card key={title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">{title}</CardTitle>
            <Icon className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            <p className="mt-1 text-xs text-zinc-500">{description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
