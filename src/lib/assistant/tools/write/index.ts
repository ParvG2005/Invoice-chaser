import type { ToolDefinition } from "@/lib/assistant/tools/types";
import { recordPayment } from "./record-payment";
import { createInvoice } from "./create-invoice";
import { updateInvoice } from "./update-invoice";
import { markInvoicePaid } from "./mark-invoice-paid";
import { writeOffInvoice } from "./write-off-invoice";
import { createParty } from "./create-party";
import { updateParty } from "./update-party";
import { createBill } from "./create-bill";
import { sendReminder } from "./send-reminder";
import { snoozeReminder } from "./snooze-reminder";
import { updateReminderSettings } from "./update-reminder-settings";
import { adjustStock } from "./adjust-stock";

// Note: every write tool's `execute` performs the real mutation (wrapped in
// `withAudit` with actor `{ type: "ASSISTANT", id: ctx.userId }`), but per the
// plan's Global Constraints, `execute` is only ever invoked by
// `assistantService.approveAction` (Task 5) after explicit user approval —
// never by the model's tool-use loop directly. That gate lives in Task 5.
export const WRITE_TOOLS: ToolDefinition[] = [
  recordPayment,
  createInvoice,
  updateInvoice,
  markInvoicePaid,
  writeOffInvoice,
  createParty,
  updateParty,
  createBill,
  sendReminder,
  snoozeReminder,
  updateReminderSettings,
  adjustStock,
];
