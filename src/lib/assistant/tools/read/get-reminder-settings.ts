import { z } from "zod";
import { reminderService } from "@/server/services/reminder.service";
import type { ToolDefinition } from "@/lib/assistant/tools/types";

const schema = z.object({});

export const getReminderSettings: ToolDefinition<z.infer<typeof schema>> = {
  name: "get_reminder_settings",
  kind: "read",
  description:
    "Get the organization's reminder settings: reminder days, tone escalation, auto-send, enabled channels, quiet hours, payment details.",
  inputSchema: schema,
  jsonSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  summarize: () => "Get reminder settings",
  async execute(ctx) {
    const settings = await reminderService.getSettings(ctx.organizationId);
    return { ok: true, data: settings };
  },
};
