export interface PaymentBlockOptions {
  upiId: string | null;
  paymentLink: string | null;
}

/** Escape user-configured values before HTML interpolation. */
function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildPaymentBlock(opts: PaymentBlockOptions): { html: string; text: string } {
  const lines: { html: string; text: string }[] = [];
  if (opts.upiId) {
    lines.push({ html: `<strong>UPI:</strong> ${esc(opts.upiId)}`, text: `UPI: ${opts.upiId}` });
  }
  if (opts.paymentLink) {
    const safe = esc(opts.paymentLink);
    lines.push({
      html: `<strong>Pay online:</strong> <a href="${safe}">${safe}</a>`,
      text: `Pay online: ${opts.paymentLink}`,
    });
  }
  if (lines.length === 0) return { html: "", text: "" };
  return {
    html: `<div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;"><p style="margin:0 0 4px;font-weight:600;">How to pay</p>${lines.map((l) => `<p style="margin:0;">${l.html}</p>`).join("")}</div>`,
    text: `\n\nHow to pay\n${lines.map((l) => l.text).join("\n")}`,
  };
}
