"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { ItemTable } from "@/modules/stock/components/item-table";
import { ItemFormDialog } from "@/modules/stock/components/item-form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { ItemDto } from "@/types";

export default function StockPage() {
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["items", { lowStockOnly }],
    queryFn: () =>
      apiFetch<ItemDto[]>(`/api/items?limit=200${lowStockOnly ? "&lowStockOnly=true" : ""}`),
  });

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock</h1>
          <p className="text-zinc-500">Item catalog, stock on hand, and valuation.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="low-stock-only"
              aria-label="Low stock only"
              checked={lowStockOnly}
              onCheckedChange={setLowStockOnly}
            />
            <Label htmlFor="low-stock-only">Low stock only</Label>
          </div>
          <ItemFormDialog />
        </div>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : <ItemTable items={items ?? []} isLoading={isLoading} />}
    </div>
  );
}
