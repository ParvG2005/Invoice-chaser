import { createLogger } from "@/lib/logger";
import type { ChannelProvider, OutboundMessage, SendResult } from "@/lib/channels/channel-provider";

const log = createLogger("resend-provider");

export class ResendEmailProvider implements ChannelProvider {
  readonly name = "resend";
  readonly channel = "EMAIL" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    if (!msg.subject || !msg.bodyHtml) {
      throw new Error("EMAIL messages require subject and bodyHtml are required");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [msg.to],
        subject: msg.subject,
        html: msg.bodyHtml,
        text: msg.bodyText,
        reply_to: msg.replyTo,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      log.error("Resend send failed", { status: response.status });
      throw new Error(`Resend API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as { id?: string };
    return { providerId: data.id ?? "unknown", success: true };
  }
}

export function createResendProvider(): ResendEmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ??
    process.env.SMTP_FROM_EMAIL ??
    "InvoicePilot <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  return new ResendEmailProvider(apiKey, fromEmail);
}
