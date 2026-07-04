"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createItemSchema, updateItemSchema } from "@/lib/validations/item";
import type { ItemDto } from "@/types";

interface FormState {
  name: string;
  sku: string;
  unit: string;
  hsnCode: string;
  gstRate: string;
  reorderLevel: string;
  purchasePrice: string;
  salePrice: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  sku: "",
  unit: "Nos",
  hsnCode: "",
  gstRate: "",
  reorderLevel: "",
  purchasePrice: "",
  salePrice: "",
};

function toFormState(item: ItemDto): FormState {
  return {
    name: item.name,
    sku: item.sku ?? "",
    unit: item.unit,
    hsnCode: item.hsnCode ?? "",
    gstRate: item.gstRate != null ? String(item.gstRate) : "",
    reorderLevel: item.reorderLevel != null ? String(item.reorderLevel) : "",
    purchasePrice: item.purchasePrice != null ? String(item.purchasePrice) : "",
    salePrice: item.salePrice != null ? String(item.salePrice) : "",
  };
}

/** Undefined-ifies blank strings so optional zod fields don't fail on "". */
function toPayload(form: FormState) {
  return {
    name: form.name.trim(),
    sku: form.sku.trim() || undefined,
    unit: form.unit.trim() || undefined,
    hsnCode: form.hsnCode.trim() || undefined,
    gstRate: form.gstRate.trim() ? Number(form.gstRate) : undefined,
    reorderLevel: form.reorderLevel.trim() ? Number(form.reorderLevel) : undefined,
    purchasePrice: form.purchasePrice.trim() ? Number(form.purchasePrice) : undefined,
    salePrice: form.salePrice.trim() ? Number(form.salePrice) : undefined,
  };
}

/**
 * Create/edit dialog for a catalog item. Zod-validated against the existing
 * `createItemSchema`/`updateItemSchema` (`src/lib/validations/item.ts`)
 * rather than a re-declared schema, so the client and server never drift.
 */
export function ItemFormDialog({
  item,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  /** Present => edit mode; absent => create mode. */
  item?: ItemDto;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const [form, setForm] = useState<FormState>(item ? toFormState(item) : EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset the form whenever the dialog transitions to open — adjusting
  // state during render (rather than in a `useEffect`), same pattern as
  // PartyFormDialog/BillFormDialog.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(item ? toFormState(item) : EMPTY_FORM);
      setErrors({});
    }
  }

  const isEdit = !!item;

  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof toPayload>) =>
      isEdit
        ? apiFetch<ItemDto>(`/api/items/${item!.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : apiFetch<ItemDto>("/api/items", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success(isEdit ? "Item updated" : "Item created");
      queryClient.invalidateQueries({ queryKey: ["items"] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ["item", item!.id] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit() {
    const payload = toPayload(form);
    const schema = isEdit ? updateItemSchema : createItemSchema;
    const result = schema.safeParse(payload);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    mutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined ? (
        trigger
      ) : !isEdit ? (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New item
        </Button>
      ) : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit item" : "New item"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="item-name">Name</Label>
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-sku">SKU</Label>
              <Input
                id="item-sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="item-unit">Unit</Label>
              <Input
                id="item-unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-hsn">HSN code</Label>
              <Input
                id="item-hsn"
                value={form.hsnCode}
                onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="item-gst-rate">GST rate (%)</Label>
              <Input
                id="item-gst-rate"
                type="number"
                min={0}
                max={100}
                value={form.gstRate}
                onChange={(e) => setForm({ ...form, gstRate: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-reorder-level">Reorder level</Label>
              <Input
                id="item-reorder-level"
                type="number"
                min={0}
                value={form.reorderLevel}
                onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="item-purchase-price">Purchase price</Label>
              <Input
                id="item-purchase-price"
                type="number"
                min={0}
                step="0.01"
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-sale-price">Sale price</Label>
              <Input
                id="item-sale-price"
                type="number"
                min={0}
                step="0.01"
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!form.name.trim() || mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
