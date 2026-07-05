import type { Channel, ChannelProvider, OutboundMessage, SendResult } from "@/lib/channels/channel-provider";
import { createResendProvider } from "@/lib/channels/resend-provider";
import { getEmailProvider } from "@/lib/email";

const providers = new Map<Channel, ChannelProvider>();

export function setChannelProvider(channel: Channel, provider: ChannelProvider): void {
  providers.set(channel, provider);
}

export function resetChannelProviders(): void {
  providers.clear();
}

export function getChannelProvider(channel: Channel): ChannelProvider {
  const existing = providers.get(channel);
  if (existing) return existing;
  const created = createDefaultProvider(channel);
  providers.set(channel, created);
  return created;
}

// WHATSAPP factory intentionally not wired: Phase 4 is email-only (WhatsApp task dropped).
function createDefaultProvider(channel: Channel): ChannelProvider {
  if (channel === "EMAIL") {
    if (process.env.RESEND_API_KEY) return createResendProvider();
    return createLegacySmtpAdapter(); // dev fallback until Resend is configured
  }
  throw new Error(`No provider registered for channel ${channel}`);
}

/** Adapts the legacy nodemailer EmailProvider to ChannelProvider for local dev. */
function createLegacySmtpAdapter(): ChannelProvider {
  return {
    name: "smtp-legacy",
    channel: "EMAIL",
    async send(msg: OutboundMessage): Promise<SendResult> {
      if (!msg.subject || !msg.bodyHtml) {
        throw new Error("EMAIL messages require subject and bodyHtml are required");
      }
      const result = await getEmailProvider().send({
        to: msg.to,
        subject: msg.subject,
        html: msg.bodyHtml,
        text: msg.bodyText,
        replyTo: msg.replyTo,
      });
      return { providerId: result.id, success: result.success };
    },
  };
}
