import { describe, it, expect } from "vitest";
import { buildPaymentBlock } from "@/lib/channels/payment-block";

describe("buildPaymentBlock", () => {
  it("renders UPI id and payment link when present", () => {
    const block = buildPaymentBlock({ upiId: "acme@okhdfcbank", paymentLink: "https://pay.example/inv042" });
    expect(block.html).toContain("acme@okhdfcbank");
    expect(block.html).toContain("https://pay.example/inv042");
    expect(block.text).toContain("UPI: acme@okhdfcbank");
    expect(block.text).toContain("Pay online: https://pay.example/inv042");
  });

  it("renders only the configured pieces", () => {
    const upiOnly = buildPaymentBlock({ upiId: "acme@upi", paymentLink: null });
    expect(upiOnly.text).toContain("UPI: acme@upi");
    expect(upiOnly.text).not.toContain("Pay online");
  });

  it("returns empty strings when nothing is configured", () => {
    expect(buildPaymentBlock({ upiId: null, paymentLink: null })).toEqual({ html: "", text: "" });
  });
});
