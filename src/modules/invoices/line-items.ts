/**
 * Pure invoice line-item math, shared between the client-side line-items
 * editor (Task 14) and the server (see
 * `src/server/services/invoice.service.ts`'s `computeLineItemsForInvoice`,
 * which is the only place this module's `lineAmount`/`totals` get called
 * server-side, keeping the two totals calculations from drifting apart).
 */
export interface LineItemInput {
  itemId?: string;
  description: string;
  qty: number;
  rate: number;
  discountPct: number;
  taxRatePct: number;
}

/** Rounds to 2dp using standard half-up rounding, matching `Decimal(12,2)` columns. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * `qty * rate * (1 - discountPct/100) * (1 + taxRatePct/100)`, rounded to 2dp.
 */
export function lineAmount(li: LineItemInput): number {
  const gross = li.qty * li.rate * (1 - li.discountPct / 100) * (1 + li.taxRatePct / 100);
  return round2(gross);
}

export interface LineItemTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/**
 * Sums pre-tax amount, tax amount, and grand total across all rows. Each
 * row's tax portion is derived as `lineAmount(li) - preTaxAmount(li)` so
 * `subtotal + taxAmount === total` holds exactly per row (not just in
 * aggregate), and the aggregate `total` always equals the sum of
 * `lineAmount(li)` across all rows.
 */
export function totals(items: LineItemInput[]): LineItemTotals {
  let subtotal = 0;
  let taxAmount = 0;
  let total = 0;

  for (const li of items) {
    const preTax = round2(li.qty * li.rate * (1 - li.discountPct / 100));
    const lineTotal = lineAmount(li);
    const taxPortion = round2(lineTotal - preTax);

    subtotal += preTax;
    taxAmount += taxPortion;
    total += lineTotal;
  }

  return { subtotal: round2(subtotal), taxAmount: round2(taxAmount), total: round2(total) };
}
