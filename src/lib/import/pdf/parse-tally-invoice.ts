import type { PdfParseResult, ParsedInvoice } from "./types";

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** "17-Jun-26" -> "2026-06-17" (Tally uses 2-digit year; assume 2000s). */
function toIsoDate(dmy: string): string | undefined {
  const m = dmy.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2})/);
  if (!m) return undefined;
  const [, dd, mon, yy] = m;
  const mm = MONTHS[mon[0].toUpperCase() + mon.slice(1, 3).toLowerCase()];
  if (!mm) return undefined;
  return `20${yy}-${mm}-${dd.padStart(2, "0")}`;
}

const num = (s: string) => Number(s.replace(/,/g, ""));

/** Reconciliation tolerance in rupees: covers Tally's per-invoice ROUND OFF plus float error. */
const RECONCILE_TOLERANCE = 5;

/**
 * unpdf's `extractText(..., { mergePages: true })` (used by `extractPdfText`)
 * joins every line *within* a page with a single space — for these
 * single-page Tally invoices the whole text arrives as one long line with no
 * newlines at all. So, unlike a typical text-layout parser, we can't anchor
 * on "the next line" — every field below is pulled out of the flat string
 * with a regex anchored on the label/format that precedes or follows it.
 */

/**
 * One line-item row as it appears in the flattened text, e.g.:
 *   "1 TB/TRUFIX 110 GREY 20KG 10,593.7515.25 %No250.0050 No18 %38245090"
 * i.e. <sl> <description> <amount>[<discountPct> %]No<rate><qty> No<taxRatePct> %<hsn>
 * Columns: Amount, Dis1, "No" (per), Rate, Quantity, "No" (unit), GST%, HSN/SAC —
 * concatenated with no separator between adjacent numeric fields.
 *
 * The discount (Dis1) column is OPTIONAL: rows with no discount emit either
 * nothing, a bare "%", or a "-" there. Quantity may be a DECIMAL (e.g. 12.5 KG).
 *
 * The row's serial number is anchored with a lookbehind on either "Rate " (the
 * column-header text that immediately precedes the FIRST row) or a preceding
 * 6-8 digit HSN/SAC code (the tail of the PREVIOUS row). Without this anchor a
 * digit earlier in the flat text (e.g. the tail of a buyer phone number) can
 * masquerade as the serial and balloon the captured description.
 */
const LINE_ITEM_RE =
  /(?<=Rate\s|\d{6,8}\s)\d+\s+([A-Za-z0-9+./\-][A-Za-z0-9+./\- ]*?)\s+([\d,]+\.\d{2})\s*(?:(\d+(?:\.\d+)?)\s*%|-|%)?\s*No\s*([\d,]+\.\d{2})\s*(\d+(?:\.\d+)?)\s*No\s*(\d+(?:\.\d+)?)\s*%\s*(\d{6,8})/g;

/**
 * Business-entity suffix words used to guess where the buyer's name ends and
 * its address begins (no line breaks to anchor on — see note above). The
 * capture is LAZY (`.+?`) so it stops at the FIRST suffix occurrence, which
 * minimizes (but cannot fully eliminate) over-capture when an address word
 * downstream also happens to be a suffix.
 */
const BUYER_NAME_RE =
  /Buyer\s*\(Bill to\)\s*(.+?\b(?:Traders?|Trading|Company|Enterprises?|Industries|Corporation|Distributors?|Suppliers?|Agencies|Stores?|Associates|Brothers|Sons|Works|Pvt\.?\s*Ltd\.?|LLP)\b)/i;

