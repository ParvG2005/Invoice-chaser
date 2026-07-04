"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";

/**
 * Shared bill mutation hooks — mirrors `src/modules/invoices/hooks.ts`
 * (Task 11/12/19) so the bills-list row menu and the bill detail page drive
 * the same fetch/mutation logic instead of duplicating it. Each hook
 * invalidates the `["bills"]` list query and the per-bill `["bill", id]`
 * detail query so both surfaces stay fresh after a mutation from either one.
 */
function invalidateBillQueries(queryClient: ReturnType<typeof useQueryClient>, billId: string) {
  queryClient.invalidateQueries({ queryKey: ["bills"] });
  queryClient.invalidateQueries({ queryKey: ["bill", billId] });
  queryClient.invalidateQueries({ queryKey: ["bill-payments", billId] });
}

export function useMarkBillPaid(billId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/bills/${billId}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Bill marked as paid");
      invalidateBillQueries(queryClient, billId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useWriteOffBill(billId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/bills/${billId}/write-off`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Bill written off");
      invalidateBillQueries(queryClient, billId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
