"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { createInvoiceSchema } from "@/lib/validations/invoice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PartyPicker, type PartyPickerValue } from "@/modules/invoices/components/party-picker";
import {
  LineItemsEditor,
  useLineItemsEditor,
  type LineItemRow,
} from "@/modules/invoices/components/line-items-editor";
import { totals } from "@/modules/invoices/line-items";
import type { InvoiceDto } from "@/types";

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function defaultInvoiceNumber(): string {
  return `INV-${Date.now()}`;
}

function toLineItemRows(invoice?: InvoiceDto): LineItemRow[] {
  if (!invoice?.lineItems?.length) return [];
  return invoice.lineItems.map((li, index) => ({
    key: `existing-${li.id ?? index}`,
    itemId: li.itemId ?? undefined,
    description: li.description,
    qty: li.quantity,
    rate: li.rate,
    discountPct: li.discountPct ?? 0,
    taxRatePct: li.taxRatePct ?? 0,
  }));
}

interface InvoiceFormProps {
  mode: "create" | "edit";
  invoiceId?: string;
  invoice?: InvoiceDto;
}

export function InvoiceForm({ mode, invoiceId, invoice }: InvoiceFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [party, setParty] = useState<PartyPickerValue | null>(
    invoice?.party ? { id: invoice.party.id, name: invoice.party.name, email: null } : null,
  );
  const [form, setForm] = useState({
    clientName: invoice?.clientName ?? "",
    clientEmail: invoice?.clientEmail ?? "",
    clientPhone: invoice?.clientPhone ?? "",
    invoiceNumber: invoice?.invoiceNumber ?? defaultInvoiceNumber(),
    dueDate: invoice?.dueDate ? invoice.dueDate.slice(0, 10) : todayPlusDays(30),
    notes: invoice?.notes ?? "",
  });

  const [rows, dispatch] = useLineItemsEditor(toLineItemRows(invoice));

  function handlePartySelect(selected: PartyPickerValue) {
    setParty(selected);
    setForm((f) => ({
      ...f,
      clientName: selected.name,
      clientEmail: selected.email ?? f.clientEmail,
    }));
  }

  const computedTotals = totals(rows);

  const payload = useMemo(
    () => ({
      clientName: form.clientName,
      clientEmail: form.clientEmail,
      clientPhone: form.clientPhone || undefined,
      amount: computedTotals.total,
      dueDate: form.dueDate,
      invoiceNumber: form.invoiceNumber,
      notes: form.notes || undefined,
      partyId: party?.id,
      lineItems: rows.map((row) => ({
        itemId: row.itemId,
        description: row.description,
        qty: row.qty,
        rate: row.rate,
        discountPct: row.discountPct,
        taxRatePct: row.taxRatePct,
      })),
    }),
    [form, party, rows, computedTotals.total],
  );

  const validation = createInvoiceSchema.safeParse(payload);
  const canSave = rows.length > 0 && validation.success;

  const mutation = useMutation({
    mutationFn: () =>
      mode === "create"
        ? apiFetch<InvoiceDto>("/api/invoices", { method: "POST", body: JSON.stringify(payload) })
        : apiFetch<InvoiceDto>(`/api/invoices/${invoiceId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          }),
    onSuccess: (savedInvoice) => {
      toast.success(mode === "create" ? "Invoice created" : "Invoice updated");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", savedInvoice.id] });
      router.push(`/dashboard/invoices/${savedInvoice.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Party</Label>
          <PartyPicker value={party} onChange={handlePartySelect} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="clientEmail">Client email</Label>
          <Input
            id="clientEmail"
            type="email"
            value={form.clientEmail}
            onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invoiceNumber">Invoice #</Label>
          <Input
            id="invoiceNumber"
            value={form.invoiceNumber}
            onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dueDate">Due date</Label>
          <Input
            id="dueDate"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="clientPhone">Client phone (WhatsApp)</Label>
          <Input
            id="clientPhone"
            type="tel"
            value={form.clientPhone}
            onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Line items</h2>
        <LineItemsEditor rows={rows} dispatch={dispatch} currency={invoice?.currency ?? "INR"} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Saving…" : mode === "create" ? "Save" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
