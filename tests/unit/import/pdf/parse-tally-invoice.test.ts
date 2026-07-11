import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { extractPdfText } from "@/lib/import/pdf/extract-text";
import { parseTallyInvoice } from "@/lib/import/pdf/parse-tally-invoice";

async function parseFixture(name: string) {
  const text = await extractPdfText(new Uint8Array(readFileSync(`tests/fixtures/tally/pdf/${name}.pdf`)));
  return parseTallyInvoice(text);
}

describe("parseTallyInvoice", () => {
  it("parses a single-line-item invoice (AL/104)", async () => {
    const r = await parseFixture("AL-104");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
    expect(r.parsed?.invoice.invoiceNumber).toBe("AL/104");
    expect(r.parsed?.invoice.clientName).toBe("Arjun Traders");
    expect(r.parsed?.invoiceDate).toBe("2026-06-17");
    expect(r.parsed?.invoice.amount).toBe(12501);
    expect(r.parsed?.invoice.lineItems).toHaveLength(1);
    expect(r.parsed?.invoice.lineItems?.[0]).toMatchObject({
      description: "TB/TRUFIX 110 GREY 20KG",
      qty: 50,
      rate: 250,
      discountPct: 15.25,
      taxRatePct: 18,
    });
    expect(r.parsed?.buyerGstin).toBe("23ABRPV7692P1ZC");
  });

  it("parses a two-line-item invoice (AL/97)", async () => {
    const r = await parseFixture("AL-97");
    expect(r.parsed?.invoice.invoiceNumber).toBe("AL/97");
    expect(r.parsed?.invoice.amount).toBe(18501);
    expect(r.parsed?.invoice.lineItems).toHaveLength(2);
    expect(r.parsed?.invoice.lineItems?.[1]).toMatchObject({ qty: 20, rate: 550, taxRatePct: 18 });
  });

  it("reports low confidence on non-Tally text", () => {
    const r = parseTallyInvoice("this is not an invoice");
    expect(r.confidence).toBeLessThan(0.5);
    expect(r.parsed).toBeUndefined();
  });
});
