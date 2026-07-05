import { z } from "zod";
import { aiEmailService } from "@/server/services/ai-email.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({
  invoiceId: z.string().min(1),
  tone: z.enum(["FRIENDLY", "PROFESSIONAL", "FIRM"]).optional(),
});

export const draftEmail: ToolDefinition<z.infer<typeof schema>> = {
  name: "draft_email",
  kind: "read",
  description:
    "Draft a reminder email for an invoice without sending it. Returns subject and body only; use the send-reminder write tool to actually send.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      invoiceId: { type: "string", description: "The invoice id to draft a reminder for." },
      tone: { type: "string", enum: ["FRIENDLY", "PROFESSIONAL", "FIRM"], description: "Tone of the email." },
    },
    required: ["invoiceId"],
    additionalProperties: false,
  },
  summarize: (i) => `Draft reminder email for invoice ${i.invoiceId}`,
  async execute(ctx, input) {
    const result = await aiEmailService.generateReminderEmail(
      ctx.organizationId,
      input.invoiceId,
      input.tone,
      { persist: false },
    );
    return { ok: true, data: { subject: result.subject, bodyText: result.bodyText, bodyHtml: result.bodyHtml } };
  },
};
