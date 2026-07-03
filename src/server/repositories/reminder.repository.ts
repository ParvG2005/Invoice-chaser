import type { EmailTone, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ReminderSettingsInput } from "@/lib/validations/reminder";

export const reminderRepository = {
  getSettings(organizationId: string) {
    return prisma.reminderSettings.findUnique({ where: { organizationId } });
  },

  upsertSettings(organizationId: string, data: ReminderSettingsInput) {
    return prisma.reminderSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        reminderDays: data.reminderDays,
        emailTone: data.emailTone as EmailTone,
        autoSend: data.autoSend,
        whatsappEnabled: data.whatsappEnabled,
      },
      update: {
        reminderDays: data.reminderDays,
        emailTone: data.emailTone as EmailTone,
        autoSend: data.autoSend,
        whatsappEnabled: data.whatsappEnabled,
      },
    });
  },

  findById(id: string) {
    return prisma.reminder.findUnique({
      where: { id },
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
