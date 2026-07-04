import Link from "next/link";
import { Plus, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuickActions() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild>
        <Link href="/dashboard/invoices/new">
          <Plus className="h-4 w-4" />
          New invoice
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/dashboard/payments?record=1">
          <Wallet className="h-4 w-4" />
          Record payment
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/dashboard/imports">
          <Upload className="h-4 w-4" />
          Import from Tally
        </Link>
      </Button>
    </div>
  );
}
