import { describe, it, expect } from "vitest";
import { buildGmailComposeUrl, buildMailtoUrl } from "@/lib/email/compose-link";

describe("compose-link", () => {
  const input = {
    to: "client@example.com",
    subject: "Payment reminder: INV-1",
    body: "Hi there,\n\nYour invoice is overdue.",
  };

  it("builds a Gmail compose URL with encoded params", () => {
    const url = buildGmailComposeUrl(input);
    expect(url).toContain("https://mail.google.com/mail/?view=cm&fs=1");
    expect(url).toContain(`to=${encodeURIComponent(input.to)}`);
    expect(url).toContain(`su=${encodeURIComponent(input.subject)}`);
    expect(url).toContain(`body=${encodeURIComponent(input.body)}`);
  });

  it("builds a mailto URL with encoded subject and body", () => {
    const url = buildMailtoUrl(input);
    expect(url).toBe(
      `mailto:${input.to}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(input.body)}`,
    );
  });

  it("safely encodes special characters (&, newlines)", () => {
    const special = { to: "a@b.co", subject: "Invoice & Reminder", body: "Line1\nLine2" };
    const gmailUrl = buildGmailComposeUrl(special);
    expect(gmailUrl).toContain(encodeURIComponent("Invoice & Reminder"));
    expect(gmailUrl).toContain(encodeURIComponent("Line1\nLine2"));

    const mailtoUrl = buildMailtoUrl(special);
    expect(mailtoUrl).toContain(encodeURIComponent("Invoice & Reminder"));
    expect(mailtoUrl).toContain(encodeURIComponent("Line1\nLine2"));
  });
});
