import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { extractInvoicesFromPdf } from "@/lib/import/pdf";

const bytes = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/tally/pdf/${n}.pdf`));

// LLM is primary; every test injects a stub `llm` so nothing hits the real API.
// A stub returning null / throwing exercises the deterministic fallback against
// the real fixture PDFs.
describe("extractInvoicesFromPdf", () => {
  it("prefers the LLM result when it succeeds", async () => {
    const llm = vi.fn().mockResolvedValue({
      invoice: { clientName: "X", invoiceNumber: "N1", amount: 100, lineItems: [] },
      invoiceDate: "2026-01-01",
    });
    const r = await extractInvoicesFromPdf("AL-104.pdf", bytes("AL-104"), {
      lookupParty: async () => null,
      deps: { llm },
    });
    expect(llm).toHaveBeenCalled();
    expect(r.method).toBe("llm");
    expect(r.invoice?.invoiceNumber).toBe("N1");
  });

  it("surfaces buyerGstin and buyerAddress as siblings of invoice from the LLM result", async () => {
    const llm = vi.fn().mockResolvedValue({
      invoice: { clientName: "X", invoiceNumber: "N1", amount: 100, lineItems: [] },
      invoiceDate: "2026-01-01",
      buyerGstin: "23ABRPV7692P1ZC",
      buyerAddress: "12 MG Road, Indore",
    });
    const r = await extractInvoicesFromPdf("AL-104.pdf", bytes("AL-104"), {
      lookupParty: async () => null,
      deps: { llm },
    });
    expect(r.buyerGstin).toBe("23ABRPV7692P1ZC");
    expect(r.buyerAddress).toBe("12 MG Road, Indore");
  });

  it("falls back to the deterministic parser when the LLM returns null", async () => {
    const llm = vi.fn().mockResolvedValue(null);
    const r = await extractInvoicesFromPdf("AL-104.pdf", bytes("AL-104"), {
      lookupParty: async () => ({ email: "arjun@example.com" }),
      deps: { llm },
    });
    expect(r.method).toBe("deterministic");
    expect(r.invoice?.clientEmail).toBe("arjun@example.com");
    expect(r.invoice?.dueDate).toBe("2026-07-17"); // 2026-06-17 + 30d
    expect(r.needsEmail).toBe(false);
  });

  it("falls back to the deterministic parser when the LLM throws", async () => {
    const llm = vi.fn().mockRejectedValue(new Error("rate limited"));
    const r = await extractInvoicesFromPdf("AL-104.pdf", bytes("AL-104"), {
      lookupParty: async () => ({ email: "arjun@example.com" }),
      deps: { llm },
    });
    expect(r.method).toBe("deterministic");
    expect(r.invoice?.invoiceNumber).toBeTruthy();
    expect(r.warnings.some((w) => /LLM extraction failed: rate limited/.test(w))).toBe(true);
  });

  it("flags needsEmail when no party matches (deterministic fallback)", async () => {
    const llm = vi.fn().mockResolvedValue(null);
    const r = await extractInvoicesFromPdf("AL-104.pdf", bytes("AL-104"), {
      lookupParty: async () => null,
      deps: { llm },
    });
    expect(r.needsEmail).toBe(true);
    expect(r.invoice?.clientEmail).toBe("");
  });

  it("returns failed when both the LLM and deterministic parsing fail", async () => {
    const llm = vi.fn().mockResolvedValue(null);
    const r = await extractInvoicesFromPdf("junk.pdf", new Uint8Array([1, 2, 3]), {
      lookupParty: async () => null,
      deps: { llm },
    });
    expect(r.method).toBe("failed");
    expect(r.needsEmail).toBe(true);
    expect(r.invoice).toBeUndefined();
  });
});
