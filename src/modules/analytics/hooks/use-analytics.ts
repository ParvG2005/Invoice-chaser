"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  AgingReport, AgingSide, CashflowProjection, CollectionTrendPoint,
  HeadlineTiles, PartyAnalytics, StockAnalytics,
} from "@/types/analytics";

async function fetchAnalytics<T>(path: string): Promise<T> {
  const res = await fetch(`/api/analytics/${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? "Failed to load analytics");
  return json.data as T;
}

const useAnalytics = <T,>(path: string) =>
  useQuery<T>({ queryKey: ["analytics", path], queryFn: () => fetchAnalytics<T>(path), staleTime: 60_000 });

export const useHeadlineTiles = () => useAnalytics<HeadlineTiles>("headline");
export const useAgingReport = (side: AgingSide) => useAnalytics<AgingReport>(`aging?side=${side}`);
export const useCollectionTrend = () => useAnalytics<CollectionTrendPoint[]>("trend");
export const useCashflowProjection = () => useAnalytics<CashflowProjection>("cashflow");
export const usePartyAnalytics = () => useAnalytics<PartyAnalytics>("parties");
export const useStockAnalytics = () => useAnalytics<StockAnalytics>("stock");
