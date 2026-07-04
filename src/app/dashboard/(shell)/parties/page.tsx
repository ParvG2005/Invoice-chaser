"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PartyTable } from "@/modules/parties/components/party-table";
import { PartyFormDialog } from "@/modules/parties/components/party-form-dialog";
import type { PartyDto, PartyType } from "@/types";

const TYPE_TABS: { value: "ALL" | PartyType; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "CUSTOMER", label: "Customers" },
  { value: "SUPPLIER", label: "Suppliers" },
  { value: "AGENT", label: "Agents" },
];

export default function PartiesPage() {
  const [tab, setTab] = useState<"ALL" | PartyType>("ALL");

  // Fetch the full directory (not server-filtered by type) so the
  // client-side type tabs can filter instantly and the party table can
  // still resolve every party's agent name from the same dataset.
  const { data: parties, isLoading } = useQuery({
    queryKey: ["parties", "directory"],
    queryFn: () => apiFetch<PartyDto[]>("/api/parties?limit=500"),
  });

  const filtered = useMemo(() => {
    if (!parties) return [];
    if (tab === "ALL") return parties;
    return parties.filter((p) => p.type === tab || p.type === "BOTH");
  }, [parties, tab]);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Parties</h1>
          <p className="text-zinc-500">Customers, suppliers, and agents in one directory.</p>
        </div>
        <PartyFormDialog />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "ALL" | PartyType)}>
        <TabsList>
          {TYPE_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? <Skeleton className="h-64 w-full" /> : <PartyTable parties={filtered} />}
    </div>
  );
}
