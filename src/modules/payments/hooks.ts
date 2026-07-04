"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import type { BillDto, InvoiceDto, PaymentDto } from "@/types";
import type { OpenDoc } from "@/modules/payments/allocation";

export interface RecordPaymentInput {
  partyId: string;
  direction: "IN" | "OUT";
  amount: number;
  mode: "CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "CARD" | "OTHER";
  paymentDate?: string;
  allocations?: { documentId: string; amount: number }[];
}

/** Open (not fully paid, not written off) invoices for a party, shaped for the allocation editor. */
function toOpenDocs(invoices: InvoiceDto[]): (OpenDoc & { label: string })[] {
  return invoices
    .filter((invoice) => invoice.status !== "PAID" && invoice.status !== "WRITTEN_OFF")
    .map((invoice) => ({
      id: invoice.id,
      label: invoice.invoiceNumber,
      dueDate: invoice.dueDate,
      balanceDue: Math.round(((invoice.totalAmount ?? invoice.amount) - invoice.amountPaid) * 100) / 100,
    }))
    .filter((doc) => doc.balanceDue > 0);
}

/** Open (not fully paid, not written off) bills for a party, shaped for the allocation editor. */
function toOpenBillDocs(bills: BillDto[]): (OpenDoc & { label: string })[] {
  return bills
    .filter((bill) => bill.status !== "PAID" && bill.status !== "WRITTEN_OFF")
    .map((bill) => ({
      id: bill.id,
      label: bill.billNumber,
      dueDate: bill.dueDate,
      balanceDue: bill.outstanding,
    }))
    .filter((doc) => doc.balanceDue > 0);
}

/** Open invoices for a party (direction IN). */
export function useOpenInvoicesForParty(partyId: string | null, direction: "IN" | "OUT") {
  return useQuery({
    queryKey: ["invoices", "open", partyId],
    queryFn: () => apiFetch<InvoiceDto[]>(`/api/invoices?partyId=${partyId}&limit=200`),
    enabled: !!partyId && direction === "IN",
    select: toOpenDocs,
  });
}

/** Open bills for a party (direction OUT) — the `GET /api/bills` equivalent of the above (Task 19). */
export function useOpenBillsForParty(partyId: string | null, direction: "IN" | "OUT") {
  return useQuery({
    queryKey: ["bills", "open", partyId],
    queryFn: () => apiFetch<BillDto[]>(`/api/bills?partyId=${partyId}&limit=200`),
    enabled: !!partyId && direction === "OUT",
    select: toOpenBillDocs,
  });
}

export function useInvoice(invoiceId: string | null) {
  return useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => apiFetch<InvoiceDto>(`/api/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  });
}

export function useBill(billId: string | null) {
  return useQuery({
    queryKey: ["bill", billId],
    queryFn: () => apiFetch<BillDto>(`/api/bills/${billId}`),
    enabled: !!billId,
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) =>
      apiFetch<PaymentDto>("/api/payments", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["bill"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
