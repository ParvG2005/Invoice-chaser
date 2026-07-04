"use client";

import { useMemo } from "react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { format } from "date-fns";
import { DataTable } from "@/components/shared/data-table";
import { StatusChip } from "@/components/shared/status-chip";
import { Money } from "@/components/shared/money";
import { Checkbox } from "@/components/ui/checkbox";
import { InvoiceRowActions } from "@/modules/invoices/components/invoice-row-actions";
import type { InvoiceDto } from "@/types";

interface InvoiceTableProps {
  invoices: InvoiceDto[];
  isLoading?: boolean;
  selection: {
    state: RowSelectionState;
    onChange: (state: RowSelectionState) => void;
  };
}

export function InvoiceTable({ invoices, isLoading, selection }: InvoiceTableProps) {
  const columns = useMemo<ColumnDef<InvoiceDto, unknown>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={`Select ${row.original.invoiceNumber}`}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "invoiceNumber",
        header: "Invoice #",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.invoiceNumber}</span>
        ),
      },
      {
        accessorKey: "clientName",
        header: "Client",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-foreground">{row.original.clientName}</div>
            <div className="text-xs text-muted-foreground">{row.original.clientEmail}</div>
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => <Money amount={row.original.amount} currency={row.original.currency} />,
      },
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => format(new Date(row.original.dueDate), "MMM d, yyyy"),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusChip status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => <InvoiceRowActions invoice={row.original} />,
        enableSorting: false,
      },
    ],
    [],
  );

  if (!isLoading && invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <p className="text-muted-foreground">No invoices yet. Upload a CSV or create one manually.</p>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={invoices}
      isLoading={isLoading}
      selection={{
        state: selection.state,
        onChange: selection.onChange,
        getRowId: (invoice) => invoice.id,
      }}
    />
  );
}
