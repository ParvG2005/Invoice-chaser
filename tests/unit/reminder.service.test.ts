import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reminderService } from "@/server/services/reminder.service";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { reminderRepository } from "@/server/repositories/reminder.repository";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";

vi.mock("@/server/repositories/invoice.repository", () => ({
  invoiceRepository: {
    findOverdue: vi.fn(),
    findOverdueByIds: vi.fn(),
    markOverdueBatch: vi.fn(),
    markOverdueByIds: vi.fn(),
  },
}));

vi.mock("@/server/repositories/reminder.repository", () => ({
  reminderRepository: {
    getSettings: vi.fn(),
    findExistingOffsets: vi.fn(),
    createManyScheduled: vi.fn(),
    findUpcoming: vi.fn(),
    findForInvoice: vi.fn(),
    setSkipped: vi.fn(),
    findByIdForOrg: vi.fn(),
  },
}));

vi.mock("@/lib/jobs/inngest/scheduler", () => ({
  getJobScheduler: vi.fn(),
}));

const ORG = "org-1";

function fakeSettings(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    reminderDays: [3, 7, 14],
    emailTone: "PROFESSIONAL",
    autoSend: true,
    whatsappEnabled: false,
    ...overrides,
  };
}

function fakeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    organizationId: ORG,
    status: "OVERDUE",
    dueDate: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("reminderService.scheduleRemindersForInvoices", () => {
  const enqueueReminders = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-03T00:00:00.000Z") });
    vi.mocked(getJobScheduler).mockReturnValue({
      enqueueReminders,
      enqueueReminder: vi.fn(),
    } as never);
    vi.mocked(reminderRepository.getSettings).mockResolvedValue(fakeSettings() as never);
    vi.mocked(reminderRepository.findExistingOffsets).mockResolvedValue([] as never);
    vi.mocked(invoiceRepository.markOverdueByIds).mockResolvedValue({ count: 0 } as never);
  });
  afterEach(() => vi.useRealTimers());

  it("returns immediately without querying anything for an empty id list", async () => {
    const result = await reminderService.scheduleRemindersForInvoices(ORG, []);
    expect(result).toEqual({ scheduled: 0 });
    expect(reminderRepository.getSettings).not.toHaveBeenCalled();
    expect(invoiceRepository.findOverdueByIds).not.toHaveBeenCalled();
  });

  it("respects the autoSend=false gate", async () => {
    vi.mocked(reminderRepository.getSettings).mockResolvedValue(
      fakeSettings({ autoSend: false }) as never,
    );

    const result = await reminderService.scheduleRemindersForInvoices(ORG, ["inv-1"]);

    expect(result).toEqual({ scheduled: 0 });
    expect(invoiceRepository.findOverdueByIds).not.toHaveBeenCalled();
  });

  it("scopes the scan to only the given invoice ids, not every overdue invoice in the org", async () => {
    vi.mocked(invoiceRepository.findOverdueByIds).mockResolvedValue([
      fakeInvoice({ id: "inv-1", dueDate: new Date("2026-06-01T00:00:00.000Z") }),
    ] as never);

    const result = await reminderService.scheduleRemindersForInvoices(ORG, ["inv-1"]);

    // The scoped lookup was called with exactly the requested ids — verifying
    // org ownership happens inside findOverdueByIds's WHERE clause, so an id
    // for another org (or a non-overdue invoice) is simply excluded there.
    expect(invoiceRepository.markOverdueByIds).toHaveBeenCalledWith(ORG, ["inv-1"]);
    expect(invoiceRepository.findOverdueByIds).toHaveBeenCalledWith(ORG, ["inv-1"]);
    expect(invoiceRepository.findOverdue).not.toHaveBeenCalled();
    expect(result.scheduled).toBeGreaterThan(0);
  });

  it("does not touch invoices outside the requested id set", async () => {
    // Simulate the repository correctly filtering to only the requested,
    // org-owned, overdue invoice — "inv-2" (another overdue invoice in the
    // same org) must never appear here even though scheduleRemindersForOrganization
    // would have picked it up.
    vi.mocked(invoiceRepository.findOverdueByIds).mockImplementation(((
      _org: string,
      ids: string[],
    ) =>
      Promise.resolve(
        ids.includes("inv-1") ? [fakeInvoice({ id: "inv-1" })] : [],
      )) as never);

    await reminderService.scheduleRemindersForInvoices(ORG, ["inv-1"]);

    const created = vi.mocked(reminderRepository.createManyScheduled).mock.calls[0][0] as Array<{
      invoiceId: string;
    }>;
    expect(created.every((r) => r.invoiceId === "inv-1")).toBe(true);
    expect(created.length).toBeGreaterThan(0);
  });
});

