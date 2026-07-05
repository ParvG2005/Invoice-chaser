export type AgingSide = "RECEIVABLE" | "PAYABLE";

export interface HeadlineTiles {
  moneyToCome: number; // outstanding receivables (sum of balanceDue)
  moneyToPay: number; // outstanding bills (sum of balanceDue)
  pendingInvoices: { count: number; value: number }; // unpaid receivable invoices
  overdueValue: number; // receivable balanceDue past due date
  collectedThisMonth: number; // payments IN, calendar month of asOf
}

export type AgingBucketLabel = "CURRENT" | "0_30" | "31_60" | "61_90" | "90_PLUS";

export interface AgingBucket {
  label: AgingBucketLabel;
  amount: number;
  count: number;
}

export interface AgingReport {
  side: AgingSide;
  buckets: AgingBucket[]; // always all 5 buckets, in the order above
  total: number;
  dso: number | null; // RECEIVABLE only; null for PAYABLE or zero trailing sales
}

export interface CollectionTrendPoint {
  month: string; // "2026-04"
  invoiced: number; // receivable invoice totalAmount issued that month
  collected: number; // payments IN received that month
  rate: number | null; // collected / invoiced, 4 dp; null when invoiced === 0
}

export interface CashflowWeek {
  weekStart: string; // ISO date "2026-07-15"; week covers [weekStart, weekStart + 7d)
  inflow: number; // receivable balanceDue falling due in the week
  outflow: number; // bill balanceDue falling due in the week
  net: number; // inflow - outflow
}

export interface CashflowProjection {
  overdue: { inflow: number; outflow: number }; // already past due at asOf
  weeks: CashflowWeek[]; // 8 weeks starting at asOf's day
}

export type PartyRiskFlag = "OVER_CREDIT_LIMIT" | "HABITUAL_LATE";

export interface PartyAnalyticsRow {
  partyId: string;
  partyName: string;
  partyType: string; // CUSTOMER | SUPPLIER | BOTH (AGENT rows live in `agents`)
  receivableExposure: number;
  payableExposure: number;
  creditLimit: number | null;
  avgDaysToPay: number | null; // mean(paidAt - issueDate) over fully paid invoices, 1 dp
  onTimePct: number | null; // % of paid invoices with paidAt <= dueDate, 1 dp
  riskFlags: PartyRiskFlag[];
}

export interface AgentLeaderboardRow {
  agentId: string;
  agentName: string;
  collected: number; // all-time payments IN from parties managed by this agent
  outstanding: number; // receivable exposure of managed parties
  managedParties: number;
}

export interface PartyAnalytics {
  parties: PartyAnalyticsRow[]; // sorted by receivableExposure desc
  agents: AgentLeaderboardRow[]; // sorted by collected desc
}

export interface StockItemStat {
  itemId: string;
  name: string;
  sku: string | null;
  unit: string;
  currentQty: number;
  valuation: number; // currentQty x latest inbound rate (fallback purchasePrice, then 0)
  reorderLevel: number | null;
  lowStock: boolean;
  deadStock: boolean;
}

export interface StockMovementTrendPoint {
  month: string; // "2026-06"
  inQty: number;
  outQty: number; // reported positive
}

export interface StockAnalytics {
  totalValuation: number;
  items: StockItemStat[]; // sorted by valuation desc
  lowStockItems: StockItemStat[];
  deadStockItems: StockItemStat[];
  movementTrend: StockMovementTrendPoint[]; // last 6 calendar months incl. current
}
