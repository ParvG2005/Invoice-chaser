"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Money } from "@/components/shared/money";
import { MovementTable } from "@/modules/stock/components/movement-table";
import { AdjustStockDialog } from "@/modules/stock/components/adjust-stock-dialog";
import { ItemFormDialog } from "@/modules/stock/components/item-form-dialog";
import { Button } from "@/components/ui/button";
import type { ItemDto, StockMovementDto } from "@/types";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function ItemDetailPage() {
  const params = useParams<{ id: string }>();
  const itemId = params.id;

  const { data: item, isLoading } = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => apiFetch<ItemDto>(`/api/items/${itemId}`),
  });

  const { data: movements, isLoading: movementsLoading } = useQuery({
    queryKey: ["item-movements", itemId],
    queryFn: () => apiFetch<StockMovementDto[]>(`/api/items/${itemId}/movements?limit=200`),
  });

  if (isLoading || !item) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{item.name}</h1>
        <div className="flex gap-2">
          <ItemFormDialog item={item} trigger={<Button variant="outline">Edit item</Button>} />
          <AdjustStockDialog itemId={item.id} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border p-6 sm:grid-cols-3 lg:grid-cols-6">
        <InfoRow label="SKU" value={item.sku ?? "—"} />
        <InfoRow label="Unit" value={item.unit} />
        <InfoRow label="Sale price" value={item.salePrice != null ? <Money amount={item.salePrice} /> : "—"} />
        <InfoRow label="Reorder level" value={item.reorderLevel ?? "—"} />
        <InfoRow
          label="Stock on hand"
          value={<span data-testid="item-stock-on-hand">{item.stockOnHand}</span>}
        />
        <InfoRow label="Valuation" value={<Money amount={item.valuation} />} />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Movements</h2>
        <MovementTable movements={movements ?? []} isLoading={movementsLoading} />
      </div>
    </div>
  );
}