describe("reminderService.getUpcoming", () => {
  it("is org-scoped: only queries the given org, and maps rows to the queue DTO shape", async () => {
    vi.mocked(reminderRepository.findUpcoming).mockResolvedValue([
      {
        id: "rem-1",
        invoiceId: "inv-1",
        scheduledFor: new Date("2026-07-10T00:00:00.000Z"),
        invoice: {
          invoiceNumber: "INV-001",
          clientName: "Acme",
          party: { name: "Acme Co" },
          totalAmount: 1000,
          amount: 1000,
          currency: "INR",
        },
      },
    ] as never);

    const result = await reminderService.getUpcoming(ORG);

    expect(reminderRepository.findUpcoming).toHaveBeenCalledWith(ORG);
    expect(result).toEqual([
      {
        id: "rem-1",
        invoiceId: "inv-1",
        invoiceNumber: "INV-001",
        partyName: "Acme Co",
        channel: "EMAIL",
        scheduledFor: "2026-07-10T00:00:00.000Z",
        amount: 1000,
        currency: "INR",
      },
    ]);
  });

  it("filters out rows whose invoice relation is missing (e.g. deleted invoice)", async () => {
    vi.mocked(reminderRepository.findUpcoming).mockResolvedValue([
      { id: "rem-1", invoiceId: "inv-1", invoice: null },
    ] as never);

    const result = await reminderService.getUpcoming(ORG);
    expect(result).toEqual([]);
  });
});

describe("reminderService.listForInvoice", () => {
  it("passes organizationId and invoiceId through to the repository (org-scoped)", async () => {
    vi.mocked(reminderRepository.findForInvoice).mockResolvedValue([
      {
        id: "rem-1",
        dayOffset: 3,
        tone: "PROFESSIONAL",
        status: "SCHEDULED",
        scheduledFor: new Date("2026-07-10T00:00:00.000Z"),
        sentAt: null,
      },
    ] as never);

    const result = await reminderService.listForInvoice(ORG, "inv-1");

    expect(reminderRepository.findForInvoice).toHaveBeenCalledWith(ORG, "inv-1");
    expect(result).toEqual([
      {
        id: "rem-1",
        dayOffset: 3,
        tone: "PROFESSIONAL",
        status: "SCHEDULED",
        scheduledFor: "2026-07-10T00:00:00.000Z",
        sentAt: null,
      },
    ]);
  });
});

describe("reminderService.setSkipped", () => {
  it("refuses to touch a reminder that isn't SCHEDULED/CANCELLED (repository returns false)", async () => {
    vi.mocked(reminderRepository.setSkipped).mockResolvedValue(false);

    await expect(reminderService.setSkipped(ORG, "rem-1", true)).rejects.toThrow(
      "Reminder not found or already sent",
    );
    expect(reminderRepository.setSkipped).toHaveBeenCalledWith(ORG, "rem-1", true);
  });

  it("returns the new skipped state when the repository confirms the update", async () => {
    vi.mocked(reminderRepository.setSkipped).mockResolvedValue(true);

    const result = await reminderService.setSkipped(ORG, "rem-1", true);
    expect(result).toEqual({ skipped: true });
  });
});

describe("reminderService.sendReminderNow", () => {
  it("404s for a reminder id that doesn't belong to the org (org-scoped lookup)", async () => {
    vi.mocked(reminderRepository.findByIdForOrg).mockResolvedValue(null);

    await expect(reminderService.sendReminderNow(ORG, "rem-1")).rejects.toThrow(
      "Reminder not found",
    );
    expect(reminderRepository.findByIdForOrg).toHaveBeenCalledWith(ORG, "rem-1");
  });

  it("delegates to sendReminder once the reminder is verified to belong to the org", async () => {
    vi.mocked(reminderRepository.findByIdForOrg).mockResolvedValue({
      id: "rem-1",
      organizationId: ORG,
      invoice: { id: "inv-1" },
    } as never);
    const sendReminderSpy = vi
      .spyOn(reminderService, "sendReminder")
      .mockResolvedValue({ sent: true, channels: ["EMAIL"] });

    const result = await reminderService.sendReminderNow(ORG, "rem-1");

    expect(sendReminderSpy).toHaveBeenCalledWith("rem-1");
    expect(result).toEqual({ sent: true, channels: ["EMAIL"] });
  });
});
