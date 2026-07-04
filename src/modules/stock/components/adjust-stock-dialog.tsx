"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { adjustStockSchema } from "@/lib/validations/stock";
import type { StockMovementDto } from "@/types";

/**
 * Manual stock correction dialog on the item detail page. Calls
 * `stockService.adjust` (via `POST /api/items/[id]/adjust`), never
 * `recordMovement` directly, so `sourceType` is always `ADJUSTMENT` and the
 * reason is always captured.
 */
export function AdjustStockDialog({ itemId }: { itemId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQty("");
      setReason("");
      setError(null);
    }
  }

  const mutation = useMutation({
    mutationFn: (payload: { qty: number; reason: string }) =>
      apiFetch<StockMovementDto>(`/api/items/${itemId}/adjust`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Stock adjusted");
      queryClient.invalidateQueries({ queryKey: ["item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["item-movements", itemId] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit() {
    const payload = { qty: Number(qty), reason: reason.trim() };
    const result = adjustStockSchema.safeParse(payload);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setError(null);
    mutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Adjust stock
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="adjust-qty">Quantity</Label>
            <Input
              id="adjust-qty"
              type="number"
              step="any"
              placeholder="Positive to add, negative to remove"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
