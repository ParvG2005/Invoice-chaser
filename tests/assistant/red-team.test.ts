import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MALICIOUS_INVOICE_NOTE,
  MALICIOUS_WHATSAPP_REPLY,
  CROSS_ORG_ATTEMPT,
} from "../fixtures/assistant/injection-fixtures";
import { wrapUntrusted } from "@/lib/assistant/untrusted";

const streams: any[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: vi.fn(() => streams.shift()) };
  },
}));

const executed: string[] = [];
vi.mock("@/server/services/payment.service", () => ({
  paymentService: { create: vi.fn(async () => { executed.push("record"); return { id: "p" }; }) },
}));
vi.mock("@/server/services/invoice.service", () => ({
  invoiceService: {
    update: vi.fn(async () => { executed.push("update"); return { id: "i" }; }),
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({ id: "inv1", notes: MALICIOUS_INVOICE_NOTE })),
  },
}));
vi.mock("@/server/services/audit.service", () => ({
  withAudit: vi.fn(async (_a: any, _b: any, _c: any, fn: any) => fn()),
}));

const proposed: any[] = [];
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assistantAction: {
      create: vi.fn(async ({ data }: any) => { const a = { id: `a${proposed.length}`, ...data }; proposed.push(a); return a; }),
    },
    assistantMessage: { create: vi.fn(async () => ({})) },
    assistantSession: { findFirst: vi.fn(async () => ({ id: "s1" })) },
  },
}));

function stream(finalMessage: any) {
  return {
    async *[Symbol.asyncIterator]() {},
    finalMessage: async () => finalMessage,
  };
}

describe("red-team: injection never yields an unapproved action", () => {
  beforeEach(() => { streams.length = 0; executed.length = 0; proposed.length = 0; });

  it("a model coerced into calling mark_invoice_paid only PROPOSES, never executes", async () => {
    const { runAssistantTurn } = await import("@/lib/assistant/client");
    // Adversarial model: attempts a write tool_use.
    streams.push(stream({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "mark_invoice_paid", input: { invoiceId: "inv1" } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    streams.push(stream({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } }));

    const ctx = { organizationId: "org1", userId: "u1", role: "member" as const };
    const events: any[] = [];
    for await (const ev of runAssistantTurn({ ctx, sessionId: "s1", modelTier: "default", priorMessages: [], userText: wrapUntrusted("invoice_notes", MALICIOUS_INVOICE_NOTE) })) {
      events.push(ev);
    }
    expect(executed).toHaveLength(0); // NOTHING executed without approval
    expect(proposed).toHaveLength(1); // exactly one PROPOSED action
    expect(proposed[0].status).toBe("PROPOSED");
  });

  it("a viewer session cannot even be offered write tools (registry excludes them)", async () => {
    const { buildRegistry } = await import("@/lib/assistant/tools/registry");
    const reg = buildRegistry({ organizationId: "org1", userId: "u1", role: "viewer" });
    expect([...reg.values()].some((t) => t.kind === "write")).toBe(false);
  });

  it("wrapUntrusted neutralizes an attempt to break out of the data fence", () => {
    const out = wrapUntrusted("communication_body", MALICIOUS_WHATSAPP_REPLY);
    // The forged closing tag is stripped so the payload stays inside the fence.
    expect(out.match(/<\/untrusted-data>/g)?.length).toBe(1);
  });

  it("cross-org request cannot widen scope — organizationId comes from ctx only", async () => {
    // The tool schemas contain no organizationId field; the model cannot supply one.
    const { buildRegistry } = await import("@/lib/assistant/tools/registry");
    const reg = buildRegistry({ organizationId: "org1", userId: "u1", role: "member" });
    for (const tool of reg.values()) {
      const props = (tool.jsonSchema as any).properties ?? {};
      expect(Object.keys(props)).not.toContain("organizationId");
    }
    expect(CROSS_ORG_ATTEMPT).toContain("org-999"); // fixture sanity
  });
});
