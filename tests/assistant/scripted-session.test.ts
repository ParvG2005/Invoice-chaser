import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "@/lib/assistant/tools/types";

type Row = Record<string, unknown> & { id: string };

const ctx: ToolContext = { organizationId: "org1", userId: "u1", role: "member" };

const db = {
  actions: new Map<string, Row>(),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assistantAction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: `act${db.actions.size + 1}`, ...data };
        db.actions.set(row.id, row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId?: string } }) => {
        const row = db.actions.get(where.id) ?? null;
        if (!row) return null;
        if (where.organizationId && row.organizationId !== where.organizationId) return null;
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row: Row = { ...(db.actions.get(where.id) as Row), ...data };
        db.actions.set(where.id, row);
        return row;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; organizationId?: string; status?: string };
          data: Record<string, unknown>;
        }) => {
          const row = db.actions.get(where.id);
          if (!row) return { count: 0 };
          if (where.organizationId && row.organizationId !== where.organizationId) return { count: 0 };
          if (where.status && row.status !== where.status) return { count: 0 };
          db.actions.set(where.id, { ...row, ...data });
          return { count: 1 };
        },
      ),
    },
    assistantSession: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "s1", ...data })) },
    assistantMessage: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "m1", ...data })) },
  },
}));

// `create_invoice` is the canonical write tool that calls its service via an
// *outer* `withAudit` (unlike `record_payment`/`create_party`/etc., which
// call self-auditing services directly — see write.test.ts) — it's the tool
// that actually exercises "one withAudit call per executed action" cleanly.
vi.mock("@/server/services/invoice.service", () => ({
  invoiceService: {
    create: vi.fn(async (_org: string, input: unknown) => ({ id: "inv-created", ...(input as object) })),
  },
}));

vi.mock("@/server/services/audit.service", () => ({
  withAudit: vi.fn(
    async (
      _actor: { type: string; id: string },
      _action: string,
      _entity: unknown,
      fn: () => unknown,
    ) => fn(),
  ),
}));

describe("scripted 20-action session — complete audit trail", () => {
  beforeEach(() => {
    db.actions.clear();
    vi.clearAllMocks();
  });

  it("20 proposed actions: approved -> EXECUTED+audited, rejected -> REJECTED, none auto-executed", async () => {
    const { assistantService } = await import("@/server/services/assistant.service");
    const { withAudit } = await import("@/server/services/audit.service");

    const proposedIds: string[] = [];
    for (let n = 0; n < 20; n++) {
      const a = await assistantService.proposeWriteAction(ctx, "s1", "create_invoice", {
        clientName: `Client ${n}`,
        amount: 1000 + n,
        dueDate: "2026-08-01",
        invoiceNumber: `INV-${n}`,
      });
      expect(a.status).toBe("PROPOSED");
      proposedIds.push(a.id);
    }

    // Every proposed action has a matching AssistantAction row.
    expect(db.actions.size).toBe(20);

    // Nothing executes merely by being proposed.
    expect(vi.mocked(withAudit)).not.toHaveBeenCalled();

    // Approve the first 15, reject the last 5.
    for (const id of proposedIds.slice(0, 15)) {
      const done = await assistantService.approveAction(ctx, id);
      expect(done.status).toBe("EXECUTED");
      expect(done.approvedBy).toBe("u1");
      expect(done.executedAt).toBeTruthy();
    }
    for (const id of proposedIds.slice(15)) {
      const r = await assistantService.rejectAction(ctx, id, "not now");
      expect(r.status).toBe("REJECTED");
      expect(r.rejectFeedback).toBe("not now");
    }

    // Final state check across all 20 rows: no action is EXECUTED without
    // having gone through approveAction, and no action is left dangling.
    const finalRows = [...db.actions.values()];
    expect(finalRows).toHaveLength(20);
    const executed = finalRows.filter((r) => r.status === "EXECUTED");
    const rejected = finalRows.filter((r) => r.status === "REJECTED");
    expect(executed).toHaveLength(15);
    expect(rejected).toHaveLength(5);
    for (const row of executed) {
      expect(row.approvedBy).toBe("u1");
      expect(row.executedAt).toBeTruthy();
    }
    for (const row of rejected) {
      expect(row.rejectFeedback).toBe("not now");
      expect(row.executedAt).toBeFalsy();
    }

    // Exactly 15 audited executions, one per approved action — never more
    // (that would mean double-execution) and never fewer (a silent skip).
    expect(vi.mocked(withAudit).mock.calls.length).toBe(15);
    for (const call of vi.mocked(withAudit).mock.calls) {
      expect(call[0]).toMatchObject({ type: "ASSISTANT", id: "u1" });
    }
  });
});
