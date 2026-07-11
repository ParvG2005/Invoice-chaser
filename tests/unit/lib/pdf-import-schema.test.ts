import { describe, it, expect } from "vitest";
import { pdfImportCommitSchema } from "@/lib/validations/invoice";

const base = {
  invoiceNumber: "INV-001",
  clientName: "Acme Traders",
  clientEmail: "acme@example.com",
  dueDate: "2026-08-01",
  amount: 1500,
};

describe("pdfImportCommitSchema resilience", () => {
  it("clamps an over-length / labelled GSTIN instead of 422-ing the batch", () => {
    const parsed = pdfImportCommitSchema.parse({
      invoices: [{ ...base, buyerGstin: "GSTIN 27AAAAA0000A1Z5" }],
    });
    // whitespace stripped, uppercased, clamped to 15 chars
    expect(parsed.invoices[0].buyerGstin).toBe("GSTIN27AAAAA000");
    expect(parsed.invoices[0].buyerGstin!.length).toBe(15);
  });

  it("truncates an over-length buyer address rather than rejecting", () => {
    const long = "A".repeat(900);
    const parsed = pdfImportCommitSchema.parse({
      invoices: [{ ...base, buyerAddress: long }],
    });
    expect(parsed.invoices[0].buyerAddress!.length).toBe(500);
  });

  it("truncates an over-length line-item description", () => {
    const parsed = pdfImportCommitSchema.parse({
      invoices: [
        {
          ...base,
          lineItems: [{ description: "X".repeat(700), qty: 1, rate: 10 }],
        },
      ],
    });
    expect(parsed.invoices[0].lineItems![0].description.length).toBe(500);
  });

  it("coerces empty enrichment strings to null", () => {
    const parsed = pdfImportCommitSchema.parse({
      invoices: [{ ...base, buyerGstin: "   ", clientPhone: "" }],
    });
    expect(parsed.invoices[0].buyerGstin).toBeNull();
    expect(parsed.invoices[0].clientPhone).toBeNull();
  });

  it("collapses a malformed / untrimmed email to '' instead of 422-ing", () => {
    const parsed = pdfImportCommitSchema.parse({
      invoices: [
        { ...base, clientEmail: "not-an-email" },
        { ...base, invoiceNumber: "INV-002", clientEmail: "  spaced@example.com  " },
        { ...base, invoiceNumber: "INV-003", clientEmail: "acme@x" },
      ],
    });
    expect(parsed.invoices[0].clientEmail).toBe("");
    expect(parsed.invoices[1].clientEmail).toBe("spaced@example.com");
    expect(parsed.invoices[2].clientEmail).toBe("");
  });

  it("still rejects a genuinely missing required field", () => {
    expect(() =>
      pdfImportCommitSchema.parse({ invoices: [{ ...base, amount: -5 }] }),
    ).toThrow();
  });
});
