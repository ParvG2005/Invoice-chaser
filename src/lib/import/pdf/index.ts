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
  let method: ExtractedInvoice["method"] = "deterministic";

  // Deterministic first (best-effort; text extraction may fail on scanned PDFs).
  try {
    const text = await extractPdfText(bytes);
    const det = parseTallyInvoice(text);
    warnings.push(...det.warnings);
    if (det.parsed && det.confidence >= CONFIDENCE_THRESHOLD) parsed = det.parsed;
  } catch (e) {
    warnings.push(`Text extraction failed: ${(e as Error).message}`);
  }

  // LLM fallback.
  if (!parsed) {
    const llmResult = await llm(bytes);
    if (llmResult) {
      parsed = llmResult;
      method = "llm";
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
    needsEmail: email === "",
    warnings,
  };
}
