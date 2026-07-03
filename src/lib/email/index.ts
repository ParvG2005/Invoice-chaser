import { createNodemailerProvider } from "@/lib/email/providers/nodemailer";
import type { EmailProvider } from "@/lib/email/types";

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!provider) {
    provider = createNodemailerProvider();
  }
  return provider;
}

export function setEmailProvider(customProvider: EmailProvider) {
  provider = customProvider;
}
