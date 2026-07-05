import { describe, it, expect, vi, beforeEach } from "vitest";
import { WRITE_TOOLS } from "@/lib/assistant/tools/write";
import { renderActionDiff } from "@/lib/assistant/diff";
import type { ToolContext } from "@/lib/assistant/tools/types";

const ctx: ToolContext = { organizationId: "org1", userId: "u1", role: "member" };

// record_payment resolves the invoice's partyId first (paymentService.create
// is party-scoped — there is no single-invoice "record payment" entry point
// on the real service), then allocates the payment against that invoice.
vi.mock("@/server/services/invoice.service", () => ({
  invoiceService: {
    get: vi.fn(async () => ({ id: "inv1", partyId: "party1" })),
    create: vi.fn(async (_org: string, input: unknown) => ({ id: "inv2", ...(input as object) })),
    update: vi.fn(async () => ({ id: "inv1", status: "PAID" })),
    writeOff: vi.fn(async () => ({ id: "inv1", status: "WRITTEN_OFF" })),
    snooze: vi.fn(async () => ({ id: "inv1" })),
  },
}));
vi.mock("@/server/services/payment.service", () => ({
  paymentService: { create: vi.fn(async () => ({ id: "pay1" })) },
}));
vi.mock("@/server/services/party.service", () => ({
  partyService: {
    create: vi.fn(async () => ({ id: "party1" })),
    update: vi.fn(async () => ({ id: "party1" })),
  },
}));
vi.mock("@/server/services/bill.service", () => ({
  billService: { create: vi.fn(async () => ({ id: "bill1" })) },
}));
vi.mock("@/server/services/reminder.service", () => ({
  reminderService: {
    scheduleRemindersForInvoices: vi.fn(async () => ({ scheduled: 1 })),
    getSettings: vi.fn(async () => ({
      reminderDays: [3, 7, 14],
      emailTone: "PROFESSIONAL",
      autoSend: true,
      enabledChannels: ["EMAIL"],
      quietHoursStart: null,
      quietHoursEnd: null,
      timezone: "Asia/Kolkata",
      escalationTones: ["FRIENDLY", "PROFESSIONAL", "FIRM", "FINAL_NOTICE"],
      upiId: null,
      paymentLink: null,
    })),
    updateSettings: vi.fn(async (_org: string, input: unknown) => input),
  },
}));
vi.mock("@/server/services/stock.service", () => ({
  stockService: { adjust: vi.fn(async () => ({ id: "mv1" })) },
}));
vi.mock("@/server/services/audit.service", () => ({
  withAudit: vi.fn(async (_actor, _action, _entity, fn) => fn()),
}));

function tool(name: string) {
  const t = WRITE_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`missing ${name}`);
  return t;
}

