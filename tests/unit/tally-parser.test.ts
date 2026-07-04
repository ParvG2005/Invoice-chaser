// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseTallyXml } from "@/lib/import/tally-parser";

function envelope(vouchers: string): string {
  return `<?xml version="1.0"?><ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>${vouchers}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

const SALES_VOUCHER = `
<VOUCHER VCHTYPE="Sales">
  <PARTYNAME>Sharma Textiles</PARTYNAME>
  <DATE>20260615</DATE>
  <VOUCHERNUMBER>SV-101</VOUCHERNUMBER>
  <NARRATION>June order</NARRATION>
  <ALLLEDGERENTRIES.LIST><AMOUNT>-18500.00</AMOUNT></ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST><AMOUNT>18500.00</AMOUNT></ALLLEDGERENTRIES.LIST>
</VOUCHER>`;

describe("parseTallyXml (characterization)", () => {
  it("parses a sales voucher: party, number, date, ledger-derived amount, narration", () => {
    const result = parseTallyXml(envelope(SALES_VOUCHER));
    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0]).toMatchObject({
      clientName: "Sharma Textiles",
      invoiceNumber: "SV-101",
      amount: 18500,
      dueDate: "2026-06-15",
      notes: "June order",
    });
    expect(result.warnings).toHaveLength(0);
  });

  it("counts missing emails and applies defaultEmail when given", () => {
    expect(parseTallyXml(envelope(SALES_VOUCHER)).missingEmailCount).toBe(1);
    const withDefault = parseTallyXml(envelope(SALES_VOUCHER), "fallback@org.test");
    expect(withDefault.missingEmailCount).toBe(0);
    expect(withDefault.invoices[0].clientEmail).toBe("fallback@org.test");
  });

  it("skips non-sales voucher types silently", () => {
    const payment = `<VOUCHER VCHTYPE="Payment"><PARTYNAME>X</PARTYNAME><DATE>20260601</DATE><AMOUNT>100</AMOUNT></VOUCHER>`;
    const result = parseTallyXml(envelope(payment));
    expect(result.invoices).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns and skips a voucher without a party name", () => {
    const noParty = `<VOUCHER VCHTYPE="Sales"><DATE>20260601</DATE><AMOUNT>100</AMOUNT></VOUCHER>`;
    const result = parseTallyXml(envelope(noParty));
    expect(result.invoices).toHaveLength(0);
    expect(result.warnings[0]).toContain("no PARTYNAME");
  });

  it("warns and skips when the date is unparseable", () => {
    const badDate = `<VOUCHER VCHTYPE="Sales"><PARTYNAME>Y</PARTYNAME><DATE>June-2026</DATE><AMOUNT>100</AMOUNT></VOUCHER>`;
    const result = parseTallyXml(envelope(badDate));
    expect(result.invoices).toHaveLength(0);
    expect(result.warnings[0]).toContain("could not parse date");
  });

  it("warns and skips when no positive amount can be extracted", () => {
    const noAmount = `<VOUCHER VCHTYPE="Sales"><PARTYNAME>Z</PARTYNAME><DATE>20260601</DATE><VOUCHERNUMBER>V1</VOUCHERNUMBER></VOUCHER>`;
    const result = parseTallyXml(envelope(noAmount));
    expect(result.invoices).toHaveLength(0);
    expect(result.warnings[0]).toContain("could not determine amount");
  });

  it("throws on invalid XML", () => {
    expect(() => parseTallyXml("<not-closed")).toThrow(/Invalid XML/);
  });
});