export function parseTallyInvoice(text: string): PdfParseResult {
  const warnings: string[] = [];
  const flat = text.replace(/\s+/g, " ").trim();

  let hits = 0;
  const anchors = [/TAX INVOICE/i, /Invoice No/i, /Buyer \(Bill to\)/i, /HSN\/SAC/i, /Total/i];
  for (const a of anchors) if (a.test(flat)) hits += 1;
  let confidence = hits / anchors.length;
  if (confidence < 0.6) return { confidence, warnings: ["Not a recognized Tally tax invoice"] };

  // Invoice number: the token right after "Invoice No." (e.g. "AL/104").
  const invMatch = flat.match(/Invoice No\.?\s*(\S+)/);
  const invoiceNumber = invMatch?.[1];

  // Date: "Dated - <Weekday> <dd-Mon-yy>" — NOT the "Printed on <date>" near the top.
  const dateMatch = flat.match(/Dated\s*-\s*\S+\s+(\d{1,2}-[A-Za-z]{3}-\d{2})/);
  const invoiceDate = dateMatch ? toIsoDate(dateMatch[1]) : undefined;

  // Buyer name: from "Buyer (Bill to)" up through the FIRST business-entity suffix word.
  const buyerMatch = flat.match(BUYER_NAME_RE);
  const clientName = buyerMatch?.[1]?.trim();

  const gstMatch = flat.match(/GSTIN\/UIN\s*:?\s*([0-9A-Z]{15})/);
  const buyerGstin = gstMatch?.[1];

  // Buyer phone: the "Contact :" that follows the buyer block (first one is the seller's).
  const buyerIdx = flat.search(/Buyer\s*\(Bill to\)/i);
  const buyerPhoneMatch = buyerIdx >= 0 ? flat.slice(buyerIdx).match(/Contact\s*:?\s*([\d,\s]+?)(?=\s*(?:Invoice No|State Name|$))/) : null;
  const buyerPhone = buyerPhoneMatch?.[1]?.split(",")[0]?.trim();

  // Grand total: "Total ī12,501.0050 No" — the trailing "No" (unit) distinguishes it
  // from the later tax-breakdown "Total: ..." line, which has no "No" suffix.
  const totalMatch = flat.match(/Total\s*\D*?([\d,]+\.\d{2})[\d.]*\s*No\b/);
  const amount = totalMatch ? num(totalMatch[1]) : undefined;

  const lineItems: NonNullable<ParsedInvoice["invoice"]["lineItems"]> = [];
  for (const m of flat.matchAll(LINE_ITEM_RE)) {
    lineItems.push({
      description: m[1].trim(),
      discountPct: m[3] ? num(m[3]) : 0,
      rate: num(m[4]),
      qty: num(m[5]),
      taxRatePct: num(m[6]),
    });
  }

  if (!invoiceNumber) warnings.push("Missing invoice number");
  if (!clientName) warnings.push("Missing buyer name");
  if (!invoiceDate) warnings.push("Missing/invalid invoice date");
  if (amount === undefined) warnings.push("Missing total amount");
  if (lineItems.length === 0) warnings.push("No line items parsed");

  if (!invoiceNumber || !clientName || !invoiceDate || amount === undefined) {
    return { confidence: Math.min(confidence, 0.5), warnings };
  }

  // Reconciliation safety net: derive the invoice total from the parsed line
  // items (taxable = qty x rate x (1 - discount%); total = taxable + tax) and
  // compare it to the parsed grand total. If they diverge beyond rounding
  // tolerance — the tell-tale of a dropped/garbled/mis-parsed row — drop
  // confidence below the LLM-fallback threshold rather than emit wrong data.
  const derivedTotal = lineItems.reduce((acc, li) => {
    const taxable = li.qty * li.rate * (1 - (li.discountPct ?? 0) / 100);
    return acc + taxable * (1 + (li.taxRatePct ?? 0) / 100);
  }, 0);
  if (lineItems.length > 0 && Math.abs(derivedTotal - amount) > RECONCILE_TOLERANCE) {
    warnings.push(
      `Line items (₹${derivedTotal.toFixed(2)}) do not reconcile with invoice total (₹${amount.toFixed(2)}) — likely a dropped or misparsed row`,
    );
    confidence = Math.min(confidence, 0.5);
  }

  return {
    confidence,
    warnings,
    parsed: {
      invoice: { clientName, clientPhone: buyerPhone, invoiceNumber, amount, lineItems },
      invoiceDate,
      buyerGstin,
      buyerPhone,
    },
  };
}
