import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { z } from "zod";
import { getEmailProvider } from "@/lib/email";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { emailLogRepository } from "@/server/repositories/email-log.repository";
import { NotFoundError } from "@/lib/api/errors";
import { createLogger } from "@/lib/logger";
import { isDemoOrg } from "@/lib/demo";

const log = createLogger("send-email");

const sendEmailSchema = z.object({
  invoiceId: z.string().uuid(),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().min(1),
  whatsappText: z.string().optional(),
});

export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const { invoiceId, subject, bodyHtml, bodyText, whatsappText } = sendEmailSchema.parse(body);

    const invoice = await invoiceRepository.findById(ctx.organizationId, invoiceId);
    if (!invoice) throw new NotFoundError("Invoice not found");

    const logEntry = await emailLogRepository.create({
      organizationId: ctx.organizationId,
      invoice: { connect: { id: invoiceId } },
      toEmail: invoice.clientEmail,
      subject,
      bodyHtml,
      status: "QUEUED",
    });

    // Demo org: never dispatch real email/WhatsApp. Mark the log SENT so the
    // UI reflects a send without reaching a real inbox.
    if (await isDemoOrg(ctx.organizationId)) {
      log.info("Demo org — skipping real send", { invoiceId });
      await emailLogRepository.updateStatus(logEntry.id, "SENT", {
        providerId: "demo-skip",
        sentAt: new Date(),
      });
      return successResponse({ sent: true, whatsappSent: false, messageId: "demo-skip" });
    }

    // Try to send WhatsApp if phone is present and message was generated
    let whatsappSent = false;
    if (whatsappText && invoice.clientPhone) {
      try {
        const { getWhatsappProvider } = await import("@/lib/whatsapp/providers/twilio");
        const waProvider = getWhatsappProvider();
        await waProvider.send({
          to: invoice.clientPhone,
          body: whatsappText,
        });
        whatsappSent = true;
        log.info("WhatsApp sent manually", { invoiceId, to: invoice.clientPhone });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send WhatsApp";
        log.error("Failed to send WhatsApp manually", { invoiceId, error: message });
      }
    }

    try {
      const provider = getEmailProvider();
      const result = await provider.send({
        to: invoice.clientEmail,
        subject,
        html: bodyHtml,
        text: bodyText,
      });

      await emailLogRepository.updateStatus(logEntry.id, "SENT", {
        providerId: result.id,
        sentAt: new Date(),
      });

      log.info("Email sent manually", { invoiceId, to: invoice.clientEmail });
      return successResponse({ sent: true, whatsappSent, messageId: result.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      await emailLogRepository.updateStatus(logEntry.id, "FAILED", {
        errorMessage: message,
      });
      throw error;
    }
  },
  { requiredRole: "member" },
);
