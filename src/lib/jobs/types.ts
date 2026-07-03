export interface JobScheduler {
  scheduleReminderScan(): Promise<void>;
  enqueueReminder(reminderId: string): Promise<void>;
  enqueueReminders(reminderIds: string[]): Promise<void>;
  enqueueOverdueCheck(organizationId: string): Promise<void>;
  enqueueOverdueChecks(organizationIds: string[]): Promise<void>;
}

export const JOB_EVENTS = {
  REMINDER_SCAN: "invoicepilot/reminder.scan",
  SEND_REMINDER: "invoicepilot/reminder.send",
  OVERDUE_CHECK: "invoicepilot/invoice.overdue-check",
} as const;
