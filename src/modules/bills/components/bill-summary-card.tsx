import Link from "next/link";
import { format } from "date-fns";
import { StatusChip } from "@/components/shared/status-chip";
import { Money } from "@/components/shared/money";
import type { BillDto } from "@/types";

/** Header card for the bill detail page: number, status chip, supplier link, dates, amounts. */
export function BillSummaryCard({ bill }: { bill: BillDto }) {
  const balance = bill.outstanding;

  return (
    <div className="space-y-4 rounded-xl border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{bill.billNumber}</h1>
          {bill.party ? (
            <Link
              href={`/dashboard/parties/${bill.party.id}`}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {bill.party.name}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Unknown supplier</p>
          )}
        </div>
        <StatusChip status={bill.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">Bill date</p>
          <p className="font-medium">
            {bill.billDate ? format(new Date(bill.billDate), "MMM d, yyyy") : "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Due date</p>
          <p className="font-medium">{format(new Date(bill.dueDate), "MMM d, yyyy")}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Amount</p>
          <p className="font-medium">
            <Money amount={bill.amount} currency={bill.currency} />
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Amount paid</p>
          <p className="font-medium">
            <Money amount={bill.amountPaid} currency={bill.currency} />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 border-t pt-4 text-sm sm:grid-cols-3">
        <div data-testid="balance-due">
          <p className="text-muted-foreground">Balance due</p>
          <p className="text-lg font-semibold">
            <Money amount={balance} currency={bill.currency} />
          </p>
        </div>
      </div>
    </div>
  );
}
