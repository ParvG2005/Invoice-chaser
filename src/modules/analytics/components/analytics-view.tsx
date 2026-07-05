"use client";

import { HeadlineTiles } from "./headline-tiles";
import { AgingChart } from "./aging-chart";
import { CollectionTrendChart } from "./collection-trend-chart";
import { CashflowChart } from "./cashflow-chart";
import { PartyRiskTable } from "./party-risk-table";
import { AgentLeaderboard } from "./agent-leaderboard";
import { StockPanel } from "./stock-panel";

export function AnalyticsView() {
  return (
    <div className="space-y-6">
      <HeadlineTiles />
      <div className="grid gap-6 lg:grid-cols-2">
        <AgingChart />
        <CashflowChart />
        <CollectionTrendChart />
        <StockPanel />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <PartyRiskTable />
        <AgentLeaderboard />
      </div>
    </div>
  );
}
