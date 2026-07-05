"use client";

import { useQuery } from "@tanstack/react-query";
import { Mail, MessageCircle, ArrowDownLeft } from "lucide-react";
import type { CommunicationLogDto } from "@/types";

const STATUS_LABEL: Record<CommunicationLogDto["status"], string> = {
  QUEUED: "Queued",
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
  FAILED: "Failed",
  BOUNCED: "Bounced",
};

async function fetchCommunications(invoiceId: string): Promise<CommunicationLogDto[]> {
  const res = await fetch(`/api/invoices/${invoiceId}/communications`);
  if (!res.ok) throw new Error("Failed to load communications");
  const json = (await res.json()) as { data: CommunicationLogDto[] };
  return json.data;
}

export function CommunicationTimeline({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["invoice-communications", invoiceId],
    queryFn: () => fetchCommunications(invoiceId),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading communications…</p>;
  if (isError) return <p className="text-sm text-destructive">Could not load communications.</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No communications yet.</p>;

  return (
    <ol className="space-y-3">
      {data.map((c) => (
        <li key={c.id} className="flex items-start gap-3 rounded-md border p-3">
          <span className="mt-0.5 shrink-0">
            {c.direction === "INBOUND" ? (
              <ArrowDownLeft className="h-4 w-4 text-emerald-600" aria-label="Reply" />
            ) : c.channel === "EMAIL" ? (
              <Mail className="h-4 w-4 text-muted-foreground" aria-label="Email" />
            ) : (
              <MessageCircle className="h-4 w-4 text-muted-foreground" aria-label="WhatsApp" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {c.direction === "INBOUND"
                  ? `Reply via ${c.channel === "EMAIL" ? "email" : "WhatsApp"}`
                  : (c.subject ?? c.templateId ?? "Message")}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {STATUS_LABEL[c.status]} · {new Date(c.createdAt).toLocaleString("en-IN")}
              </span>
            </div>
            {c.body && <p className="mt-1 truncate text-sm text-muted-foreground">{c.body}</p>}
            {c.errorMessage && <p className="mt-1 text-xs text-destructive">{c.errorMessage}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
