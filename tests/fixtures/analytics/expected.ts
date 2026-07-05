import type {
  AgingReport, CashflowProjection, CollectionTrendPoint,
  HeadlineTiles, PartyAnalytics, StockAnalytics,
} from "@/types/analytics";

export const EXPECTED_HEADLINE: HeadlineTiles = {
  moneyToCome: 75000,
  moneyToPay: 23000,
  pendingInvoices: { count: 4, value: 75000 },
  overdueValue: 35000,
  collectedThisMonth: 15000,
};

export const EXPECTED_AGING_RECEIVABLE: AgingReport = {
  side: "RECEIVABLE",
  buckets: [
    { label: "CURRENT", amount: 40000, count: 1 },
    { label: "0_30", amount: 15000, count: 1 },
    { label: "31_60", amount: 8000, count: 1 },
    { label: "61_90", amount: 0, count: 0 },
    { label: "90_PLUS", amount: 12000, count: 1 },
  ],
  total: 75000,
  dso: 86.5, // 75000 / 78000 * 90
};

export const EXPECTED_AGING_PAYABLE: AgingReport = {
  side: "PAYABLE",
  buckets: [
    { label: "CURRENT", amount: 18000, count: 1 },
    { label: "0_30", amount: 5000, count: 1 },
    { label: "31_60", amount: 0, count: 0 },
    { label: "61_90", amount: 0, count: 0 },
    { label: "90_PLUS", amount: 0, count: 0 },
  ],
  total: 23000,
  dso: null,
};

export const EXPECTED_TREND: CollectionTrendPoint[] = [
  { month: "2026-02", invoiced: 0, collected: 0, rate: null },
  { month: "2026-03", invoiced: 5000, collected: 0, rate: 0 },
  { month: "2026-04", invoiced: 8000, collected: 5000, rate: 0.625 },
  { month: "2026-05", invoiced: 10000, collected: 0, rate: 0 },
  { month: "2026-06", invoiced: 60000, collected: 0, rate: 0 },
  { month: "2026-07", invoiced: 0, collected: 15000, rate: null },
];

export const EXPECTED_CASHFLOW: CashflowProjection = {
  overdue: { inflow: 35000, outflow: 5000 },
  weeks: [
    { weekStart: "2026-07-15", inflow: 0, outflow: 18000, net: -18000 },
    { weekStart: "2026-07-22", inflow: 40000, outflow: 0, net: 40000 },
    { weekStart: "2026-07-29", inflow: 0, outflow: 0, net: 0 },
    { weekStart: "2026-08-05", inflow: 0, outflow: 0, net: 0 },
    { weekStart: "2026-08-12", inflow: 0, outflow: 0, net: 0 },
    { weekStart: "2026-08-19", inflow: 0, outflow: 0, net: 0 },
    { weekStart: "2026-08-26", inflow: 0, outflow: 0, net: 0 },
    { weekStart: "2026-09-02", inflow: 0, outflow: 0, net: 0 },
  ],
};

export const EXPECTED_PARTIES: PartyAnalytics = {
  parties: [
    { partyId: "party-p2", partyName: "Bharat Mills", partyType: "CUSTOMER", receivableExposure: 52000, payableExposure: 0, creditLimit: 40000, avgDaysToPay: null, onTimePct: null, riskFlags: ["OVER_CREDIT_LIMIT"] },
    { partyId: "party-p1", partyName: "Acme Traders", partyType: "CUSTOMER", receivableExposure: 23000, payableExposure: 0, creditLimit: 50000, avgDaysToPay: 45, onTimePct: 0, riskFlags: ["HABITUAL_LATE"] },
    { partyId: "party-p3", partyName: "Chandra Supplies", partyType: "SUPPLIER", receivableExposure: 0, payableExposure: 23000, creditLimit: null, avgDaysToPay: null, onTimePct: null, riskFlags: [] },
  ],
  agents: [
    { agentId: "party-a1", agentName: "Agent Anil", collected: 20000, outstanding: 23000, managedParties: 1 },
    { agentId: "party-a2", agentName: "Agent Bina", collected: 0, outstanding: 52000, managedParties: 1 },
  ],
};

export const EXPECTED_STOCK: StockAnalytics = {
  totalValuation: 12060,
  items: [
    { itemId: "item-1", name: "Steel Rod 12mm", sku: "STL-12", unit: "KG", currentQty: 130, valuation: 8060, reorderLevel: 150, lowStock: true, deadStock: false },
    { itemId: "item-2", name: "Copper Wire", sku: "CU-01", unit: "MTR", currentQty: 200, valuation: 4000, reorderLevel: 50, lowStock: false, deadStock: true },
  ],
  lowStockItems: [
    { itemId: "item-1", name: "Steel Rod 12mm", sku: "STL-12", unit: "KG", currentQty: 130, valuation: 8060, reorderLevel: 150, lowStock: true, deadStock: false },
  ],
  deadStockItems: [
    { itemId: "item-2", name: "Copper Wire", sku: "CU-01", unit: "MTR", currentQty: 200, valuation: 4000, reorderLevel: 50, lowStock: false, deadStock: true },
  ],
  movementTrend: [
    { month: "2026-02", inQty: 0, outQty: 0 },
    { month: "2026-03", inQty: 0, outQty: 0 },
    { month: "2026-04", inQty: 0, outQty: 0 },
    { month: "2026-05", inQty: 0, outQty: 0 },
    { month: "2026-06", inQty: 0, outQty: 420 },
    { month: "2026-07", inQty: 50, outQty: 0 },
  ],
};
