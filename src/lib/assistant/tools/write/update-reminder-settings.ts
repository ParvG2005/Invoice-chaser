import { z } from "zod";
import { reminderService } from "@/server/services/reminder.service";
import { withAudit } from "@/server/services/audit.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

/**
 * `reminderService.updateSettings` replaces the whole settings row (see
 * `reminderRepository.upsertSettings` — no partial-field upsert), so every
 * field of `ReminderSettingsInput` is required by the real schema. To let
 * the model change just one or two fields, this tool's own input schema is
 * fully optional; `execute` fetches the current settings via `getSettings`
 * and merges the model's partial input on top before calling `updateSettings`.
 */
const schema = z.object({
  reminderDays: z.array(z.number().int().min(0).max(90)).min(1).max(10).optional(),
  emailTone: z.enum(["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"]).optional(),
  autoSend: z.boolean().optional(),
  enabledChannels: z.array(z.enum(["EMAIL", "WHATSAPP"])).min(1).optional(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  timezone: z.string().min(1).optional(),
});

export const updateReminderSettings: ToolDefinition<z.infer<typeof schema>> = {
  name: "update_reminder_settings",
  kind: "write",
  description:
    "Update the organization's reminder settings (reminder days, tone, auto-send, channels, quiet hours). Only the supplied fields change. Requires user approval before it executes.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {
      reminderDays: { type: "array", items: { type: "integer", minimum: 0, maximum: 90 }, minItems: 1, maxItems: 10 },
      emailTone: { type: "string", enum: ["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"] },
      autoSend: { type: "boolean" },
      enabledChannels: { type: "array", items: { type: "string", enum: ["EMAIL", "WHATSAPP"] }, minItems: 1 },
      quietHoursStart: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "HH:mm" },
      quietHoursEnd: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "HH:mm" },
      timezone: { type: "string" },
    },
    additionalProperties: false,
  },
  summarize: (i) => {
    const fields = Object.keys(i);
    return `Update reminder settings (${fields.join(", ") || "no fields"})`;
  },
  async execute(ctx, input) {
    const current = await reminderService.getSettings(ctx.organizationId);
    const merged = {
      reminderDays: input.reminderDays ?? current.reminderDays,
      emailTone: input.emailTone ?? current.emailTone,
      autoSend: input.autoSend ?? current.autoSend,
      whatsappEnabled: (input.enabledChannels ?? current.enabledChannels).includes("WHATSAPP"),
      enabledChannels: input.enabledChannels ?? current.enabledChannels,
      quietHoursStart: input.quietHoursStart !== undefined ? input.quietHoursStart : current.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd !== undefined ? input.quietHoursEnd : current.quietHoursEnd,
      timezone: input.timezone ?? current.timezone,
      escalationTones: current.escalationTones,
      upiId: current.upiId,
      paymentLink: current.paymentLink,
    };
    const result = await withAudit(
      { type: "ASSISTANT", id: ctx.userId },
      "update_reminder_settings",
      { organizationId: ctx.organizationId, entityType: "ReminderSettings" },
      () => reminderService.updateSettings(ctx.organizationId, merged),
    );
    return { ok: true, data: result };
  },
};
