import type { CreateInvoiceInput } from "@/lib/validations/invoice";

/** Invoice fields recoverable from the PDF. Email + dueDate are resolved later (party match / net-N). */
export interface ParsedInvoice {
  invoice: Omit<CreateInvoiceInput, "clientEmail" | "dueDate">;
  /** ISO yyyy-mm-dd, from the "Dated" field. */
  invoiceDate: string;
  buyerGstin?: string;
  buyerPhone?: string;
}

export interface PdfParseResult {
  parsed?: ParsedInvoice;
  /** Fraction of required anchors found (0..1). Orchestrator falls back to LLM below threshold. */
  confidence: number;
  warnings: string[];
}
