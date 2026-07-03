export interface ComposeLinkInput {
  to: string;
  subject: string;
  body: string;
}

/** Opens Gmail's web compose UI prefilled — reliable for Gmail users regardless of OS default mail handler. */
export function buildGmailComposeUrl({ to, subject, body }: ComposeLinkInput): string {
  const params = [
    "view=cm",
    "fs=1",
    `to=${encodeURIComponent(to)}`,
    `su=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ].join("&");
  return `https://mail.google.com/mail/?${params}`;
}

/** Opens the OS/browser default mail client — works for any provider, but requires one to be configured as default. */
// Note: many mail clients silently truncate mailto: URLs past ~2000 chars — long AI-drafted bodies may get cut off.
export function buildMailtoUrl({ to, subject, body }: ComposeLinkInput): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
