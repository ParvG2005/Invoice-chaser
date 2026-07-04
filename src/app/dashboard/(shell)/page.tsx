"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { StatsCards } from "@/modules/dashboard/components/stats-cards";
import { QuickActions } from "@/modules/dashboard/components/quick-actions";
import { StatusChart } from "@/modules/dashboard/components/status-chart";
import { RecentActivity } from "@/modules/dashboard/components/recent-activity";
import { InvoicesDueSoon } from "@/modules/dashboard/components/invoices-due-soon";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardStats } from "@/types";

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch<DashboardStats>("/api/dashboard/stats"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-red-600">Failed to load dashboard. Check your database connection.</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-zinc-500">Monitor receivables, payables, and reminder performance.</p>
      </div>

      <StatsCards stats={data} />

      <QuickActions />

      <div className="grid gap-6 lg:grid-cols-3">
        <StatusChart stats={data} />
        <RecentActivity activity={data.recentActivity} />
      </div>

      <InvoicesDueSoon invoices={data.invoicesDueSoon} />
    </div>
  );
}
