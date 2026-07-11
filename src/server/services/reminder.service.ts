import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { NotFoundError } from "@/lib/api/errors";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";
import { createLogger } from "@/lib/logger";
import type { ReminderSettingsInput } from "@/lib/validations/reminder";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { reminderRepository } from "@/server/repositories/reminder.repository";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { aiEmailService } from "@/server/services/ai-email.service";
import { communicationService } from "@/server/services/communication.service";
import { toneForOffset } from "@/lib/channels/escalation";
import { nextAllowedSendTime } from "@/lib/channels/quiet-hours";
import type { Channel } from "@/lib/channels/channel-provider";
import type { ReminderSettingsDto } from "@/types";

const log = createLogger("reminder-service");

/**
 * Shared batching logic for `scheduleRemindersForOrganization` and
 * `scheduleRemindersForInvoices`: given an already-scoped list of overdue
 * invoices, work out which (invoice, dayOffset) reminders are still missing
 * and create + enqueue them.
 */
async function scheduleForOverdueInvoices(
  organizationId: string,
  settings: NonNullable<Awaited<ReturnType<typeof reminderRepository.getSettings>>>,
  overdue: Awaited<ReturnType<typeof invoiceRepository.findOverdue>>,
) {
  if (overdue.length === 0) return { scheduled: 0 };

  // One query for every (invoice, dayOffset) already in flight, instead of a
  // per-invoice existence check inside the loop (was O(invoices × offsets) queries).
  const existing = await reminderRepository.findExistingOffsets(overdue.map((i) => i.id));
  const seen = new Set(existing.map((e) => `${e.invoiceId}:${e.dayOffset}`));

  const today = startOfDay(new Date());
  const toCreate: Array<{
    id: string;
    organizationId: string;
    invoiceId: string;
    scheduledFor: Date;
    tone: typeof settings.emailTone;
    dayOffset: number;
    status: "SCHEDULED";
  }> = [];

  for (const invoice of overdue) {
    if (invoice.status === "PAID") continue;

    const daysPastDue = differenceInCalendarDays(today, startOfDay(invoice.dueDate));

    for (const dayOffset of settings.reminderDays) {
      if (daysPastDue < dayOffset) continue;

      const key = `${invoice.id}:${dayOffset}`;
      if (seen.has(key)) continue;
      seen.add(key); // dedupe duplicate offsets within reminderDays too

      toCreate.push({
        id: crypto.randomUUID(),
        organizationId,
        invoiceId: invoice.id,
        scheduledFor: new Date(),
        tone: toneForOffset(settings.reminderDays, settings.escalationTones ?? [], dayOffset),
        dayOffset,
        status: "SCHEDULED",
      });
    }
  }

  if (toCreate.length === 0) {
    return { scheduled: 0 };
  }

  // Batch insert, then a single batched enqueue.
  await reminderRepository.createManyScheduled(toCreate);
  await getJobScheduler().enqueueReminders(toCreate.map((r) => r.id));

  log.info("Scheduled reminders", { organizationId, scheduled: toCreate.length });
  return { scheduled: toCreate.length };
}

