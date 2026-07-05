export interface JobScheduler {
  scheduleReminderScan(): Promise<void>;
  enqueueReminder(reminderId: string): Promise<void>;
  enqueueReminders(reminderIds: string[]): Promise<void>;
  enqueueOverdueCheck(organizationId: string): Promise<void>;
  enqueueOverdueChecks(organizationIds: string[]): Promise<void>;
  enqueueTallyImport(organizationId: string, batchId: string): Promise<void>;
  enqueueInvoicePaid(organizationId: string, invoiceId: string): Promise<void>;
  enqueueLowStockChecks(organizationIds: string[]): Promise<void>;
}

export const JOB_EVENTS = {
  REMINDER_SCAN: "invoicepilot/reminder.scan",
  SEND_REMINDER: "invoicepilot/reminder.send",
  OVERDUE_CHECK: "invoicepilot/invoice.overdue-check",
  TALLY_IMPORT_RUN: "invoicepilot/import.tally.run",
  INVOICE_PAID: "invoicepilot/invoice.paid",
  LOW_STOCK_SCAN: "invoicepilot/stock.low-stock-scan",
  LOW_STOCK_CHECK: "invoicepilot/stock.low-stock-check",
} as const;
