"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api/client";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import type { InvoiceReminderDto } from "@/types";

const TONE_LABEL: Record<InvoiceReminderDto["tone"], string> = {
  FRIENDLY: "Friendly",
  PROFESSIONAL: "Professional",
  FIRM: "Firm",
};

const STATUS_LABEL: Record<InvoiceReminderDto["status"], string> = {
  SCHEDULED: "Scheduled",
  SENDING: "Sending",
  SENT: "Sent",
  FAILED: "Failed",
  CANCELLED: "Skipped",
};

/**
 * Invoice-detail "Reminders" tab (Task 26): shows this invoice's actual
 * `Reminder` rows with a per-step skip toggle. Only SCHEDULED/CANCELLED rows
 * can be toggled — anything already SENDING/SENT/FAILED is read-only.
 */
export function InvoiceScheduleEditor({ invoiceId }: { invoiceId: string }) {
  const queryClient = useQueryClient();

  const { data: reminders, isLoading } = useQuery({
    queryKey: ["invoice-reminders", invoiceId],
    queryFn: () => apiFetch<InvoiceReminderDto[]>(`/api/invoices/${invoiceId}/reminders`),
  });

  const toggleSkip = useMutation({
    mutationFn: ({ id, skipped }: { id: string; skipped: boolean }) =>
      apiFetch(`/api/reminders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ skipped }),
      }),
    onSuccess: () => {
      toast.success("Reminder schedule updated");
      queryClient.invalidateQueries({ queryKey: ["invoice-reminders", invoiceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (!reminders || reminders.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No reminders scheduled yet for this invoice.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {reminders.map((reminder) => {
        const canToggle = reminder.status === "SCHEDULED" || reminder.status === "CANCELLED";
        return (
          <div
            key={reminder.id}
            className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                Day {reminder.dayOffset} — {TONE_LABEL[reminder.tone]}
              </p>
              <p className="text-xs text-zinc-500">
                {STATUS_LABEL[reminder.status]} · {format(new Date(reminder.scheduledFor), "d MMM yyyy")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Skip</span>
              <Switch
                aria-label={`Skip reminder for day ${reminder.dayOffset}`}
                checked={reminder.status === "CANCELLED"}
                disabled={!canToggle || toggleSkip.isPending}
                onCheckedChange={(checked) => toggleSkip.mutate({ id: reminder.id, skipped: checked })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
