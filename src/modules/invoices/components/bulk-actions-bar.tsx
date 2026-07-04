"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { exportCsv } from "@/lib/utils/csv";
import type { InvoiceDto } from "@/types";

export function BulkActionsBar({
  selected,
  onClear,
}: {
  selected: InvoiceDto[];
  onClear: () => void;
}) {
  const queryClient = useQueryClient();
  const ids = selected.map((invoice) => invoice.id);

  function invalidateInvoices() {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }

  const bulkAction = useMutation({
    mutationFn: (action: "delete" | "markPaid" | "sendReminders") =>
      apiFetch("/api/invoices/bulk", {
        method: "POST",
        body: JSON.stringify({ action, ids }),
      }),
    onSuccess: (_data, action) => {
      const messages: Record<typeof action, string> = {
        delete: "Invoices deleted",
        markPaid: "Invoices marked as paid",
        sendReminders: "Reminders queued",
      };
      toast.success(messages[action]);
      invalidateInvoices();
      onClear();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (selected.length === 0) return null;

  return (
    <div
      data-testid="bulk-actions-bar"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t bg-background px-6 py-3 shadow-lg"
    >
      <span className="text-sm font-medium">{selected.length} selected</span>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={bulkAction.isPending}
          onClick={() => bulkAction.mutate("sendReminders")}
        >
          Send reminders
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={bulkAction.isPending}
          onClick={() => bulkAction.mutate("markPaid")}
        >
          Mark paid
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            exportCsv(
              selected.map((invoice) => ({
                invoiceNumber: invoice.invoiceNumber,
                clientName: invoice.clientName,
                clientEmail: invoice.clientEmail,
                amount: invoice.amount,
                dueDate: invoice.dueDate,
                status: invoice.status,
              })),
              "invoices.csv",
            )
          }
        >
          Export CSV
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={bulkAction.isPending}
          onClick={() => bulkAction.mutate("delete")}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
