import { inngest } from "@/lib/jobs/inngest/client";
import { JOB_EVENTS } from "@/lib/jobs/types";
import type { JobScheduler } from "@/lib/jobs/types";

/**
 * Inngest-backed scheduler. Swap implementation for BullMQ/Temporal later
 * without changing service-layer call sites.
 */
export class InngestJobScheduler implements JobScheduler {
  async scheduleReminderScan(): Promise<void> {
    await inngest.send({ name: JOB_EVENTS.REMINDER_SCAN, data: {} });
  }

  async enqueueReminder(reminderId: string): Promise<void> {
    await inngest.send({
      name: JOB_EVENTS.SEND_REMINDER,
      data: { reminderId },
    });
  }

  async enqueueReminders(reminderIds: string[]): Promise<void> {
    if (reminderIds.length === 0) return;
    // Single batched send instead of one network round-trip per reminder.
    await inngest.send(
      reminderIds.map((reminderId) => ({
        name: JOB_EVENTS.SEND_REMINDER,
        data: { reminderId },
      })),
    );
  }

  async enqueueOverdueCheck(organizationId: string): Promise<void> {
    await inngest.send({
      name: JOB_EVENTS.OVERDUE_CHECK,
      data: { organizationId },
    });
  }

  async enqueueOverdueChecks(organizationIds: string[]): Promise<void> {
    if (organizationIds.length === 0) return;
    await inngest.send(
      organizationIds.map((organizationId) => ({
        name: JOB_EVENTS.OVERDUE_CHECK,
        data: { organizationId },
      })),
    );
  }

  async enqueueTallyImport(organizationId: string, batchId: string): Promise<void> {
    await inngest.send({
      name: JOB_EVENTS.TALLY_IMPORT_RUN,
      data: { organizationId, batchId },
    });
  }

  async enqueueInvoicePaid(organizationId: string, invoiceId: string): Promise<void> {
    await inngest.send({
      name: JOB_EVENTS.INVOICE_PAID,
      data: { organizationId, invoiceId },
    });
  }
}

let scheduler: JobScheduler | null = null;

export function getJobScheduler(): JobScheduler {
  if (!scheduler) {
    scheduler = new InngestJobScheduler();
  }
  return scheduler;
}
