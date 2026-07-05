import type { EmailTone } from "@/generated/prisma/client";
import type { ReminderEmailContext } from "@/lib/ai/types";

const toneInstructions: Record<EmailTone, string> = {
  FRIENDLY:
    "Use a warm, friendly tone. Be understanding and collaborative. Avoid sounding pushy.",
  PROFESSIONAL:
    "Use a polished, professional business tone. Be clear and respectful.",
  FIRM: "Use a firm but polite tone. Emphasize urgency and the importance of prompt payment without being rude.",
  FINAL_NOTICE:
    "Use a formal, serious final-notice tone. State clearly this is the final reminder before the matter is escalated (e.g. credit hold or collections), while remaining professional and lawful. No threats beyond stated business consequences.",
};

export function buildReminderEmailPrompts(context: ReminderEmailContext) {
  const dueDateStr = context.dueDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const systemPrompt = `You are an expert accounts receivable assistant for ${context.organizationName}.
Write concise payment reminder emails and short WhatsApp notifications. ${toneInstructions[context.tone]}
Return ONLY valid JSON with keys: subject (string), bodyText (string), whatsappText (string).
- bodyText should be plain text suitable for email (2-4 short paragraphs). No markdown.
- whatsappText should be a short, direct message (max 280 characters) suitable for WhatsApp. Do not include subject lines or greetings like 'Subject:'. Just include the core reminder message with invoice details.`;

  const userPrompt = `Write a payment reminder email and a short WhatsApp message with these details:
- Client: ${context.clientName} (${context.clientEmail})
- Invoice #: ${context.invoiceNumber}
- Amount due: $${context.amount.toFixed(2)}
- Due date: ${dueDateStr}
- Days overdue: ${context.daysOverdue}
- Sender: ${context.senderName} from ${context.organizationName}
${context.notes ? `- Notes: ${context.notes}` : ""}

Provide the text for both formats in the JSON output.`;

  return { systemPrompt, userPrompt };
}
