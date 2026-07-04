import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyVoucherKind, parseVouchers } from "@/lib/import/tally/parse-vouchers";

const FIXTURES = join(__dirname, "../../../fixtures/tally");

describe("classifyVoucherKind", () => {
  it("routes the six standard VCHTYPEs case-insensitively", () => {
    expect(classifyVoucherKind("Sales")).toBe("SALES");
    expect(classifyVoucherKind("Tax Invoice")).toBe("SALES");
    expect(classifyVoucherKind("purchase")).toBe("PURCHASE");
    expect(classifyVoucherKind("Receipt")).toBe("RECEIPT");
    expect(classifyVoucherKind("Payment")).toBe("PAYMENT");
    expect(classifyVoucherKind("Credit Note")).toBe("CREDIT_NOTE");
    expect(classifyVoucherKind("Debit Note")).toBe("DEBIT_NOTE");
    expect(classifyVoucherKind("Journal")).toBe("UNSUPPORTED");
    expect(classifyVoucherKind("")).toBe("UNSUPPORTED");
  });
});

const SALES_VOUCHER = `<?xml version="1.0"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Sales" ACTION="Create">
   <GUID>guid-vch-0001</GUID>
   <ALTERID>101</ALTERID>
   <DATE>20260401</DATE>
   <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
   <VOUCHERNUMBER>INV-042</VOUCHERNUMBER>
   <PARTYLEDGERNAME>Acme Traders</PARTYLEDGERNAME>
   <NARRATION>April supply</NARRATION>
   <ALLINVENTORYENTRIES.LIST>
    <STOCKITEMNAME>Widget A</STOCKITEMNAME>
    <RATE>1,200.00/nos</RATE>
    <ACTUALQTY> 5 nos</ACTUALQTY>
    <AMOUNT>6000.00</AMOUNT>
   </ALLINVENTORYENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Acme Traders</LEDGERNAME>
    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
    <AMOUNT>-7080.00</AMOUNT>
    <BILLALLOCATIONS.LIST>
     <NAME>INV-042</NAME>
     <BILLTYPE>New Ref</BILLTYPE>
     <AMOUNT>-7080.00</AMOUNT>
    </BILLALLOCATIONS.LIST>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Sales Account</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>6000.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Output IGST</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>1080.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Receipt" ACTION="Create">
   <GUID>guid-vch-0002</GUID>
   <ALTERID>102</ALTERID>
   <DATE>20260410</DATE>
   <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
   <VOUCHERNUMBER>RCP-007</VOUCHERNUMBER>
   <PARTYLEDGERNAME>Acme Traders</PARTYLEDGERNAME>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Acme Traders</LEDGERNAME>
    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
    <AMOUNT>7080.00</AMOUNT>
    <BILLALLOCATIONS.LIST>
     <NAME>INV-042</NAME>
     <BILLTYPE>Agst Ref</BILLTYPE>
     <AMOUNT>7080.00</AMOUNT>
    </BILLALLOCATIONS.LIST>
   </ALLLEDGERENTRIES.LIST>
   <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>HDFC Bank</LEDGERNAME>
    <ISPARTYLEDGER>No</ISPARTYLEDGER>
    <AMOUNT>-7080.00</AMOUNT>
   </ALLLEDGERENTRIES.LIST>
  </VOUCHER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <VOUCHER VCHTYPE="Sales"><VOUCHERNUMBER>NO-GUID</VOUCHERNUMBER><DATE>20260401</DATE></VOUCHER>
 </TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

describe("parseVouchers (synthetic)", () => {
  it("parses a Sales voucher with inventory, ledger entries, and bill allocations", () => {
    const { records, warnings } = parseVouchers(SALES_VOUCHER);
    expect(records).toHaveLength(2);
    expect(warnings).toHaveLength(1); // the GUID-less voucher

    const sales = records[0];
    expect(sales).toMatchObject({
      guid: "guid-vch-0001",
      alterId: 101,
      voucherNumber: "INV-042",
      kind: "SALES",
      date: "2026-04-01",
      partyLedgerName: "Acme Traders",
      narration: "April supply",
    });
    expect(sales.inventoryEntries).toEqual([
      { stockItemName: "Widget A", quantity: 5, rate: 1200, amount: 6000, unit: "nos" },
    ]);
    expect(sales.ledgerEntries).toHaveLength(3);
    const party = sales.ledgerEntries.find((e) => e.isPartyLedger);
    expect(party?.amount).toBe(-7080);
    expect(party?.billAllocations).toEqual([
      { name: "INV-042", billType: "New Ref", amount: -7080 },
    ]);
  });

  it("parses a Receipt voucher with Agst Ref allocations", () => {
    const receipt = parseVouchers(SALES_VOUCHER).records[1];
    expect(receipt.kind).toBe("RECEIPT");
    const party = receipt.ledgerEntries.find((e) => e.isPartyLedger);
    expect(party?.billAllocations[0]).toEqual({
      name: "INV-042",
      billType: "Agst Ref",
      amount: 7080,
    });
  });

  it("falls back to VCHTYPE attribute when VOUCHERTYPENAME is absent", () => {
    const noTypeName = SALES_VOUCHER.replace(/<VOUCHERTYPENAME>Sales<\/VOUCHERTYPENAME>/, "");
    expect(parseVouchers(noTypeName).records[0].kind).toBe("SALES");
  });
});

describe("parseVouchers (real fixture)", () => {
  const xml = readFileSync(join(FIXTURES, "vouchers-daybook.xml"), "utf8");

  it("parses every voucher; GUIDs unique; dates valid ISO", () => {
    const { records, warnings } = parseVouchers(xml);
    expect(records.length).toBeGreaterThan(0);
    expect(new Set(records.map((v) => v.guid)).size).toBe(records.length);
    for (const v of records) {
      expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.voucherNumber).not.toBe("");
    }
    const EXPECTED_TOTAL = (xml.match(/<VOUCHER[ >]/g) ?? []).length;
    expect(records.length + warnings.length).toBe(EXPECTED_TOTAL);
  });

  it("covers the voucher kinds guaranteed by the Phase 0 fixture inventory", () => {
    // Phase 0 Task 9 requires at least one Sales, Purchase, Receipt, Payment voucher
    // with bill-wise allocations present.
    const kinds = new Set(parseVouchers(xml).records.map((v) => v.kind));
    expect(kinds.has("SALES")).toBe(true);
    expect(kinds.has("PURCHASE")).toBe(true);
    expect(kinds.has("RECEIPT")).toBe(true);
    expect(kinds.has("PAYMENT")).toBe(true);
    const hasAllocations = parseVouchers(xml).records.some((v) =>
      v.ledgerEntries.some((e) => e.billAllocations.length > 0),
    );
    expect(hasAllocations).toBe(true);
  });
});
