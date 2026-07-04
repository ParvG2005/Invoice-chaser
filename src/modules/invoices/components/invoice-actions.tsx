"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  useDuplicateInvoice,
  useMarkPaid,
  useSendReminder,
  useSnoozeInvoice,
  useWriteOffInvoice,
} from "@/modules/invoices/hooks";
import type { InvoiceDto } from "@/types";

const SNOOZE_DAYS = 7;

/**
 * Action bar for the invoice detail page. Drives the same mutation hooks as
 * `invoice-row-actions.tsx` (the invoices-list row menu) — no duplicated
 * fetch logic between the two surfaces.
 */
export function InvoiceActions({ invoice }: { invoice: InvoiceDto }) {
  const router = useRouter();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  const markPaid = useMarkPaid(invoice.id);
  const sendReminder = useSendReminder(invoice.id);
  const snooze = useSnoozeInvoice(invoice.id);
  const duplicate = useDuplicateInvoice(invoice.id);
  const writeOff = useWriteOffInvoice(invoice.id);

  function handleDownloadPdf() {
    window.open(
      `/dashboard/invoices/${invoice.id}/print`,
      "_blank",
      "noopener,noreferrer,width=900,height=700",
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={() => setMarkPaidOpen(true)}>
        Mark paid
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => router.push(`/dashboard/payments?record=1&invoiceId=${invoice.id}`)}
      >
        Record payment
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={sendReminder.isPending}
        onClick={() => sendReminder.mutate()}
      >
        Send reminder now
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={snooze.isPending}
        onClick={() => snooze.mutate(SNOOZE_DAYS)}
      >
        Snooze
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={duplicate.isPending}
        onClick={() => duplicate.mutate()}
      >
        Duplicate
      </Button>
      <Button
        type="button"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        onClick={() => setWriteOffOpen(true)}
      >
        Write off
      </Button>
      <Button type="button" variant="outline" onClick={handleDownloadPdf}>
        Download PDF
      </Button>

      <ConfirmDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        title="Mark invoice as paid?"
        description={`This will mark ${invoice.invoiceNumber} as fully paid.`}
        confirmLabel="Mark paid"
        onConfirm={() => markPaid.mutate()}
      />

      <ConfirmDialog
        open={writeOffOpen}
        onOpenChange={setWriteOffOpen}
        title="Write off this invoice?"
        description={`${invoice.invoiceNumber} will be marked as written off. This cannot be easily undone.`}
        confirmLabel="Write off"
        destructive
        onConfirm={() => writeOff.mutate()}
      />
    </div>
  );
}
