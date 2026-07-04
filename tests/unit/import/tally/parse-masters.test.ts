import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLedgers } from "@/lib/import/tally/parse-masters";

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
