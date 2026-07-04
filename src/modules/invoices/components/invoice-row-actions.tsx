"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  useDuplicateInvoice,
  useMarkPaid,
  useSendReminder,
  useSnoozeInvoice,
  useWriteOffInvoice,
} from "@/modules/invoices/hooks";
import type { InvoiceDto } from "@/types";

const SNOOZE_OPTIONS = [3, 7, 14];

const WHATSAPP_ENABLED = process.env.NEXT_PUBLIC_WHATSAPP_ENABLED === "true";

export function InvoiceRowActions({ invoice }: { invoice: InvoiceDto }) {
  const router = useRouter();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const markPaid = useMarkPaid(invoice.id);
  const sendReminder = useSendReminder(invoice.id);
  const snooze = useSnoozeInvoice(invoice.id);
  const duplicate = useDuplicateInvoice(invoice.id);
  const writeOff = useWriteOffInvoice(invoice.id);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMarkPaidOpen(true)}>Mark paid</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              router.push(`/dashboard/payments?record=1&invoiceId=${invoice.id}`)
            }
          >
            Record partial payment
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Send reminder now</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => sendReminder.mutate()}>Email</DropdownMenuItem>
              {WHATSAPP_ENABLED ? (
                <DropdownMenuItem onSelect={() => sendReminder.mutate()}>WhatsApp</DropdownMenuItem>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <DropdownMenuItem disabled>WhatsApp</DropdownMenuItem>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Available after Phase 4</TooltipContent>
                </Tooltip>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => setSnoozeOpen(true)}>Snooze</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => duplicate.mutate()}>Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setWriteOffOpen(true)}>
            Write off
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/dashboard/invoices/${invoice.id}/print`}>Export PDF</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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

      <Dialog open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Snooze reminders</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            {SNOOZE_OPTIONS.map((days) => (
              <Button
                key={days}
                type="button"
                variant="outline"
                disabled={snooze.isPending}
                onClick={() => snooze.mutate(days, { onSuccess: () => setSnoozeOpen(false) })}
              >
                {days} days
              </Button>
            ))}
          </div>
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </>
  );
}
