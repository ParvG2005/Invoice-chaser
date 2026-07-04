"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";

/**
 * Shared invoice mutation hooks. Extracted from `invoice-row-actions.tsx`
 * (Task 11/12) so the invoices-list row menu and the invoice detail page
 * (Task 13) both drive the same fetch/mutation logic instead of duplicating
 * it. Each hook invalidates the `["invoices"]` list query and the
 * per-invoice `["invoice", id]` detail query so both surfaces stay fresh
 * after a mutation from either one.
 */
function invalidateInvoiceQueries(queryClient: ReturnType<typeof useQueryClient>, invoiceId: string) {
  queryClient.invalidateQueries({ queryKey: ["invoices"] });
  queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
  queryClient.invalidateQueries({ queryKey: ["invoice-timeline", invoiceId] });
}

export function useMarkPaid(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "PAID" }),
      }),
    onSuccess: () => {
      toast.success("Invoice marked as paid");
      invalidateInvoiceQueries(queryClient, invoiceId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSendReminder(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch("/api/reminders/trigger", {
        method: "POST",
        body: JSON.stringify({ invoiceId }),
      }),
    onSuccess: () => {
      toast.success("Reminder queued");
      invalidateInvoiceQueries(queryClient, invoiceId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSnoozeInvoice(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (days: number) =>
      apiFetch(`/api/invoices/${invoiceId}/snooze`, {
        method: "POST",
        body: JSON.stringify({ days }),
      }),
    onSuccess: () => {
      toast.success("Reminders snoozed");
      invalidateInvoiceQueries(queryClient, invoiceId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDuplicateInvoice(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/invoices/${invoiceId}/duplicate`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Invoice duplicated");
      invalidateInvoiceQueries(queryClient, invoiceId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useWriteOffInvoice(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/invoices/${invoiceId}/write-off`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Invoice written off");
      invalidateInvoiceQueries(queryClient, invoiceId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
