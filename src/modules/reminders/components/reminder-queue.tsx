"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api/client";
import { DataTable } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { UpcomingReminderDto } from "@/types";

/**
 * Upcoming Reminders queue (Task 26). Reuses the existing "Send reminder now"
 * (`POST /api/reminders/trigger`) and "Snooze" (`POST /api/invoices/[id]/snooze`)
 * endpoints from the invoice detail actions — no new mutation logic invented.
 */
export function ReminderQueue() {
  const queryClient = useQueryClient();
  const [sendTarget, setSendTarget] = useState<UpcomingReminderDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["reminders-upcoming"],
    queryFn: () => apiFetch<UpcomingReminderDto[]>("/api/reminders"),
  });

  const sendNow = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch("/api/reminders/trigger", {
        method: "POST",
        body: JSON.stringify({ invoiceId }),
      }),
    onSuccess: () => {
      toast.success("Reminder sent");
      queryClient.invalidateQueries({ queryKey: ["reminders-upcoming"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const snooze = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch(`/api/invoices/${invoiceId}/snooze`, {
        method: "POST",
        body: JSON.stringify({ days: 3 }),
      }),
    onSuccess: () => {
      toast.success("Reminder snoozed");
      queryClient.invalidateQueries({ queryKey: ["reminders-upcoming"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo<ColumnDef<UpcomingReminderDto, unknown>[]>(
    () => [
      {
        accessorKey: "invoiceNumber",
        header: "Invoice",
        cell: ({ row }) => (
          <Link
            href={`/dashboard/invoices/${row.original.invoiceId}`}
            className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            {row.original.invoiceNumber}
          </Link>
        ),
      },
      { accessorKey: "partyName", header: "Party", cell: ({ row }) => row.original.partyName ?? "—" },
      { accessorKey: "channel", header: "Channel" },
      {
        accessorKey: "scheduledFor",
        header: "Scheduled",
        cell: ({ row }) => format(new Date(row.original.scheduledFor), "d MMM yyyy"),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => <Money amount={row.original.amount} currency={row.original.currency} />,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSendTarget(row.original)}
            >
              Send now
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={snooze.isPending}
              onClick={() => snooze.mutate(row.original.invoiceId)}
            >
              Snooze
            </Button>
          </div>
        ),
      },
    ],
    [snooze],
  );

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Upcoming Reminders</h2>
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} />

      <ConfirmDialog
        open={sendTarget !== null}
        onOpenChange={(open) => !open && setSendTarget(null)}
        title="Send reminder now?"
        description={
          sendTarget
            ? `This will immediately send a reminder email for ${sendTarget.invoiceNumber}.`
            : ""
        }
        confirmLabel="Send now"
        onConfirm={() => {
          if (sendTarget) sendNow.mutate(sendTarget.invoiceId);
          setSendTarget(null);
        }}
      />
    </div>
  );
}
