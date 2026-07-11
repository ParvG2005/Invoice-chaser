import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ParsedInvoice } from "./types";

const MODEL = process.env.PDF_EXTRACT_MODEL ?? "claude-sonnet-5";

const payloadSchema = z.object({
  invoiceNumber: z.string().min(1),
  clientName: z.string().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().positive(),
  buyerGstin: z.string().optional(),
  buyerPhone: z.string().optional(),
  buyerAddress: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        qty: z.coerce.number().positive(),
        rate: z.coerce.number().nonnegative(),
        discountPct: z.coerce.number().min(0).max(100).default(0),
        taxRatePct: z.coerce.number().min(0).max(100).default(0),
        hsnCode: z.string().optional(),
      }),
    )
    .default([]),
});

const TOOL: Anthropic.Tool = {
  name: "emit_invoice",
  description: "Return the structured invoice extracted from the PDF.",
  input_schema: {
    type: "object",
    properties: {
      invoiceNumber: { type: "string", description: "Invoice number" },
      clientName: { type: "string", description: "Buyer / Bill-to name" },
      invoiceDate: { type: "string", description: "Invoice date, ISO yyyy-mm-dd" },
      amount: { type: "number", description: "Grand total incl. tax" },
      buyerGstin: { type: "string", description: "Buyer's GSTIN / UIN, if shown" },
      buyerPhone: { type: "string", description: "Buyer's contact phone, if shown" },
      buyerAddress: { type: "string", description: "Buyer's billing address, if shown" },
      lineItems: {
        type: "array",
        description: "Every product/service row in the item table",
        items: {
          type: "object",
          properties: {
            description: { type: "string", description: "Item / product name" },
            qty: { type: "number", description: "Quantity" },
            rate: { type: "number", description: "Unit rate" },
            discountPct: { type: "number", description: "Discount percent" },
            taxRatePct: { type: "number", description: "GST rate percent" },
            hsnCode: { type: "string", description: "HSN/SAC code for the item" },
          },
          required: ["description", "qty", "rate"],
        },
      },
    },
    required: ["invoiceNumber", "clientName", "invoiceDate", "amount"],
  },
};

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export async function llmExtractInvoice(
  bytes: Uint8Array,
  deps: { client?: Anthropic } = {},
): Promise<ParsedInvoice | null> {
  const client = deps.client ?? new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "emit_invoice" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) },
          },
          {
            type: "text",
            text:
              "Extract the COMPLETE tax invoice into the emit_invoice tool: invoice number, date, " +
              "buyer name, GSTIN, phone and billing address, every line item (description, HSN/SAC, " +
              "quantity, rate, discount %, GST %), and the grand total. Dates as ISO yyyy-mm-dd. " +
              "Omit any field the invoice does not show rather than guessing.",
          },
        ],
      },
    ],
  });

  const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!block) return null;
  const parsed = payloadSchema.safeParse(block.input);
  if (!parsed.success) return null;

  const p = parsed.data;
  return {
    invoice: {
      clientName: p.clientName,
      clientPhone: p.buyerPhone,
      invoiceNumber: p.invoiceNumber,
      amount: p.amount,
      lineItems: p.lineItems,
    },
    invoiceDate: p.invoiceDate,
    buyerGstin: p.buyerGstin,
    buyerPhone: p.buyerPhone,
    buyerAddress: p.buyerAddress,
  };
}