export const reminderService = {
  async getSettings(organizationId: string): Promise<ReminderSettingsDto> {
    const settings = await reminderRepository.getSettings(organizationId);
    const enabledChannels = settings?.enabledChannels?.length ? settings.enabledChannels : ["EMAIL" as const];
    return {
      reminderDays: settings?.reminderDays ?? [3, 7, 14],
      emailTone: settings?.emailTone ?? "PROFESSIONAL",
      autoSend: settings?.autoSend ?? true,
      whatsappEnabled: enabledChannels.includes("WHATSAPP"),
      enabledChannels,
      quietHoursStart: settings?.quietHoursStart ?? null,
      quietHoursEnd: settings?.quietHoursEnd ?? null,
      timezone: settings?.timezone ?? "Asia/Kolkata",
      escalationTones: settings?.escalationTones?.length
        ? settings.escalationTones
        : ["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"],
      upiId: settings?.upiId ?? null,
      paymentLink: settings?.paymentLink ?? null,
      sequence: (settings?.sequence as ReminderSettingsDto["sequence"]) ?? undefined,
      quietHours: (settings?.quietHours as ReminderSettingsDto["quietHours"]) ?? null,
    };
  },

  async updateSettings(organizationId: string, input: ReminderSettingsInput): Promise<ReminderSettingsDto> {
    await reminderRepository.upsertSettings(organizationId, input);
    return this.getSettings(organizationId);
  },

  async getUpcoming(organizationId: string) {
    const reminders = await reminderRepository.findUpcoming(organizationId);
    return reminders
      .filter((r) => r.invoice)
      .map((r) => ({
        id: r.id,
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoice!.invoiceNumber,
        partyName: r.invoice!.party?.name ?? r.invoice!.clientName,
        channel: "EMAIL" as const,
        scheduledFor: r.scheduledFor.toISOString(),
        amount: Number(r.invoice!.totalAmount ?? r.invoice!.amount),
        currency: r.invoice!.currency,
      }));
  },

  async scheduleRemindersForOrganization(organizationId: string) {
    const settings = await reminderRepository.getSettings(organizationId);
    if (!settings?.autoSend) return { scheduled: 0 };

    await invoiceRepository.markOverdueBatch(organizationId);

    const overdue = await invoiceRepository.findOverdue(organizationId);
    return scheduleForOverdueInvoices(organizationId, settings, overdue);
  },

  /**
   * Same as `scheduleRemindersForOrganization`, but scoped to a caller-supplied
   * set of invoice ids (used by the per-invoice "Send reminder now" row action
   * and the bulk-actions "Send reminders" action). Every id is re-verified
   * against `organizationId` at the repository layer, so ids from other orgs
   * or that were tampered with client-side are simply excluded rather than
   * trusted, and invoices outside the given set are never touched.
   */
  async scheduleRemindersForInvoices(organizationId: string, invoiceIds: string[]) {
    if (invoiceIds.length === 0) return { scheduled: 0 };

    const settings = await reminderRepository.getSettings(organizationId);
    if (!settings?.autoSend) return { scheduled: 0 };

    await invoiceRepository.markOverdueByIds(organizationId, invoiceIds);

    const overdue = await invoiceRepository.findOverdueByIds(organizationId, invoiceIds);
    return scheduleForOverdueInvoices(organizationId, settings, overdue);
  },

  async processDueReminders() {
    const due = await reminderRepository.findDueReminders();
    let processed = 0;

    for (const reminder of due) {
      if (!reminder.invoice || reminder.invoice.status === "PAID") {
        await reminderRepository.updateStatus(reminder.id, "CANCELLED");
        continue;
      }

      const settings = await reminderRepository.getSettings(reminder.organizationId);
      if (!settings?.autoSend) continue;

      await getJobScheduler().enqueueReminder(reminder.id);
      processed += 1;
    }

    return { processed };
  },

  /** Returns an ISO timestamp to sleep until, or null if sending is allowed now. */
  async getQuietHoursDeferral(reminderId: string): Promise<string | null> {
    const reminder = await reminderRepository.findById(reminderId);
    if (!reminder) return null;
    const settings = await reminderRepository.getSettings(reminder.organizationId);
    const now = new Date();
    const allowedAt = nextAllowedSendTime(now, {
      quietHoursStart: settings?.quietHoursStart ?? null,
      quietHoursEnd: settings?.quietHoursEnd ?? null,
      timezone: settings?.timezone ?? "Asia/Kolkata",
    });
    return allowedAt.getTime() > now.getTime() ? allowedAt.toISOString() : null;
  },

  async sendReminder(reminderId: string) {
    const reminder = await reminderRepository.findById(reminderId);
    if (!reminder?.invoice) throw new NotFoundError("Reminder not found");

    if (reminder.invoice.status === "PAID") {
      await reminderRepository.updateStatus(reminder.id, "CANCELLED");
      return { skipped: true };
    }

    // At-least-once delivery means this job can run more than once for the same
    // reminder. Atomically claim it so only one invocation ever sends the email.
    const claimed = await reminderRepository.claimForSending(reminder.id);
    if (!claimed) {
      log.info("Reminder already claimed/sent, skipping duplicate", { reminderId });
      return { skipped: true };
    }

    // Once claimed, any failure must release the reminder back to FAILED so it
    // never gets stranded in SENDING.
    let emailContent: Awaited<ReturnType<typeof aiEmailService.generateReminderEmail>>;
    let settings: Awaited<ReturnType<typeof reminderRepository.getSettings>>;
    try {
      const org = await organizationRepository.findById(reminder.organizationId);
      if (!org) throw new NotFoundError("Organization not found");

      emailContent = await aiEmailService.generateReminderEmail(
        reminder.organizationId,
        reminder.invoice.id,
        reminder.tone,
        { reminderId: reminder.id },
      );
      settings = await reminderRepository.getSettings(reminder.organizationId);
    } catch (error) {
      await reminderRepository.updateStatus(reminder.id, "FAILED");
      throw error;
    }

    const party = reminder.invoice.party ?? null;
    const contact = {
      email: party?.email ?? reminder.invoice.clientEmail ?? null,
      phone: party?.whatsapp ?? party?.phone ?? reminder.invoice.clientPhone ?? null,
    };
    const enabledChannels: Channel[] = settings?.enabledChannels?.length
      ? settings.enabledChannels
      : ["EMAIL"];
    const resolvedChannels = communicationService.resolveChannels(
      { enabledChannels },
      party
        ? {
            preferredChannels: party.preferredChannels ?? [],
            emailOptOutAt: party.emailOptOutAt ?? null,
            whatsappOptOutAt: party.whatsappOptOutAt ?? null,
          }
        : null,
      contact,
    );
    // Email-only in Phase 4 (WhatsApp provider task dropped): resolvedChannels may still
    // include "WHATSAPP" if org/party settings allow it (schema unchanged), but only the
    // EMAIL branch is implemented below, so filter to EMAIL before sending.
    const channels = resolvedChannels.filter((c) => c === "EMAIL");

    if (channels.length === 0) {
      log.warn("No sendable channel for reminder", { reminderId });
      await reminderRepository.updateStatus(reminder.id, "FAILED");
      return { sent: false, channels: [] };
    }

    const actor = { type: "SYSTEM" as const, id: null };
    const sentChannels: Channel[] = [];
    let lastError: unknown = null;

    for (const channel of channels) {
      try {
        await communicationService.sendOutbound(reminder.organizationId, actor, {
          channel,
          to: contact.email!,
          subject: emailContent.subject,
          bodyHtml: emailContent.bodyHtml,
          bodyText: emailContent.bodyText,
          invoiceId: reminder.invoice.id,
          reminderId: reminder.id,
          partyId: party?.id,
        });
        sentChannels.push(channel);
      } catch (error) {
        lastError = error;
        log.error("Channel send failed", {
          reminderId,
          channel,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    if (sentChannels.length === 0) {
      await reminderRepository.updateStatus(reminder.id, "FAILED");
      throw lastError instanceof Error ? lastError : new Error("All channels failed");
    }

    await reminderRepository.updateStatus(reminder.id, "SENT", new Date());
    return { sent: true, channels: sentChannels };
  },

  /**
   * "Send now" queue action (Task 26 fix): immediately sends a specific
   * already-SCHEDULED reminder row, rather than re-running the scan that
   * schedules *new* reminders (which is a no-op for a row that's already
   * scheduled). Org-scoped so a foreign-org id 404s instead of being sent.
   */
  async sendReminderNow(organizationId: string, reminderId: string) {
    const reminder = await reminderRepository.findByIdForOrg(organizationId, reminderId);
    if (!reminder) throw new NotFoundError("Reminder not found");
    return this.sendReminder(reminderId);
  },

  async listForInvoice(organizationId: string, invoiceId: string) {
    const reminders = await reminderRepository.findForInvoice(organizationId, invoiceId);
    return reminders.map((r) => ({
      id: r.id,
      dayOffset: r.dayOffset,
      tone: r.tone,
      status: r.status,
      scheduledFor: r.scheduledFor.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
    }));
  },

  /** "Skip"/"unskip" a not-yet-sent reminder from the per-invoice schedule tab. */
  async setSkipped(organizationId: string, reminderId: string, skipped: boolean) {
    const ok = await reminderRepository.setSkipped(organizationId, reminderId, skipped);
    if (!ok) throw new NotFoundError("Reminder not found or already sent");
    return { skipped };
  },

  async previewNextReminderDate(invoiceDueDate: Date, reminderDays: number[]) {
    const sorted = [...reminderDays].sort((a, b) => a - b);
    const first = sorted[0] ?? 3;
    return addDays(invoiceDueDate, first);
  },
};
