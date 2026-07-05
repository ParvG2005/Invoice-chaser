"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { usePartyAnalytics } from "../hooks/use-analytics";

export function AgentLeaderboard() {
  const { data } = usePartyAnalytics();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4">Agent</th>
              <th className="py-2 pr-4 text-right">Collected</th>
              <th className="py-2 pr-4 text-right">Outstanding</th>
              <th className="py-2 text-right">Parties</th>
            </tr>
          </thead>
          <tbody>
            {(data?.agents ?? []).map((a) => (
              <tr key={a.agentId} className="border-b last:border-0">
                <td className="py-2 pr-4">{a.agentName}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(a.collected, "INR")}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(a.outstanding, "INR")}</td>
                <td className="py-2 text-right tabular-nums">{a.managedParties}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
