"use client";

import { AnalyticsView } from "@/modules/analytics/components/analytics-view";

export default function AnalyticsPage() {
  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <AnalyticsView />
    </main>
  );
}
