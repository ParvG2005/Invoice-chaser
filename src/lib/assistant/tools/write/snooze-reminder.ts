import { z } from "zod";
import { invoiceService } from "@/server/services/invoice.service";
import { withAudit } from "@/server/services/audit.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

/**
 * The brief's `{ reminderId, until }` has no real match — there is no
 * per-reminder `snooze`/`update` on `reminderService`. The real capability is
 * `invoiceService.snooze(organizationId, invoiceId, days)`, which shifts
 * every unsent reminder for an invoice forward by a day delta (used by the
 * per-invoice "Snooze reminders" action). This tool is adapted to that real
 * shape: `{ invoiceId, days }` instead of `{ reminderId, until }`.
 */
const schema = z.object({
  invoiceId: z.string().min(1),
  days: z.number().int().min(1).max(90),
});

export const snoozeReminder: ToolDefinition<z.infer<typeof schema>> = {
  name: "snooze_reminder",
  kind: "write",
  description:
    "Shift all unsent reminders for an invoice forward by a number of days. Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      invoiceId: { type: "string" },
      days: { type: "integer", minimum: 1, maximum: 90 },
    },
    required: ["invoiceId", "days"],
    additionalProperties: false,
  },
  summarize: (i) => `Snooze reminders for invoice ${i.invoiceId} by ${i.days} day(s)`,
  async execute(ctx, input) {
    const result = await withAudit(
      { type: "ASSISTANT", id: ctx.userId },
      "snooze_reminder",
      { organizationId: ctx.organizationId, entityType: "Reminder", entityId: input.invoiceId },
      () => invoiceService.snooze(ctx.organizationId, input.invoiceId, input.days),
    );
    return { ok: true, data: result };
  },
};
