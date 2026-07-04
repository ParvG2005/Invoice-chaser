"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, FileText } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/shared/money";
import { StatusChip } from "@/components/shared/status-chip";
import { EmptyState } from "@/components/shared/empty-state";
import type { DashboardStats } from "@/types";

type Row = DashboardStats["invoicesDueSoon"][number];
type SortKey = "clientName" | "invoiceNumber" | "amount" | "dueDate" | "status";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "clientName", label: "Party" },
  { key: "invoiceNumber", label: "Invoice #" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "dueDate", label: "Due date" },
  { key: "status", label: "Status" },
];

export function InvoicesDueSoon({ invoices }: { invoices: Row[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? invoices.filter((inv) =>
          `${inv.clientName} ${inv.invoiceNumber}`.toLowerCase().includes(query),
        )
      : invoices;

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "amount") return (a.amount - b.amount) * dir;
      if (sortKey === "dueDate") {
        return (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()) * dir;
      }
      return a[sortKey].localeCompare(b[sortKey]) * dir;
    });
  }, [invoices, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Invoices due soon</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Prioritize collections for these upcoming receivables
          </p>
        </div>
        <Input
          placeholder="Search party or invoice #"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices due soon"
            description="Nothing pending or overdue right now."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableHead
                    key={col.key}
                    className={col.align === "right" ? "text-right" : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 font-medium"
                    >
                      {col.label}
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.clientName}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.invoiceNumber}</TableCell>
                  <TableCell className="text-right font-semibold">
                    <Money amount={inv.amount} currency={inv.currency} />
                  </TableCell>
                  <TableCell
                    className={inv.status === "OVERDUE" ? "font-semibold text-destructive" : undefined}
                  >
                    {new Date(inv.dueDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={inv.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
