import type { EmailTone, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ReminderSettingsInput } from "@/lib/validations/reminder";

export const reminderRepository = {
  getSettings(organizationId: string) {
    return prisma.reminderSettings.findUnique({ where: { organizationId } });
  },

  upsertSettings(organizationId: string, data: ReminderSettingsInput) {
    // `sequence`/`quietHours` are additive Json columns (Task 26): pass through
    // when present, otherwise leave untouched (upsert.create defaults to
    // Prisma's column default of NULL; update omits the key entirely).
    const sequence = data.sequence as Prisma.InputJsonValue | undefined;
    const quietHours = data.quietHours as Prisma.InputJsonValue | undefined;

    return prisma.reminderSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        reminderDays: data.reminderDays,
        emailTone: data.emailTone as EmailTone,
        autoSend: data.autoSend,
        whatsappEnabled: data.whatsappEnabled,
        ...(sequence !== undefined ? { sequence } : {}),
        ...(quietHours !== undefined ? { quietHours } : {}),
      },
      update: {
        reminderDays: data.reminderDays,
        emailTone: data.emailTone as EmailTone,
        autoSend: data.autoSend,
        whatsappEnabled: data.whatsappEnabled,
        ...(sequence !== undefined ? { sequence } : {}),
        ...(quietHours !== undefined ? { quietHours } : {}),
      },
    });
  },

  findById(id: string) {
    return prisma.reminder.findUnique({
      where: { id },
      include: { invoice: true },
    });
  },

  /**
   * Org-scoped lookup for the "Send now" queue action (Task 26 fix) — a
   * tampered/foreign-org id resolves to null rather than another org's row.
   */
  findByIdForOrg(organizationId: string, id: string) {
    return prisma.reminder.findFirst({
      where: { id, organizationId },
      include: { invoice: true },
    });
  },

  findDueReminders(asOf = new Date()) {
    return prisma.reminder.findMany({
      where: {
        status: "SCHEDULED",
        scheduledFor: { lte: asOf },
      },
      include: {
        invoice: { include: { organization: true } },
      },
    });
  },

  create(data: Prisma.ReminderCreateInput) {
    return prisma.reminder.create({ data });
  },

  createManyScheduled(data: Prisma.ReminderCreateManyInput[]) {
    return prisma.reminder.createMany({ data, skipDuplicates: true });
  },

  updateStatus(id: string, status: Prisma.ReminderUpdateInput["status"], sentAt?: Date) {
    return prisma.reminder.update({
      where: { id },
      data: { status, ...(sentAt ? { sentAt } : {}) },
    });
  },

  /**
   * Atomically transition SCHEDULED -> SENDING. Returns true only for the caller
   * that won the claim, guaranteeing exactly-once sending even when the job queue
   * delivers the same event more than once (at-least-once delivery).
   */
  async claimForSending(id: string): Promise<boolean> {
    const { count } = await prisma.reminder.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "SENDING" },
    });
    return count === 1;
  },

  countSent(organizationId: string) {
    return prisma.reminder.count({
      where: { organizationId, status: "SENT" },
    });
  },

  hasScheduledForInvoice(invoiceId: string, dayOffset: number) {
    return prisma.reminder.findFirst({
      where: { invoiceId, dayOffset, status: { in: ["SCHEDULED", "SENDING", "SENT"] } },
    });
  },

  /**
   * Read view over SCHEDULED reminders for the "Upcoming Reminders" queue
   * (Task 26) — org-scoped, joined to invoice + party. Not a new scheduling
   * concept, just a projection of existing `Reminder` rows.
   */
  findUpcoming(organizationId: string, limit = 50) {
    return prisma.reminder.findMany({
      where: { organizationId, status: "SCHEDULED" },
      include: { invoice: { include: { party: true } } },
      orderBy: { scheduledFor: "asc" },
      take: limit,
    });
  },

  /** Per-invoice schedule, for the invoice-detail "Reminders" tab (Task 26). */
  findForInvoice(organizationId: string, invoiceId: string) {
    return prisma.reminder.findMany({
      where: { organizationId, invoiceId },
      orderBy: { dayOffset: "asc" },
    });
  },

  /**
   * Toggle a reminder between SCHEDULED and CANCELLED ("skip" / "unskip" in the
   * per-invoice schedule tab). Scoped by organizationId so a tampered id from
   * another org is silently excluded. Refuses to touch a reminder that's
   * already SENDING/SENT/FAILED — only pending (SCHEDULED/CANCELLED) rows.
   */
  async setSkipped(organizationId: string, reminderId: string, skipped: boolean): Promise<boolean> {
    const { count } = await prisma.reminder.updateMany({
      where: {
        id: reminderId,
        organizationId,
        status: { in: ["SCHEDULED", "CANCELLED"] },
      },
      data: { status: skipped ? "CANCELLED" : "SCHEDULED" },
    });
    return count === 1;
  },

  /**
   * One query returning the (dayOffset) pairs already scheduled/sent for a set of
   * invoices, so the scheduler can avoid an N+1 existence check per invoice.
   */
  findExistingOffsets(invoiceIds: string[]) {
    return prisma.reminder.findMany({
      where: {
        invoiceId: { in: invoiceIds },
        status: { in: ["SCHEDULED", "SENDING", "SENT"] },
      },
      select: { invoiceId: true, dayOffset: true },
    });
  },
};
