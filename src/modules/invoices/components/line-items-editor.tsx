"use client";

import { useReducer } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/shared/money";
import { ItemPicker } from "@/modules/invoices/components/item-picker";
import { lineAmount, totals, type LineItemInput } from "@/modules/invoices/line-items";
import type { ItemSearchResultDto } from "@/types";

/** One row in the line-items editor; `key` is a stable client-side id (not persisted). */
export interface LineItemRow extends LineItemInput {
  key: string;
}

type Action =
  | { type: "add" }
  | { type: "remove"; key: string }
  | { type: "update"; key: string; patch: Partial<LineItemInput> };

let nextKey = 0;
function newRow(): LineItemRow {
  nextKey += 1;
  return {
    key: `row-${nextKey}`,
    description: "",
    qty: 1,
    rate: 0,
    discountPct: 0,
    taxRatePct: 0,
  };
}

export function lineItemsReducer(rows: LineItemRow[], action: Action): LineItemRow[] {
  switch (action.type) {
    case "add":
      return [...rows, newRow()];
    case "remove":
      return rows.filter((row) => row.key !== action.key);
    case "update":
      return rows.map((row) => (row.key === action.key ? { ...row, ...action.patch } : row));
    default:
      return rows;
  }
}

export function useLineItemsEditor(initial: LineItemRow[] = []) {
  return useReducer(lineItemsReducer, initial);
}

interface LineItemsEditorProps {
  rows: LineItemRow[];
  dispatch: React.Dispatch<Action>;
  /** Document currency the totals are denominated in (defaults to INR, matching the Invoice model's default). */
  currency?: string;
}

export function LineItemsEditor({ rows, dispatch, currency = "INR" }: LineItemsEditorProps) {
  const rowTotals = totals(rows);

  function handleItemSelect(key: string, item: ItemSearchResultDto) {
    dispatch({
      type: "update",
      key,
      patch: {
        itemId: item.id,
        description: item.name,
        rate: item.salePrice ?? 0,
        taxRatePct: item.taxRate ?? 0,
      },
    });
  }

  return (
    <div className="space-y-3" data-testid="line-items-editor">
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.key}
            data-testid="line-item-row"
            className="grid grid-cols-12 items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
          >
            <div className="col-span-3">
              <ItemPicker label={row.description || "Pick item…"} onSelect={(item) => handleItemSelect(row.key, item)} />
            </div>
            <Input
              className="col-span-3"
              placeholder="Description"
              aria-label="Description"
              value={row.description}
              onChange={(e) =>
                dispatch({ type: "update", key: row.key, patch: { description: e.target.value } })
              }
            />
            <Input
              className="col-span-1"
              type="number"
              min="0"
              step="0.01"
              aria-label="Qty"
              value={row.qty}
              onChange={(e) =>
                dispatch({ type: "update", key: row.key, patch: { qty: Number(e.target.value) } })
              }
            />
            <Input
              className="col-span-1"
              type="number"
              min="0"
              step="0.01"
              aria-label="Rate"
              value={row.rate}
              onChange={(e) =>
                dispatch({ type: "update", key: row.key, patch: { rate: Number(e.target.value) } })
              }
            />
            <Input
              className="col-span-1"
              type="number"
              min="0"
              max="100"
              step="0.01"
              aria-label="Discount %"
              value={row.discountPct}
              onChange={(e) =>
                dispatch({ type: "update", key: row.key, patch: { discountPct: Number(e.target.value) } })
              }
            />
            <Input
              className="col-span-1"
              type="number"
              min="0"
              max="100"
              step="0.01"
              aria-label="Tax %"
              value={row.taxRatePct}
              onChange={(e) =>
                dispatch({ type: "update", key: row.key, patch: { taxRatePct: Number(e.target.value) } })
              }
            />
            <div className="col-span-1 text-right text-sm font-medium tabular-nums" data-testid="line-item-amount">
              <Money amount={lineAmount(row)} currency={currency} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="col-span-1 justify-self-end"
              aria-label="Remove line"
              onClick={() => dispatch({ type: "remove", key: row.key })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "add" })}>
        Add line
      </Button>

      <div className="flex flex-col items-end gap-1 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
        <div className="flex w-56 justify-between" data-testid="totals-subtotal">
          <span className="text-zinc-500">Subtotal</span>
          <Money amount={rowTotals.subtotal} currency={currency} />
        </div>
        <div className="flex w-56 justify-between" data-testid="totals-tax">
          <span className="text-zinc-500">Tax</span>
          <Money amount={rowTotals.taxAmount} currency={currency} />
        </div>
        <div className="flex w-56 justify-between text-base font-semibold" data-testid="totals-total">
          <span>Total</span>
          <Money amount={rowTotals.total} currency={currency} />
        </div>
      </div>
    </div>
  );
}
