"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PartyTypeBadge } from "@/modules/parties/components/party-table";
import { PartyLedger } from "@/modules/parties/components/party-ledger";
import { AgentRollup } from "@/modules/parties/components/agent-rollup";
import type { PartyDto } from "@/types";

export default function PartyDetailPage() {
  const params = useParams<{ id: string }>();
  const partyId = params.id;

  const { data: party, isLoading } = useQuery({
    queryKey: ["party", partyId],
    queryFn: () => apiFetch<PartyDto>(`/api/parties/${partyId}`),
  });

  // Cheap even for non-agent parties (empty array) — lets the "Managed
  // parties" section show up for any party that actually has managed
  // parties, without hard-coding which PartyType values can be an agent.
  const { data: rollup } = useQuery({
    queryKey: ["party-rollup", partyId],
    queryFn: () => apiFetch<{ party: { id: string; name: string }; outstanding: string }[]>(
      `/api/parties/${partyId}/rollup`,
    ),
  });

  if (isLoading || !party) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{party.name}</h1>
            <PartyTypeBadge type={party.type} />
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download className="h-4 w-4" />
              Download statement
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={`/api/parties/${partyId}/statement?format=csv`}>CSV</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/api/parties/${partyId}/statement?format=pdf`} target="_blank" rel="noopener noreferrer">
                PDF
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-4 rounded-xl border p-6 sm:grid-cols-2 lg:grid-cols-3">
        <ContactField label="Email" value={party.email} />
        <ContactField label="Phone" value={party.phone} />
        <ContactField label="WhatsApp" value={party.whatsapp} />
        <ContactField label="GSTIN" value={party.gstin} />
        <ContactField label="Billing address" value={party.billingAddress} />
        <ContactField
          label="Credit terms"
          value={
            party.creditLimit != null || party.creditDays != null
              ? `₹${party.creditLimit?.toLocaleString("en-IN") ?? "—"} / ${party.creditDays ?? "—"} days`
              : null
          }
        />
      </div>

      <PartyLedger partyId={party.id} />

      {rollup && rollup.length > 0 && <AgentRollup agentPartyId={party.id} />}
    </div>
  );
}

function ContactField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{value ?? "—"}</p>
    </div>
  );
}
