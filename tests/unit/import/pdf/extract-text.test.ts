import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { extractPdfText } from "@/lib/import/pdf/extract-text";

describe("extractPdfText", () => {
  it("extracts the text layer of a Tally tax invoice", async () => {
    const bytes = new Uint8Array(readFileSync("tests/fixtures/tally/pdf/AL-104.pdf"));
    const text = await extractPdfText(bytes);
    expect(text).toContain("TAX INVOICE");
    expect(text).toContain("AL/104");
    expect(text).toContain("Arjun Traders");
    expect(text).toContain("38245090");
  });
});
