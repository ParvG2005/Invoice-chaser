export type Channel = "EMAIL" | "WHATSAPP";

export interface OutboundMessage {
  channel: Channel;
  to: string;                // email address or E.164 phone
  subject?: string;          // EMAIL only
  bodyHtml?: string;         // EMAIL only
  bodyText?: string;         // EMAIL plaintext alt / WHATSAPP session text
  templateId?: string;       // WHATSAPP approved template name
  templateParams?: string[]; // ordered template body params {{1}}..{{n}}
  replyTo?: string;
}

export interface SendResult {
  providerId: string;
  success: boolean;
  error?: string;
}

export interface ChannelProvider {
  readonly name: string;
  readonly channel: Channel;
  send(msg: OutboundMessage): Promise<SendResult>;
}
