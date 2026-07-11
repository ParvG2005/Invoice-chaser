import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { llmExtractInvoice } from "@/lib/import/pdf/llm-extract";

function mockClient(payload: unknown): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "tool_use", name: "emit_invoice", input: payload }],
      }),
    },
  } as unknown as Anthropic;
}

describe("llmExtractInvoice", () => {
  it("maps a valid tool_use payload to ParsedInvoice", async () => {
    const client = mockClient({
      invoiceNumber: "AL/104", clientName: "Arjun Traders", invoiceDate: "2026-06-17",
      amount: 12501, buyerGstin: "23ABRPV7692P1ZC", buyerPhone: "8269222669",
      lineItems: [{ description: "TB/TRUFIX 110 GREY 20KG", qty: 50, rate: 250, discountPct: 15.25, taxRatePct: 18 }],
    });
    const r = await llmExtractInvoice(new Uint8Array([1, 2, 3]), { client });
    expect(r?.invoice.invoiceNumber).toBe("AL/104");
    expect(r?.invoiceDate).toBe("2026-06-17");
    expect(r?.invoice.lineItems).toHaveLength(1);
  });

  it("returns null when required fields are missing", async () => {
    const client = mockClient({ clientName: "X" });
    expect(await llmExtractInvoice(new Uint8Array([1]), { client })).toBeNull();
  });
});
