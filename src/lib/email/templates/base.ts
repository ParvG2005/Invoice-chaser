import type { EmailTemplateData } from "@/lib/email/types";

export function renderBaseEmailTemplate(data: EmailTemplateData): string {
  const preheader = data.preheader ?? data.title;
  const footer = escapeHtml(
    data.footerText ?? "Sent via InvoicePilot — automated invoice reminders",
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.title)}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { width: 100%; padding: 24px 12px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .header { background: linear-gradient(135deg, #18181b 0%, #3f3f46 100%); color: #fff; padding: 24px 28px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .content { padding: 28px; color: #27272a; line-height: 1.6; font-size: 15px; }
    .content p { margin: 0 0 16px; }
    .footer { padding: 20px 28px; background: #fafafa; color: #71717a; font-size: 12px; border-top: 1px solid #e4e4e7; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
  </style>
</head>
<body>
  <span class="preheader">${escapeHtml(preheader)}</span>
  <div class="wrapper">
    <div class="card">
      <div class="header"><h1>InvoicePilot</h1></div>
      <div class="content">${data.bodyHtml}</div>
      <div class="footer">${footer}</div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToHtmlParagraphs(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}
