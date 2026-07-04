"use client";

import type { ComponentType } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils/cn";
import type { DashboardStats } from "@/types";

export function StatsCards({ stats }: { stats: DashboardStats }) {
  const tiles: {
    label: string;
    icon: ComponentType<{ className?: string }>;
    iconClass: string;
    value: React.ReactNode;
    valueClass?: string;
    helper: React.ReactNode;
  }[] = [
    {
      label: "Money to come",
      icon: ArrowDownLeft,
      iconClass: "bg-primary/10 text-primary",
      value: <Money amount={stats.moneyToCome} />,
      helper: "Outstanding across open invoices",
    },
    {
      label: "Money to pay",
      icon: ArrowUpRight,
      iconClass: "bg-secondary text-secondary-foreground",
      value: <Money amount={stats.moneyToPay} />,
      helper: "Outstanding across open bills",
    },
    {
      label: "Overdue",
      icon: AlertTriangle,
      iconClass: "bg-destructive/10 text-destructive",
      value: <Money amount={stats.overdueValue} />,
      valueClass: "text-destructive",
      helper: `${stats.overdueCount} invoice${stats.overdueCount === 1 ? "" : "s"} · urgent attention`,
    },
    {
      label: "Pending invoices",
      icon: Clock,
      iconClass: "bg-warning/10 text-warning",
      value: `${stats.pendingCount} invoice${stats.pendingCount === 1 ? "" : "s"}`,
      helper: (
        <>
          <Money amount={stats.pendingValue} /> total
        </>
      ),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map(({ label, icon: Icon, iconClass, value, valueClass, helper }) => (
        <Card key={label} data-testid={`tile-${label.toLowerCase().replace(/ /g, "-")}`}>
          <CardContent className="p-5">
            <div className="mb-3 flex items-start justify-between">
              <span className="text-xs font-medium uppercase tracking-tight text-muted-foreground">
                {label}
              </span>
              <div className={cn("rounded-lg p-2", iconClass)}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <div className={cn("text-2xl font-bold tracking-tight", valueClass)}>{value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
