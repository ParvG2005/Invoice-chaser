import { cn } from "@/lib/utils/cn";

export type ChipStatus =
  | "PENDING"
  | "OVERDUE"
  | "PAID"
  | "PARTIALLY_PAID"
  | "WRITTEN_OFF"
  | "DRAFT";

const styles: Record<ChipStatus, string> = {
  PENDING: "bg-warning/15 text-warning border-warning/30",
  OVERDUE: "bg-destructive/15 text-destructive border-destructive/30",
  PAID: "bg-success/15 text-success border-success/30",
  PARTIALLY_PAID: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  WRITTEN_OFF: "bg-muted text-muted-foreground border-border",
  DRAFT: "bg-secondary text-secondary-foreground border-border",
};

const labels: Record<ChipStatus, string> = {
  PENDING: "Pending",
  OVERDUE: "Overdue",
  PAID: "Paid",
  PARTIALLY_PAID: "Partially paid",
  WRITTEN_OFF: "Written off",
  DRAFT: "Draft",
};

export function StatusChip({ status }: { status: ChipStatus }) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {labels[status]}
    </span>
  );
}
