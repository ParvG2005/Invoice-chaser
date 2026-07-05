import { describe, it, expect, vi, beforeEach } from "vitest";
import { assistantService } from "@/server/services/assistant.service";
import type { ToolContext } from "@/lib/assistant/tools/types";

const ctx: ToolContext = { organizationId: "org1", userId: "u1", role: "member" };

const db = {
  actions: new Map<string, any>(),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assistantAction: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `act${db.actions.size + 1}`, ...data };
        db.actions.set(row.id, row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        const row = db.actions.get(where.id) ?? null;
        if (!row) return null;
        if (where.organizationId && row.organizationId !== where.organizationId) return null;
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = { ...db.actions.get(where.id), ...data };
        db.actions.set(where.id, row);
        return row;
      }),
    },
    assistantSession: { create: vi.fn(async ({ data }: any) => ({ id: "s1", ...data })) },
    assistantMessage: { create: vi.fn(async ({ data }: any) => ({ id: "m1", ...data })) },
  },
}));

// `record_payment` (the write tool used below) resolves the invoice's party
// via invoiceService.get, then calls paymentService.create — there is no
// single-invoice "record payment" entry point on the real service.
vi.mock("@/server/services/invoice.service", () => ({
  invoiceService: {
    get: vi.fn(async (_orgId: string, id: string) => ({ id, partyId: "party1" })),
  },
}));

const recorded: string[] = [];
vi.mock("@/server/services/payment.service", () => ({
  paymentService: {
    create: vi.fn(async () => {
      recorded.push("paid");
      return { id: "pay1" };
    }),
  },
}));

describe("approval loop — the canonical invariant", () => {
  beforeEach(() => {
    db.actions.clear();
    recorded.length = 0;
  });

  it("proposeWriteAction persists PROPOSED and does NOT execute", async () => {
    const action = await assistantService.proposeWriteAction(ctx, "s1", "record_payment", {
      invoiceId: "inv1",
      amount: 18500,
      mode: "UPI",
    });
    expect(action.status).toBe("PROPOSED");
    expect(action.diffSummary).toMatch(/18[,.]?500/);
    expect(recorded).toHaveLength(0); // NOTHING executed
  });

  it("dispatchReadTool refuses to run a write tool", async () => {
    await expect(
      assistantService.dispatchReadTool(ctx, "record_payment", {
        invoiceId: "inv1",
        amount: 1,
        mode: "CASH",
      }),
    ).rejects.toThrow();
    expect(recorded).toHaveLength(0);
  });

  it("approveAction executes and marks EXECUTED", async () => {
    const proposed = await assistantService.proposeWriteAction(ctx, "s1", "record_payment", {
      invoiceId: "inv1",
      amount: 18500,
      mode: "UPI",
    });
    const done = await assistantService.approveAction(ctx, proposed.id);
    expect(done.status).toBe("EXECUTED");
    expect(done.approvedBy).toBe("u1");
    expect(recorded).toEqual(["paid"]);
  });

  it("approveAction rejects cross-org action ids", async () => {
    const proposed = await assistantService.proposeWriteAction(ctx, "s1", "record_payment", {
      invoiceId: "inv1",
      amount: 1,
      mode: "CASH",
    });
    await expect(
      assistantService.approveAction({ ...ctx, organizationId: "OTHER" }, proposed.id),
    ).rejects.toThrow();
  });

  it("viewer cannot propose a write action", async () => {
    await expect(
      assistantService.proposeWriteAction({ ...ctx, role: "viewer" }, "s1", "record_payment", {
        invoiceId: "inv1",
        amount: 1,
        mode: "CASH",
      }),
    ).rejects.toThrow();
  });

  it("rejectAction stores feedback and never executes", async () => {
    const proposed = await assistantService.proposeWriteAction(ctx, "s1", "record_payment", {
      invoiceId: "inv1",
      amount: 1,
      mode: "CASH",
    });
    const rej = await assistantService.rejectAction(ctx, proposed.id, "wrong invoice");
    expect(rej.status).toBe("REJECTED");
    expect(rej.rejectFeedback).toBe("wrong invoice");
    expect(recorded).toHaveLength(0);
  });
});
