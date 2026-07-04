import Link from "next/link";
import { format } from "date-fns";
import { StatusChip } from "@/components/shared/status-chip";
import { Money } from "@/components/shared/money";
import type { InvoiceDto } from "@/types";

/**
 * Header card for the invoice detail page: number, status chip, party link,
 * key dates, and the subtotal/tax/total/paid/balance breakdown. The party
 * page (`/dashboard/parties/[partyId]`) doesn't exist until Task 17 — the
 * link is still rendered per the incremental-linking pattern already used
 * elsewhere in this phase (e.g. `/dashboard/payments`).
 */
export function InvoiceSummaryCard({ invoice }: { invoice: InvoiceDto }) {
  const balance = invoice.totalAmount !== null ? invoice.totalAmount - invoice.amountPaid : invoice.amount - invoice.amountPaid;

  return (
    <div className="space-y-4 rounded-xl border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
          {invoice.party ? (
            <Link
              href={`/dashboard/parties/${invoice.party.id}`}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {invoice.party.name}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">{invoice.clientName}</p>
          )}
        </div>
        <StatusChip status={invoice.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">Issue date</p>
          <p className="font-medium">{format(new Date(invoice.createdAt), "MMM d, yyyy")}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Due date</p>
          <p className="font-medium">{format(new Date(invoice.dueDate), "MMM d, yyyy")}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Subtotal</p>
          <p className="font-medium">
            <Money amount={invoice.subtotal ?? invoice.amount} currency={invoice.currency} />
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Tax</p>
          <p className="font-medium">
            <Money amount={invoice.taxAmount ?? 0} currency={invoice.currency} />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground">Total</p>
          <p className="text-lg font-semibold">
            <Money amount={invoice.totalAmount ?? invoice.amount} currency={invoice.currency} />
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Amount paid</p>
          <p className="text-lg font-semibold">
            <Money amount={invoice.amountPaid} currency={invoice.currency} />
          </p>
        </div>
        <div data-testid="balance-due">
          <p className="text-muted-foreground">Balance due</p>
          <p className="text-lg font-semibold">
            <Money amount={balance} currency={invoice.currency} />
          </p>
        </div>
      </div>
    </div>
  );
}
