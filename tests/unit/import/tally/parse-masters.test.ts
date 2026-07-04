import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLedgers, parseStockItems } from "@/lib/import/tally/parse-masters";

const FIXTURES = join(__dirname, "../../../fixtures/tally");

const LEDGERS_XML = `<?xml version="1.0"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
 <TALLYMESSAGE>
  <LEDGER NAME="Acme Traders" ACTION="Create">
   <GUID>guid-led-0001</GUID>
   <ALTERID>15</ALTERID>
   <PARENT>Sundry Debtors</PARENT>
   <EMAIL>accounts@acme.example</EMAIL>
   <LEDGERPHONE>+91 98765 43210</LEDGERPHONE>
   <PARTYGSTIN>27AAPFU0939F1ZV</PARTYGSTIN>
   <ADDRESS.LIST TYPE="String">
    <ADDRESS>12 MG Road</ADDRESS>
    <ADDRESS>Pune 411001</ADDRESS>
   </ADDRESS.LIST>
   <BILLCREDITPERIOD>30 Days</BILLCREDITPERIOD>
   <ISBILLWISEON>Yes</ISBILLWISEON>
   <OPENINGBALANCE>-18500.00</OPENINGBALANCE>
  </LEDGER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <LEDGER NAME="Sales Account" ACTION="Create">
   <GUID>guid-led-0002</GUID>
   <ALTERID>3</ALTERID>
   <PARENT>Sales Accounts</PARENT>
  </LEDGER>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <LEDGER NAME="Nameless">
   <PARENT>Sundry Debtors</PARENT>
  </LEDGER>
 </TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

describe("parseLedgers (synthetic)", () => {
  it("maps every LEDGER field", () => {
    const { records, warnings } = parseLedgers(LEDGERS_XML);
    const acme = records.find((l) => l.name === "Acme Traders");
    expect(acme).toMatchObject({
      guid: "guid-led-0001",
      alterId: 15,
      parent: "Sundry Debtors",
      email: "accounts@acme.example",
      phone: "+91 98765 43210",
      gstin: "27AAPFU0939F1ZV",
      address: "12 MG Road, Pune 411001",
      creditPeriodDays: 30,
      isBillWiseOn: true,
      openingBalance: -18500,
    });
    // GUID-less ledger is skipped with a warning, not a crash
    expect(records).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/GUID/i);
  });

  it("keeps non-party ledgers (routing to Party happens in the service, not the parser)", () => {
    const { records } = parseLedgers(LEDGERS_XML);
    expect(records.map((l) => l.parent)).toContain("Sales Accounts");
  });
});

describe("parseLedgers (real fixture)", () => {
  const xml = readFileSync(join(FIXTURES, "masters-ledgers.xml"), "utf8");

  it("parses every LEDGER with a GUID, uniquely", () => {
    const { records } = parseLedgers(xml);
    expect(records.length).toBeGreaterThan(0);
    const guids = records.map((l) => l.guid);
    expect(new Set(guids).size).toBe(guids.length);
    for (const l of records) {
      expect(l.guid).not.toBe("");
      expect(l.name).not.toBe("");
      expect(l.parent).not.toBe("");
      expect(Number.isFinite(l.alterId)).toBe(true);
    }
  });

  it("record count matches the raw LEDGER tag count", () => {
    // Pin the exact number: run `grep -c "<LEDGER " tests/fixtures/tally/masters-ledgers.xml`
    // and replace EXPECTED below with (that count minus any GUID-less records reported
    // in `warnings`). Assert both so fixture drift is caught.
    const { records, warnings } = parseLedgers(xml);
    const EXPECTED_TOTAL = (xml.match(/<LEDGER[ >]/g) ?? []).length;
    expect(records.length + warnings.length).toBe(EXPECTED_TOTAL);
  });
});

const STOCK_XML = `<?xml version="1.0"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
 <TALLYMESSAGE>
  <STOCKITEM NAME="Widget A" ACTION="Create">
   <GUID>guid-stk-0001</GUID>
   <ALTERID>7</ALTERID>
   <BASEUNITS>nos</BASEUNITS>
   <HSNCODE>84advance71</HSNCODE>
   <GSTDETAILS.LIST>
    <HSNCODE>847130</HSNCODE>
    <STATEWISEDETAILS.LIST>
     <RATEDETAILS.LIST>
      <GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD>
      <GSTRATE>18</GSTRATE>
     </RATEDETAILS.LIST>
    </STATEWISEDETAILS.LIST>
   </GSTDETAILS.LIST>
   <OPENINGBALANCE>10 nos</OPENINGBALANCE>
   <OPENINGRATE>1,200.00/nos</OPENINGRATE>
  </STOCKITEM>
 </TALLYMESSAGE>
 <TALLYMESSAGE>
  <STOCKITEM NAME="No Guid Item"><BASEUNITS>kg</BASEUNITS></STOCKITEM>
 </TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

describe("parseStockItems (synthetic)", () => {
  it("maps STOCKITEM fields including nested GST rate", () => {
    const { records, warnings } = parseStockItems(STOCK_XML);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      guid: "guid-stk-0001",
      alterId: 7,
      name: "Widget A",
      unit: "nos",
      hsnCode: "847130",
      gstRate: 18,
      openingQty: 10,
      openingRate: 1200,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/GUID/i);
  });
});

describe("parseStockItems (real fixture)", () => {
  const stockXml = readFileSync(join(FIXTURES, "masters-stockitems.xml"), "utf8");

  it("parses every STOCKITEM with unique GUIDs and a unit", () => {
    const { records, warnings } = parseStockItems(stockXml);
    expect(records.length).toBeGreaterThan(0);
    expect(new Set(records.map((r) => r.guid)).size).toBe(records.length);
    for (const r of records) {
      expect(r.name).not.toBe("");
      expect(r.unit).not.toBe("");
    }
    const EXPECTED_TOTAL = (stockXml.match(/<STOCKITEM[ >]/g) ?? []).length;
    expect(records.length + warnings.length).toBe(EXPECTED_TOTAL);
  });
});
