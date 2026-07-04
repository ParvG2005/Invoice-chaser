"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { PartyPicker, type PartyPickerValue } from "@/modules/invoices/components/party-picker";
import { Money } from "@/components/shared/money";
import { AllocationEditor } from "@/modules/payments/components/allocation-editor";
import {
  useBill,
  useInvoice,
  useOpenBillsForParty,
  useOpenInvoicesForParty,
  useRecordPayment,
} from "@/modules/payments/hooks";

type PaymentMode = "CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "CARD" | "OTHER";
type Direction = "IN" | "OUT";

const MODE_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "UPI", label: "UPI" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

interface FormState {
  party: PartyPickerValue | null;
  direction: Direction;
  amount: string;
  mode: PaymentMode;
  paymentDate: string;
}

const EMPTY_FORM: FormState = {
  party: null,
  direction: "IN",
  amount: "",
  mode: "UPI",
  paymentDate: new Date().toISOString().slice(0, 10),
};

/**
 * Two-step "Record payment" sheet: step 1 collects party/direction/amount/
 * mode/date, step 2 allocates the amount across the party's open invoices
 * (bills for OUT direction once Task 19 ships `GET /api/bills`).
 *
 * Reads `?record=1&invoiceId=` (Tasks 8/12 deep links) to auto-open pre-filled
 * for a specific invoice, jumping straight to step 2 with that invoice's row
 * focused. `?record=1&direction=OUT&billId=` (Task 19) does the same for a
 * bill, pre-filling the supplier and focusing that bill's allocation row.
 */
export function RecordPaymentSheet() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recordParam = searchParams.get("record");
  const invoiceIdParam = searchParams.get("invoiceId");
  const billIdParam = searchParams.get("billId");

  // Initialize from the URL so a direct/full-page navigation to
  // `?record=1` (the Task 8/12 deep links, which route to this as a
  // brand-new page mount) opens the sheet immediately, not just on a
  // same-instance param change.
  const [open, setOpen] = useState(recordParam === "1");
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null);
  const [appliedInvoiceId, setAppliedInvoiceId] = useState<string | null>(null);
  const [appliedBillId, setAppliedBillId] = useState<string | null>(null);

  // Open the sheet in response to the `?record=1` deep link. Adjusting state
  // during render (rather than a useEffect) per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes,
  // same pattern as PartyFormDialog.
  const [prevRecordParam, setPrevRecordParam] = useState(recordParam);
  if (recordParam !== prevRecordParam) {
    setPrevRecordParam(recordParam);
    if (recordParam === "1") setOpen(true);
  }

  const { data: deepLinkInvoice } = useInvoice(
    invoiceIdParam && invoiceIdParam !== appliedInvoiceId ? invoiceIdParam : null,
  );
  if (deepLinkInvoice && deepLinkInvoice.id !== appliedInvoiceId && deepLinkInvoice.party) {
    setAppliedInvoiceId(deepLinkInvoice.id);
    setForm((f) => ({
      ...f,
      party: {
        id: deepLinkInvoice.party!.id,
        name: deepLinkInvoice.party!.name,
        email: deepLinkInvoice.clientEmail ?? null,
      },
      direction: "IN",
    }));
    setStep(2);
    setFocusTargetId(deepLinkInvoice.id);
  }

  const { data: deepLinkBill } = useBill(
    billIdParam && billIdParam !== appliedBillId ? billIdParam : null,
  );
  if (deepLinkBill && deepLinkBill.id !== appliedBillId && deepLinkBill.party) {
    setAppliedBillId(deepLinkBill.id);
    setForm((f) => ({
      ...f,
      party: {
        id: deepLinkBill.party!.id,
        name: deepLinkBill.party!.name,
        email: null,
      },
      direction: "OUT",
    }));
    setStep(2);
    setFocusTargetId(deepLinkBill.id);
  }

  const { data: openInvoiceDocs = [], isLoading: openInvoiceDocsLoading } = useOpenInvoicesForParty(
    form.party?.id ?? null,
    form.direction,
  );
  const { data: openBillDocs = [], isLoading: openBillDocsLoading } = useOpenBillsForParty(
    form.party?.id ?? null,
    form.direction,
  );
  const openDocs = form.direction === "IN" ? openInvoiceDocs : openBillDocs;
  const openDocsLoading = form.direction === "IN" ? openInvoiceDocsLoading : openBillDocsLoading;

  const recordPayment = useRecordPayment();

  function resetAndClose() {
    setOpen(false);
    setStep(1);
    setForm(EMPTY_FORM);
    setAllocations({});
    setFocusTargetId(null);
    setAppliedInvoiceId(null);
    setAppliedBillId(null);
    router.replace("/dashboard/payments");
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetAndClose();
    } else {
      setOpen(true);
    }
  }

  const amount = Number(form.amount) || 0;
  const canContinue = !!form.party && amount > 0;

  function handleSave() {
    const explicitAllocations = Object.entries(allocations)
      .map(([documentId, value]) => ({ documentId, amount: Number(value) || 0 }))
      .filter((a) => a.amount > 0);

    recordPayment.mutate(
      {
        partyId: form.party!.id,
        direction: form.direction,
        amount,
        mode: form.mode,
        paymentDate: form.paymentDate || undefined,
        allocations: explicitAllocations,
      },
      { onSuccess: () => resetAndClose() },
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button type="button" onClick={() => setOpen(true)}>
        Record payment
      </Button>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Record payment</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {step === 1 ? (
            <>
              <div className="grid gap-2">
                <Label>Party</Label>
                <PartyPicker value={form.party} onChange={(party) => setForm({ ...form, party })} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="payment-direction">Direction</Label>
                  <Select
                    value={form.direction}
                    onValueChange={(value) => setForm({ ...form, direction: value as Direction })}
                  >
                    <SelectTrigger id="payment-direction" aria-label="Direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN">In</SelectItem>
                      <SelectItem value="OUT">Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payment-mode">Mode</Label>
                  <Select
                    value={form.mode}
                    onValueChange={(value) => setForm({ ...form, mode: value as PaymentMode })}
                  >
                    <SelectTrigger id="payment-mode" aria-label="Mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODE_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="payment-amount">Amount</Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payment-date">Date</Label>
                  <Input
                    id="payment-date"
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="font-medium">{form.party?.name}</span>
                <span className="text-muted-foreground"> · {form.direction} · </span>
                <span className="font-medium">
                  <Money amount={amount} />
                </span>
              </div>
              {openDocsLoading ? (
                <p className="text-sm text-muted-foreground">Loading open documents…</p>
              ) : (
                <AllocationEditor
                  amount={amount}
                  openDocs={openDocs}
                  allocations={allocations}
                  onChange={(id, value) => setAllocations((a) => ({ ...a, [id]: value }))}
                  focusTargetId={focusTargetId}
                />
              )}
            </>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t">
          {step === 2 && (
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button type="button" disabled={!canContinue} onClick={() => setStep(2)}>
              Continue
            </Button>
          ) : (
            <Button type="button" disabled={recordPayment.isPending} onClick={handleSave}>
              {recordPayment.isPending ? "Saving…" : "Save"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
