import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { extractInvoicesFromPdf } from "@/lib/import/pdf";

const bytes = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/tally/pdf/${n}.pdf`));

describe("extractInvoicesFromPdf", () => {
  it("uses the deterministic parser and computes net-30 due date", async () => {
    const r = await extractInvoicesFromPdf("AL-104.pdf", bytes("AL-104"), {
      lookupParty: async () => ({ email: "arjun@example.com", creditDays: undefined }),
    });
    expect(r.method).toBe("deterministic");
    expect(r.invoice?.clientEmail).toBe("arjun@example.com");
    expect(r.invoice?.dueDate).toBe("2026-07-17"); // 2026-06-17 + 30d
    expect(r.needsEmail).toBe(false);
  });

  it("prefers the party's credit period for the due date when present", async () => {
    const r = await extractInvoicesFromPdf("AL-104.pdf", bytes("AL-104"), {
      lookupParty: async () => ({ email: "a@b.com", creditDays: 45 }),
    });
    expect(r.invoice?.dueDate).toBe("2026-08-01"); // 2026-06-17 + 45d (brief's "2026-07-31" is off by one)
  });

  it("flags needsEmail when no party matches", async () => {
    const r = await extractInvoicesFromPdf("AL-104.pdf", bytes("AL-104"), {
      lookupParty: async () => null,
    });
    expect(r.needsEmail).toBe(true);
    expect(r.invoice?.clientEmail).toBe("");
  });

  it("falls back to the LLM when deterministic parsing fails", async () => {
    const llm = vi.fn().mockResolvedValue({
      invoice: { clientName: "X", invoiceNumber: "N1", amount: 100, lineItems: [] },
      invoiceDate: "2026-01-01",
    });
    const r = await extractInvoicesFromPdf("junk.pdf", new Uint8Array([1, 2, 3]), {
      lookupParty: async () => null,
      deps: { llm },
    });
    expect(llm).toHaveBeenCalled();
    expect(r.method).toBe("llm");
    expect(r.invoice?.invoiceNumber).toBe("N1");
  });
});
