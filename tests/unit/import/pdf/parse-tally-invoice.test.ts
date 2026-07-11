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
      hsnCode: "38245090",
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

  // ---- Synthetic flat-text cases (same concatenated format extractPdfText produces) ----

  // Header + buyer + meta scaffolding common to the synthetic invoices below.
  const header = (buyer: string, inv: string) =>
    `TAX INVOICE KARTIKEY TRADING COMPANY GST NO : 23AZRPG4337L1Z2 ` +
    `Buyer (Bill to) ${buyer} GSTIN/UIN : 23ABRPV7692P1ZC State Name : Madhya Pradesh, Code : 23 ` +
    `Contact : 8269222669, 7898447998 Invoice No. ${inv} Dated - Monday 01-Jan-26 ` +
    `Sl Description of Goods AmountDis 3Dis 2Dis 1perRateQuantityGSTHSN/SAC No. Rate `;

  it("parses a row with zero/absent discount and a row with a decimal quantity", () => {
    // Row 1: no discount, emitted as a bare "%" in the Dis1 column. taxable = 100*50 = 5000, tax 18% = 900.
    // Row 2: decimal quantity 12.5, no discount. taxable = 200*12.5 = 2500, tax 18% = 450.
    // Grand total = 5000 + 2500 + 900 + 450 = 8850.
    const text =
      header("Arjun Traders", "AL/300") +
      `1 CEMENT BAG 50KG 5,000.00 %No100.0050 No18 %25232910 ` +
      `2 RIVER SAND 2,500.00No200.0012.5 No18 %25051010 ` +
      `Total ī8,850.0062.5 No`;
    const r = parseTallyInvoice(text);
    expect(r.parsed?.invoice.lineItems).toHaveLength(2);
    expect(r.parsed?.invoice.lineItems?.[0]).toMatchObject({
      description: "CEMENT BAG 50KG",
      qty: 50,
      rate: 100,
      discountPct: 0,
      taxRatePct: 18,
    });
    expect(r.parsed?.invoice.lineItems?.[1]).toMatchObject({
      description: "RIVER SAND",
      qty: 12.5,
      rate: 200,
      discountPct: 0,
      taxRatePct: 18,
    });
    // Both rows present + totals reconcile -> full confidence, no reconciliation warning.
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
    expect(r.warnings).toHaveLength(0);
  });

  it("lowers confidence and warns when line items do not reconcile with the total (dropped row)", () => {
    // Only ONE line item is emitted (taxable 6356.25, tax 1144.13 -> ~7500), but the
    // grand total is that of a TWO-item invoice (18,501). The safety net must catch it.
    const text =
      header("Arjun Traders", "AL/301") +
      `1 TB/TRUFIX 110 GREY 20KG 6,356.2515.25 %No250.0030 No18 %38245090 ` +
      `Total ī18,501.0050 No`;
    const r = parseTallyInvoice(text);
    expect(r.parsed?.invoice.lineItems).toHaveLength(1);
    expect(r.confidence).toBeLessThan(0.8);
    expect(r.warnings.some((w) => /reconcile/i.test(w))).toBe(true);
  });

  it("lowers confidence when the item table is unrecognized (zero line items but valid header + total)", () => {
    // Header + grand total parse fine, but the item row is in a layout the row
    // regex can't match -> zero line items. Must NOT return high confidence.
    const text =
      header("Arjun Traders", "AL/303") +
      `1 MYSTERY WIDGET | 5000 | 50 | 18pct | unknownlayout ` +
      `Total ī5,900.0050 No`;
    const r = parseTallyInvoice(text);
    expect(r.parsed?.invoice.lineItems).toHaveLength(0);
    expect(r.confidence).toBeLessThan(0.8);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("stops the buyer name at the first suffix, not an address word further along", () => {
    // Real name is "Sunrise Metal Works"; the address "Near Industrial Area" follows.
    // Lazy capture must stop at "Works" and not run into the address.
    const text =
      header("Sunrise Metal Works Near Industrial Area Sector 5", "AL/302") +
      `1 STEEL ROD 1,000.00No100.0010 No18 %72142090 ` +
      `Total ī1,180.0010 No`;
    const r = parseTallyInvoice(text);
    expect(r.parsed?.invoice.clientName).toBe("Sunrise Metal Works");
  });
});
