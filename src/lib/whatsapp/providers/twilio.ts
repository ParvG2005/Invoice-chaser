import { createLogger } from "@/lib/logger";

const log = createLogger("whatsapp-provider");

export interface SendWhatsappParams {
  to: string;
  body: string;
}

export interface SendWhatsappResult {
  id: string;
  success: boolean;
}

export interface WhatsappProvider {
  readonly name: string;
  send(params: SendWhatsappParams): Promise<SendWhatsappResult>;
}

export class TwilioWhatsappProvider implements WhatsappProvider {
  readonly name = "twilio-whatsapp";

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
  ) {}

  async send(params: SendWhatsappParams): Promise<SendWhatsappResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    
    // Ensure numbers are formatted as whatsapp:+1234567890
    const formatNumber = (num: string) => {
      const clean = num.trim();
      if (clean.startsWith("whatsapp:")) return clean;
      return `whatsapp:${clean.startsWith("+") ? clean : `+${clean}`}`;
    };

    const to = formatNumber(params.to);
    const from = formatNumber(this.fromNumber);

    const formData = new URLSearchParams();
    formData.append("To", to);
    formData.append("From", from);
    formData.append("Body", params.body);

    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Twilio API error ${response.status}: ${text}`);
      }

      const data = await response.json();
      log.info("WhatsApp message sent successfully via Twilio", { sid: data.sid });
      return { id: data.sid ?? "unknown", success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      log.error("Twilio WhatsApp send failed", { error: message });
      throw error;
    }
  }
}

export class CallMeBotWhatsappProvider implements WhatsappProvider {
  readonly name = "callmebot-whatsapp";

  constructor(private readonly apiKey: string) {}

  async send(params: SendWhatsappParams): Promise<SendWhatsappResult> {
    // Ensure phone number starts with + and has no spaces
    let phone = params.to.replace(/\s+/g, "");
    if (!phone.startsWith("+")) {
      phone = `+${phone}`;
    }

    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(params.body)}&apikey=${this.apiKey}`;

    try {
      const response = await fetch(url, { method: "GET" });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`CallMeBot API error ${response.status}: ${text}`);
      }

      log.info("WhatsApp message sent successfully via CallMeBot", { phone });
      return { id: `callmebot-${Date.now()}`, success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      log.error("CallMeBot WhatsApp send failed", { error: message });
      throw error;
    }
  }
}

export class MockWhatsappProvider implements WhatsappProvider {
  readonly name = "mock-whatsapp";

  async send(params: SendWhatsappParams): Promise<SendWhatsappResult> {
    const id = `mock-wa-${Date.now()}`;
    log.info(`[MOCK WHATSAPP SEND] To: ${params.to} | Message: ${params.body}`);
    return { id, success: true };
  }
}

export function getWhatsappProvider(): WhatsappProvider {
  const callmebotApiKey = process.env.CALLMEBOT_API_KEY;
  if (callmebotApiKey) {
    return new CallMeBotWhatsappProvider(callmebotApiKey);
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (accountSid && authToken && fromNumber) {
    return new TwilioWhatsappProvider(accountSid, authToken, fromNumber);
  }

  // Fallback to mock for testing without account
  return new MockWhatsappProvider();
}
