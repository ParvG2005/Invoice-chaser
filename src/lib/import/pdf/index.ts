import type { CreateInvoiceInput } from "@/lib/validations/invoice";
import { extractPdfText } from "./extract-text";
import { parseTallyInvoice } from "./parse-tally-invoice";
import { llmExtractInvoice } from "./llm-extract";
import type { ParsedInvoice } from "./types";

export const CONFIDENCE_THRESHOLD = 0.8;
export const DEFAULT_NET_DAYS = 30;

export interface PartyMatch {
  email?: string;
}

export interface ExtractOptions {
  defaultNetDays?: number;
  lookupParty?: (name: string, gstin?: string) => Promise<PartyMatch | null>;
  deps?: { llm?: typeof llmExtractInvoice };
}

export interface ExtractedInvoice {
  fileName: string;
  method: "deterministic" | "llm" | "failed";
  invoice?: CreateInvoiceInput;
  /**
   * Raw ISO yyyy-mm-dd invoice date, carried alongside `invoice.dueDate` so
   * the wizard (Task 6) can recompute the due date client-side when the user
   * overrides the net-N days without needing to re-parse the PDF.
   */
  invoiceDate?: string;
  /**
   * Buyer GSTIN + billing address, surfaced as siblings of `invoice` so the
   * commit path can upsert/enrich the buyer Party. `clientPhone` already lives
   * inside `invoice` (CreateInvoiceInput). All optional — a PDF that omits them
   * still imports.
   */
  buyerGstin?: string;
  buyerAddress?: string;
  needsEmail: boolean;
  warnings: string[];
}

/** Add whole days to an ISO yyyy-mm-dd date, returning ISO yyyy-mm-dd (UTC, no tz drift). */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function extractInvoicesFromPdf(
  fileName: string,
  bytes: Uint8Array,
  opts: ExtractOptions = {},
): Promise<ExtractedInvoice> {
  const netDays = opts.defaultNetDays ?? DEFAULT_NET_DAYS;
  const llm = opts.deps?.llm ?? llmExtractInvoice;
  const warnings: string[] = [];

  let parsed: ParsedInvoice | undefined;
  let method: ExtractedInvoice["method"] = "llm";

  // LLM first: it handles scanned scans and irregular layouts the flat-text
  // regexes can't. A thrown API error or a null result (no tool call / schema
  // mismatch) falls through to the deterministic parser below rather than
  // aborting the file.
  try {
    const llmResult = await llm(bytes);
    if (llmResult) parsed = llmResult;
    else warnings.push("LLM extraction returned no usable result");
  } catch (e) {
    warnings.push(`LLM extraction failed: ${(e as Error).message}`);
  }

  // Deterministic fallback (flat-text regexes + line-item↔total reconciliation).
  // Only accepted at high confidence; a low-confidence parse is treated as no
  // parse so the file surfaces as "failed" rather than importing garbage.
  if (!parsed) {
    try {
      const text = await extractPdfText(bytes);
      const det = parseTallyInvoice(text);
      warnings.push(...det.warnings);
      if (det.parsed && det.confidence >= CONFIDENCE_THRESHOLD) {
        parsed = det.parsed;
        method = "deterministic";
      }
    } catch (e) {
      warnings.push(`Text extraction failed: ${(e as Error).message}`);
    }
  }

  if (!parsed) {
    return { fileName, method: "failed", needsEmail: true, warnings };
  }

  const match = opts.lookupParty ? await opts.lookupParty(parsed.invoice.clientName, parsed.buyerGstin) : null;
  const email = match?.email ?? "";
  const dueDate = addDaysIso(parsed.invoiceDate, netDays);

  const invoice: CreateInvoiceInput = {
    ...parsed.invoice,
    clientEmail: email,
    dueDate,
  } as CreateInvoiceInput;

  return {
    fileName,
    method,
    invoice,
    invoiceDate: parsed.invoiceDate,
    buyerGstin: parsed.buyerGstin,
    buyerAddress: parsed.buyerAddress,
    needsEmail: email === "",
    warnings,
  };
}
