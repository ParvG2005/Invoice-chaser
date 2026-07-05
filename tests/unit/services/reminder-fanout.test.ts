import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/server/repositories/reminder.repository", () => ({
  reminderRepository: {
    findById: vi.fn(),
    getSettings: vi.fn(),
    updateStatus: vi.fn(),
    claimForSending: vi.fn(),
    findExistingOffsets: vi.fn(),
    createManyScheduled: vi.fn(),
    findDueReminders: vi.fn(),
    upsertSettings: vi.fn(),
  },
}));
vi.mock("@/server/repositories/invoice.repository", () => ({
  invoiceRepository: { markOverdueBatch: vi.fn(), findOverdue: vi.fn(), findById: vi.fn(), findByInvoiceNumbers: vi.fn() },
}));
vi.mock("@/server/repositories/organization.repository", () => ({
  organizationRepository: { findById: vi.fn().mockResolvedValue({ id: "org-1", name: "My Org" }) },
}));
vi.mock("@/server/services/ai-email.service", () => ({
  aiEmailService: {
    generateReminderEmail: vi.fn().mockResolvedValue({
      subject: "Reminder INV-1",
      bodyHtml: "<p>pay up</p>",
      bodyText: "pay up",
      whatsappText: "pay up",
    }),
  },
}));
vi.mock("@/server/services/communication.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/communication.service")>();
  return {
    communicationService: {
      ...actual.communicationService,
      sendOutbound: vi.fn().mockResolvedValue({ id: "log-1", status: "SENT", providerId: "p1" }),
    },
  };
});
vi.mock("@/lib/jobs/inngest/scheduler", () => ({
  getJobScheduler: () => ({ enqueueReminders: vi.fn(), enqueueReminder: vi.fn() }),
}));

import { reminderService } from "@/server/services/reminder.service";
import { reminderRepository } from "@/server/repositories/reminder.repository";
import { communicationService } from "@/server/services/communication.service";

const repo = vi.mocked(reminderRepository);
const comms = vi.mocked(communicationService);

const baseReminder = {
  id: "rem-1",
  organizationId: "org-1",
  dayOffset: 3,
  tone: "FRIENDLY",
  invoice: {
    id: "inv-1",
    invoiceNumber: "INV-1",
    status: "OVERDUE",
    amount: 18500,
    dueDate: new Date("2026-06-28"),
    clientName: "Acme",
    clientEmail: "acme@example.com",
    clientPhone: "+919876543210",
    party: null,
  },
};

// Email-only in Phase 4 (WhatsApp provider task dropped, see communication.service.ts's
// sendPaidThankYou for the same pattern): enabledChannels may still list WHATSAPP since the
// schema is unchanged, but sendReminder only ever sends EMAIL.
const settings = {
  reminderDays: [3, 7, 14],
  emailTone: "PROFESSIONAL",
  autoSend: true,
  whatsappEnabled: true,
  enabledChannels: ["EMAIL"],
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: "Asia/Kolkata",
  escalationTones: ["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"],
  upiId: null,
  paymentLink: null,
};

describe("reminderService.sendReminder fan-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(baseReminder as never);
    repo.getSettings.mockResolvedValue(settings as never);
    repo.claimForSending.mockResolvedValue(true as never);
    repo.updateStatus.mockResolvedValue({} as never);
  });

  it("sends on the EMAIL channel and marks the reminder SENT", async () => {
    const result = await reminderService.sendReminder("rem-1");
    expect(result).toEqual({ sent: true, channels: ["EMAIL"] });

    expect(comms.sendOutbound).toHaveBeenCalledTimes(1);
    const [, , input] = comms.sendOutbound.mock.calls[0];
    expect(input.channel).toBe("EMAIL");
    expect(repo.updateStatus).toHaveBeenCalledWith("rem-1", "SENT", expect.any(Date));
  });

  it("fails when the only channel fails, and succeeds on retry", async () => {
    comms.sendOutbound.mockRejectedValueOnce(new Error("email down"));
    await expect(reminderService.sendReminder("rem-1")).rejects.toThrow();
    expect(repo.updateStatus).toHaveBeenLastCalledWith("rem-1", "FAILED");

    comms.sendOutbound.mockReset();
    comms.sendOutbound.mockResolvedValue({ id: "log-2", status: "SENT", providerId: "p2" });
    await expect(reminderService.sendReminder("rem-1")).resolves.toEqual({
      sent: true,
      channels: ["EMAIL"],
    });
  });

  it("cancels when the invoice is already paid", async () => {
    repo.findById.mockResolvedValue({
      ...baseReminder,
      invoice: { ...baseReminder.invoice, status: "PAID" },
    } as never);
    await expect(reminderService.sendReminder("rem-1")).resolves.toEqual({ skipped: true });
    expect(repo.updateStatus).toHaveBeenCalledWith("rem-1", "CANCELLED");
  });
});

describe("reminderService.getQuietHoursDeferral", () => {
  it("returns null when no quiet hours configured", async () => {
    repo.findById.mockResolvedValue(baseReminder as never);
    repo.getSettings.mockResolvedValue(settings as never);
    await expect(reminderService.getQuietHoursDeferral("rem-1")).resolves.toBeNull();
  });
});
