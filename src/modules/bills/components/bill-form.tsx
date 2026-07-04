"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PartyPicker, type PartyPickerValue } from "@/modules/invoices/components/party-picker";
import { createBillSchema } from "@/lib/validations/bill";
import type { BillDto } from "@/types";

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function defaultBillNumber(): string {
  return `BILL-${Date.now()}`;
}

interface FormState {
  billNumber: string;
  dueDate: string;
  amount: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  billNumber: defaultBillNumber(),
  dueDate: todayPlusDays(30),
  amount: "",
  notes: "",
};

/**
 * Create dialog for a payable bill. Supplier picker reuses `PartyPicker`
 * (Task 19 — extended with a `type` filter rather than forked) restricted to
 * `SUPPLIER` parties. Zod-validated against the existing `createBillSchema`
 * (`src/lib/validations/bill.ts`) so the client and server never drift.
 */
export function BillFormDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [party, setParty] = useState<PartyPickerValue | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Reset the form whenever the dialog transitions to open — adjusting
  // state during render (rather than in a `useEffect`) per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes,
  // same pattern as PartyFormDialog.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setParty(null);
      setForm({ ...EMPTY_FORM, billNumber: defaultBillNumber() });
    }
  }

  const payload = {
    partyId: party?.id ?? "",
    billNumber: form.billNumber,
    dueDate: form.dueDate,
    amount: Number(form.amount) || 0,
    notes: form.notes || undefined,
  };

  const validation = createBillSchema.safeParse(payload);
  const canSave = !!party && validation.success;

  const mutation = useMutation({
    mutationFn: () => apiFetch<BillDto>("/api/bills", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Bill created");
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New bill
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New bill</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Supplier</Label>
            <PartyPicker value={party} onChange={setParty} type="SUPPLIER" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bill-number">Bill #</Label>
              <Input
                id="bill-number"
                value={form.billNumber}
                onChange={(e) => setForm({ ...form, billNumber: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bill-due-date">Due date</Label>
              <Input
                id="bill-due-date"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bill-amount">Amount</Label>
            <Input
              id="bill-amount"
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bill-notes">Notes</Label>
            <Textarea
              id="bill-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