describe("write tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers 12 write tools, all kind=write", () => {
    expect(WRITE_TOOLS).toHaveLength(12);
    expect(WRITE_TOOLS.every((t) => t.kind === "write")).toBe(true);
  });

  it("no write tool schema exposes organizationId", () => {
    for (const t of WRITE_TOOLS) {
      const props = (t.jsonSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("organizationId");
      expect((t.jsonSchema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    }
  });

  it("record_payment summarize produces a human-readable diff", () => {
    const t = tool("record_payment");
    const input = t.inputSchema.parse({ invoiceId: "inv1", amount: 18500, mode: "UPI" });
    expect(t.summarize(input)).toMatch(/18[,.]?500/);
  });

  it("record_payment.execute goes through withAudit with ASSISTANT actor", async () => {
    const { withAudit } = await import("@/server/services/audit.service");
    const { paymentService } = await import("@/server/services/payment.service");
    const t = tool("record_payment");
    const input = t.inputSchema.parse({ invoiceId: "inv1", amount: 18500, mode: "UPI" });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(withAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ASSISTANT", id: "u1" }),
      "record_payment",
      expect.anything(),
      expect.any(Function),
    );
    expect(paymentService.create).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ amount: 18500 }),
      expect.anything(),
    );
  });

  it("create_invoice.execute calls invoiceService.create via withAudit", async () => {
    const { invoiceService } = await import("@/server/services/invoice.service");
    const t = tool("create_invoice");
    const input = t.inputSchema.parse({
      clientName: "Acme",
      amount: 5000,
      dueDate: "2026-08-01",
      invoiceNumber: "INV-1",
    });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(invoiceService.create).toHaveBeenCalledWith("org1", expect.objectContaining({ amount: 5000 }));
  });

  it("mark_invoice_paid.execute sets status PAID", async () => {
    const { invoiceService } = await import("@/server/services/invoice.service");
    const t = tool("mark_invoice_paid");
    const input = t.inputSchema.parse({ invoiceId: "inv1" });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(invoiceService.update).toHaveBeenCalledWith("org1", "inv1", { status: "PAID" });
  });

  it("write_off_invoice.execute calls invoiceService.writeOff", async () => {
    const { invoiceService } = await import("@/server/services/invoice.service");
    const t = tool("write_off_invoice");
    const input = t.inputSchema.parse({ invoiceId: "inv1", reason: "bad debt" });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(invoiceService.writeOff).toHaveBeenCalledWith("org1", "inv1", "bad debt");
  });

  it("create_party.execute calls partyService.create", async () => {
    const { partyService } = await import("@/server/services/party.service");
    const t = tool("create_party");
    const input = t.inputSchema.parse({ name: "Acme Corp", type: "CUSTOMER" });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(partyService.create).toHaveBeenCalled();
  });

  it("update_party.execute calls partyService.update", async () => {
    const { partyService } = await import("@/server/services/party.service");
    const t = tool("update_party");
    const input = t.inputSchema.parse({ partyId: "party1", creditDays: 30 });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(partyService.update).toHaveBeenCalledWith(
      "org1",
      "party1",
      expect.objectContaining({ creditDays: 30 }),
      expect.anything(),
    );
  });

  it("create_bill.execute calls billService.create (not disabled)", async () => {
    const { billService } = await import("@/server/services/bill.service");
    const t = tool("create_bill");
    expect(t.disabled).not.toBe(true);
    const input = t.inputSchema.parse({
      partyId: "party1",
      billNumber: "BILL-1",
      dueDate: "2026-08-01",
      amount: 1000,
    });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(billService.create).toHaveBeenCalled();
  });

  it("send_reminder.execute calls reminderService.scheduleRemindersForInvoices", async () => {
    const { reminderService } = await import("@/server/services/reminder.service");
    const t = tool("send_reminder");
    const input = t.inputSchema.parse({ invoiceId: "inv1" });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(reminderService.scheduleRemindersForInvoices).toHaveBeenCalledWith("org1", ["inv1"]);
  });

  it("snooze_reminder.execute calls invoiceService.snooze", async () => {
    const { invoiceService } = await import("@/server/services/invoice.service");
    const t = tool("snooze_reminder");
    const input = t.inputSchema.parse({ invoiceId: "inv1", days: 5 });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(invoiceService.snooze).toHaveBeenCalledWith("org1", "inv1", 5);
  });

  it("update_reminder_settings.execute merges with current settings", async () => {
    const { reminderService } = await import("@/server/services/reminder.service");
    const t = tool("update_reminder_settings");
    const input = t.inputSchema.parse({ autoSend: false });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(reminderService.updateSettings).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ autoSend: false, reminderDays: [3, 7, 14] }),
    );
  });

  it("adjust_stock.execute calls stockService.adjust", async () => {
    const { stockService } = await import("@/server/services/stock.service");
    const t = tool("adjust_stock");
    const input = t.inputSchema.parse({ itemId: "item1", delta: -5, reason: "damaged" });
    const res = await t.execute(ctx, input);
    expect(res.ok).toBe(true);
    expect(stockService.adjust).toHaveBeenCalledWith(
      "org1",
      "item1",
      expect.objectContaining({ qty: -5, reason: "damaged" }),
      expect.anything(),
    );
  });

  it("renderActionDiff falls back to the tool summarize", () => {
    const out = renderActionDiff("record_payment", { invoiceId: "inv1", amount: 18500, mode: "UPI" });
    expect(out.length).toBeGreaterThan(0);
  });

  it("renderActionDiff falls back to generic label for unknown tool", () => {
    const out = renderActionDiff("nonexistent_tool", { foo: "bar" });
    expect(out).toContain("nonexistent_tool");
  });
});
