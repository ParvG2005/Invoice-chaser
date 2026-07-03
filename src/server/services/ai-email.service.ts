import { NotFoundError } from "@/lib/api/errors";
import { getAiProvider } from "@/lib/ai";
import { buildReminderEmailPrompts } from "@/lib/ai/prompts/reminder-email";
import type { EmailTone } from "@prisma/client";
import { renderBaseEmailTemplate, textToHtmlParagraphs } from "@/lib/email/templates/base";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { aiGenerationRepository } from "@/server/repositories/ai-generation.repository";
import { decimalToNumber } from "@/lib/utils/currency";
import type { GenerateEmailResult } from "@/types";

interface ParsedEmailContent {
  subject: string;
  bodyText: string;
  whatsappText?: string;
}

function parseAiEmailJson(content: string): ParsedEmailContent {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      subject: "Payment reminder",
      bodyText: content,
      whatsappText: content.slice(0, 280),
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ParsedEmailContent;
    return {
      subject: parsed.subject ?? "Payment reminder",
      bodyText: parsed.bodyText ?? content,
      whatsappText: parsed.whatsappText ?? parsed.bodyText?.slice(0, 280) ?? content.slice(0, 280),
    };
  } catch {
    return {
      subject: "Payment reminder",
      bodyText: content,
      whatsappText: content.slice(0, 280),
    };
  }
}

export const aiEmailService = {
  async generateReminderEmail(
    organizationId: string,
    invoiceId: string,
    tone?: EmailTone,
    options?: { persist?: boolean; reminderId?: string },
  ): Promise<GenerateEmailResult> {
    const invoice = await invoiceRepository.findById(organizationId, invoiceId);
    if (!invoice) throw new NotFoundError("Invoice not found");

    const org = await organizationRepository.findById(organizationId);
    if (!org) throw new NotFoundError("Organization not found");

    const effectiveTone = tone ?? org.reminderSettings?.emailTone ?? "PROFESSIONAL";
    const daysOverdue = Math.max(
      0,
      Math.floor((Date.now() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
    );

    const prompts = buildReminderEmailPrompts({
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      invoiceNumber: invoice.invoiceNumber,
      amount: decimalToNumber(invoice.amount),
      dueDate: invoice.dueDate,
      daysOverdue,
      tone: effectiveTone,
      senderName: org.name,
      organizationName: org.name,
      notes: invoice.notes,
    });

    const provider = getAiProvider();
    const completion = await provider.complete({
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
    });

    const parsed = parseAiEmailJson(completion.content);
    const bodyHtml = renderBaseEmailTemplate({
      title: parsed.subject,
      bodyHtml: textToHtmlParagraphs(parsed.bodyText),
    });

    if (options?.persist !== false) {
      const reminderId = options?.reminderId;
      await aiGenerationRepository.create({
        organizationId,
        reminder: reminderId ? { connect: { id: reminderId } } : undefined,
        model: completion.model,
        prompt: `${prompts.systemPrompt}\n\n${prompts.userPrompt}`,
        response: completion.content,
        tone: effectiveTone,
        tokensUsed: completion.tokensUsed,
        latencyMs: completion.latencyMs,
      });
    }

    return {
      subject: parsed.subject,
      bodyHtml,
      bodyText: parsed.bodyText,
      whatsappText: parsed.whatsappText,
    };
  },
};
