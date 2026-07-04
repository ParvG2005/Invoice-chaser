import { inngest } from "@/lib/jobs/inngest/client";
import { JOB_EVENTS } from "@/lib/jobs/types";
import { reminderService } from "@/server/services/reminder.service";
import { tallyImportService } from "@/server/services/import/tally-import.service";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";
import { prisma } from "@/lib/db/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("inngest-workflows");

const ORG_PAGE_SIZE = 500;

export const reminderScanWorkflow = inngest.createFunction(
  { id: "reminder-scan", name: "Daily Reminder Scan", triggers: { cron: "0 9 * * *" } },
  async ({ step }) => {
    // Fan out: page through organizations and emit one overdue-check event per org.
    // Each org is then processed in its own (parallel, retried) function run, so a
    // large tenant count can't blow the single-function timeout or Inngest's
    // per-run step limit.
    let cursor: string | undefined;
    let dispatched = 0;

    for (let page = 0; ; page += 1) {
      const orgs: { id: string }[] = await step.run(`fetch-organizations-${page}`, () =>
        prisma.organization.findMany({
          where: { deletedAt: null },
          select: { id: true },
          orderBy: { id: "asc" },
          take: ORG_PAGE_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      );

      if (orgs.length === 0) break;

      await step.run(`dispatch-${page}`, () =>
        getJobScheduler().enqueueOverdueChecks(orgs.map((o) => o.id)),
      );

      dispatched += orgs.length;
      cursor = orgs[orgs.length - 1].id;
      if (orgs.length < ORG_PAGE_SIZE) break;
    }

    log.info("Reminder scan dispatched", { organizations: dispatched });
    return { dispatched };
  },
);

export const sendReminderWorkflow = inngest.createFunction(
  { id: "send-reminder", name: "Send Reminder Email", triggers: { event: JOB_EVENTS.SEND_REMINDER } },
  async ({ event, step }) => {
    const reminderId = event.data.reminderId as string;
    return step.run("send-email", () => reminderService.sendReminder(reminderId));
  },
);

export const overdueCheckWorkflow = inngest.createFunction(
  { id: "overdue-check", name: "Overdue Invoice Check", triggers: { event: JOB_EVENTS.OVERDUE_CHECK } },
  async ({ event, step }) => {
    const organizationId = event.data.organizationId as string;
    await step.run("mark-overdue", () =>
      reminderService.scheduleRemindersForOrganization(organizationId),
    );
    return { organizationId };
  },
);

export const tallyImportWorkflow = inngest.createFunction(
  // Idempotent by GUID+ALTERID, so a retry after a mid-batch crash safely
  // re-skips already-imported records. Progress is visible via batch counters.
  { id: "tally-import-run", name: "Tally Import Batch", retries: 2, triggers: { event: JOB_EVENTS.TALLY_IMPORT_RUN } },
  async ({ event, step }) => {
    const { organizationId, batchId } = event.data as { organizationId: string; batchId: string };
    return step.run("run-batch", () => tallyImportService.runBatch(organizationId, batchId));
  },
);

export const inngestFunctions = [
  reminderScanWorkflow,
  sendReminderWorkflow,
  overdueCheckWorkflow,
  tallyImportWorkflow,
];
