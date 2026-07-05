import { z } from "zod";
import { reminderService } from "@/server/services/reminder.service";
import { withAudit } from "@/server/services/audit.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

/**
 * The brief's `{ invoiceId, channel, tone? }` doesn't match a real
 * capability: `reminderService` has no channel/tone override, and Phase 4
 * reminders only ever send EMAIL regardless of the org's enabled channels
 * (see `sendReminder`'s trailing `.filter((c) => c === "EMAIL")`). This tool
 * is trimmed to `{ invoiceId }` and delegates to
 * `scheduleRemindersForInvoices`, the same entry point used by the UI's
 * per-invoice "Send reminder now" row action (`POST /api/reminders/trigger`).
 */
const schema = z.object({
  invoiceId: z.string().min(1),
});

export const sendReminder: ToolDefinition<z.infer<typeof schema>> = {
  name: "send_reminder",
  kind: "write",
  description:
    "Send a payment reminder now for an overdue invoice (email). Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      invoiceId: { type: "string" },
    },
    required: ["invoiceId"],
    additionalProperties: false,
  },
  summarize: (i) => `Send reminder now for invoice ${i.invoiceId}`,
  async execute(ctx, input) {
    const result = await withAudit(
      { type: "ASSISTANT", id: ctx.userId },
      "send_reminder",
      { organizationId: ctx.organizationId, entityType: "Reminder", entityId: input.invoiceId },
      () => reminderService.scheduleRemindersForInvoices(ctx.organizationId, [input.invoiceId]),
    );
    return { ok: true, data: result };
  },
};
