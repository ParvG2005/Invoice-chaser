import type { CreateInvoiceInput } from "@/lib/validations/invoice";

/**
 * TallyPrime XML Invoice Parser
 *
 * Handles the standard TallyPrime Data Export format for Sales Vouchers.
 * TallyPrime exports in two modes:
 *   1. Full export: ENVELOPE > BODY > EXPORTDATA > REQUESTDATA > VOUCHER
 *   2. Simple export: ENVELOPE > BODY > IMPORTDATA > REQUESTDATA > VOUCHER
 *
 * Fields mapped:
 *   PARTYNAME           → clientName
 *   DATE (YYYYMMDD)     → dueDate
 *   BILLDATE (if exists)→ dueDate (preferred)
 *   VOUCHERNUMBER       → invoiceNumber
 *   AMOUNT / net ledger → amount
 *   NARRATION           → notes
 *   EMAIL (if present)  → clientEmail
 */

export interface TallyInvoice extends Omit<CreateInvoiceInput, "clientEmail"> {
  clientEmail?: string;
}

export interface TallyParseResult {
  invoices: TallyInvoice[];
  warnings: string[];
  /** How many invoices are missing a client email (Tally rarely exports this) */
  missingEmailCount: number;
}

function getText(el: Element | null, tag: string): string {
  if (!el) return "";
  const child = el.querySelector(tag);
  return child?.textContent?.trim() ?? "";
}

function getAll(el: Element | null, tag: string): Element[] {
  if (!el) return [];
  return Array.from(el.querySelectorAll(tag));
}

/** Convert TallyPrime date format YYYYMMDD → ISO string YYYY-MM-DD */
function parseTallyDate(raw: string): string | null {
  const clean = raw.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  const year = clean.slice(0, 4);
  const month = clean.slice(4, 6);
  const day = clean.slice(6, 8);
  return `${year}-${month}-${day}`;
}

/** Extract net amount from a Tally voucher (debit side = positive amount owed) */
function extractAmount(voucher: Element): number {
  // Try AMOUNT tag directly (simple exports)
  const amountStr = getText(voucher, "AMOUNT");
  if (amountStr) {
    const parsed = Math.abs(parseFloat(amountStr));
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // Try ledger entries — look for the debit/revenue side
  const ledgerEntries = getAll(voucher, "ALLLEDGERENTRIES\\.LIST, LEDGERENTRIES\\.LIST");
  let maxAmount = 0;
  for (const entry of ledgerEntries) {
    const amt = parseFloat(getText(entry, "AMOUNT") || "0");
    if (Math.abs(amt) > maxAmount) maxAmount = Math.abs(amt);
  }
  return maxAmount;
}

export function parseTallyXml(xmlContent: string, defaultEmail?: string): TallyParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid XML: " + parseError.textContent?.slice(0, 200));
  }

  // Find all VOUCHER elements
  const vouchers = Array.from(doc.querySelectorAll("VOUCHER"));

  const invoices: TallyInvoice[] = [];
  const warnings: string[] = [];
  let missingEmailCount = 0;

  for (const voucher of vouchers) {
    // Skip non-Sales vouchers if type is specified
    const vchType =
      voucher.getAttribute("VCHTYPE") ??
      getText(voucher, "VOUCHERTYPENAME") ??
      "";
    if (
      vchType &&
      !["sales", "invoice", "tax invoice", ""].includes(vchType.toLowerCase())
    ) {
      continue;
    }

    const partyName = getText(voucher, "PARTYNAME") || getText(voucher, "PARTYLEDGERNAME");
    if (!partyName) {
      warnings.push(`Skipped a voucher with no PARTYNAME`);
      continue;
    }

    // Date: prefer BILLDATE (due date in Tally), fall back to DATE (voucher date)
    const billDateRaw = getText(voucher, "BILLDATE") || getText(voucher, "DATE");
    const dueDate = parseTallyDate(billDateRaw);
    if (!dueDate) {
      warnings.push(`Skipped "${partyName}" — could not parse date: ${billDateRaw}`);
      continue;
    }

    const voucherNumber =
      getText(voucher, "VOUCHERNUMBER") ||
      getText(voucher, "ALTERID") ||
      `TALLY-${Date.now()}`;

    const amount = extractAmount(voucher);
    if (!amount || amount <= 0) {
      warnings.push(`Skipped "${partyName}" (${voucherNumber}) — could not determine amount`);
      continue;
    }

    const notes = getText(voucher, "NARRATION") || undefined;

    // Check for email (Tally sometimes stores it in LEDGERMAILINGNAME or custom field)
    const email =
      getText(voucher, "EMAIL") ||
      getText(voucher, "EMAILID") ||
      defaultEmail;

    if (!email) missingEmailCount++;

    // Check for phone (Tally sometimes stores it in LEDGERMAILINGNAME phone list, or PHONE / MOBILE tags)
    const phone =
      getText(voucher, "PHONE") ||
      getText(voucher, "TELEPHONENO") ||
      getText(voucher, "MOBILE") ||
      getText(voucher, "PHONENUMBER") ||
      getText(voucher, "LEDGERPHONE");

    invoices.push({
      clientName: partyName,
      invoiceNumber: voucherNumber,
      amount,
      dueDate,
      clientPhone: phone || undefined,
      clientEmail: email || undefined,
      notes,
    });
  }

  return { invoices, warnings, missingEmailCount };
}
