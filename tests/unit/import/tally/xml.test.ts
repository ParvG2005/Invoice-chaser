import { describe, it, expect } from "vitest";
import {
  parseTallyEnvelope,
  asArray,
  text,
  num,
  parseTallyDate,
  parseTallyQuantity,
  parseTallyRate,
} from "@/lib/import/tally/xml";

const ENVELOPE = `<?xml version="1.0"?>
<ENVELOPE>
 <BODY>
  <IMPORTDATA>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Acme Traders" ACTION="Create">
      <GUID>abc-123-0001</GUID>
      <PARENT>Sundry Debtors</PARENT>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Beta Supplies" ACTION="Create">
      <GUID>abc-123-0002</GUID>
      <PARENT>Sundry Creditors</PARENT>
     </LEDGER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;

describe("parseTallyEnvelope", () => {
  it("returns one node per TALLYMESSAGE for IMPORTDATA envelopes", () => {
    const messages = parseTallyEnvelope(ENVELOPE);
    expect(messages).toHaveLength(2);
    expect(text((messages[0].LEDGER as Record<string, unknown>).GUID)).toBe("abc-123-0001");
  });

  it("also handles EXPORTDATA envelopes", () => {
    const exported = ENVELOPE.replace(/IMPORTDATA/g, "EXPORTDATA");
    expect(parseTallyEnvelope(exported)).toHaveLength(2);
  });

  it("throws a descriptive error on non-XML input", () => {
    expect(() => parseTallyEnvelope("not xml at all")).toThrow(/Tally XML/);
  });

  it("throws when the envelope has no TALLYMESSAGE nodes", () => {
    expect(() => parseTallyEnvelope("<ENVELOPE><BODY/></ENVELOPE>")).toThrow(/TALLYMESSAGE/);
  });
});

describe("scalar helpers", () => {
  it("asArray wraps scalars, passes arrays, drops nullish", () => {
    expect(asArray("a")).toEqual(["a"]);
    expect(asArray(["a", "b"])).toEqual(["a", "b"]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(null)).toEqual([]);
  });

  it("text trims and stringifies; num strips commas and parses sign", () => {
    expect(text("  hello ")).toBe("hello");
    expect(text(undefined)).toBe("");
    expect(text(42)).toBe("42");
    expect(num("-18500.00")).toBe(-18500);
    expect(num("1,18,500.50")).toBe(118500.5);
    expect(num("")).toBe(0);
    expect(num("garbage")).toBe(0);
  });

  it("parseTallyDate converts YYYYMMDD and rejects junk", () => {
    expect(parseTallyDate("20260401")).toBe("2026-04-01");
    expect(parseTallyDate("2026-04-01")).toBe("2026-04-01");
    expect(parseTallyDate("1-Apr")).toBeNull();
    expect(parseTallyDate("")).toBeNull();
  });

  it("parseTallyQuantity and parseTallyRate strip units", () => {
    expect(parseTallyQuantity(" 5 nos")).toBe(5);
    expect(parseTallyQuantity("-2.500 kg")).toBe(-2.5);
    expect(parseTallyQuantity("")).toBe(0);
    expect(parseTallyRate("1,200.00/nos")).toBe(1200);
    expect(parseTallyRate("")).toBe(0);
  });
});
