import nodemailer from "nodemailer";
import { createLogger } from "@/lib/logger";
import type { EmailProvider, SendEmailParams, SendEmailResult } from "@/lib/email/types";

const log = createLogger("nodemailer-provider");

export class NodemailerEmailProvider implements EmailProvider {
  readonly name = "nodemailer";
  private transporter: nodemailer.Transporter;
  private fromEmail: string;

  constructor(host: string, port: number, user: string, pass: string, fromEmail: string) {
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });
    this.fromEmail = fromEmail;
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: params.replyTo,
      });

      return { id: info.messageId ?? "unknown", success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      log.error("Nodemailer send failed", { error: message });
      throw new Error(message);
    }
  }
}

export function createNodemailerProvider(): NodemailerEmailProvider {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM_EMAIL ?? "InvoicePilot <onboarding@resend.dev>";

  if (!host || !user || !pass) {
    throw new Error("SMTP variables (SMTP_HOST, SMTP_USER, SMTP_PASS) are not fully configured");
  }

  return new NodemailerEmailProvider(host, port, user, pass, fromEmail);
}
