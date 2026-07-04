import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import type { DashboardStats } from "@/types";

const DOT_CLASS: Record<DashboardStats["recentActivity"][number]["type"], string> = {
  reminder_sent: "bg-destructive ring-4 ring-destructive/20",
  invoice_paid: "bg-success ring-4 ring-success/20",
  invoice_created: "bg-primary ring-4 ring-primary/20",
};

export function RecentActivity({
  activity,
}: {
  activity: DashboardStats["recentActivity"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Add invoices to get started."
          />
        ) : (
          <ul className="space-y-4">
            {activity.map((item) => (
              <li key={item.id} className="flex gap-3">
                <span
                  className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT_CLASS[item.type])}
                />
                <div>
                  <p className="text-sm leading-relaxed">{item.label}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
