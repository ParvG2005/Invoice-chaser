import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SDK: first turn returns a write tool_use, second returns end_turn text.
const streams: any[] = [];
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = {
        stream: vi.fn(() => streams.shift()),
      };
    },
  };
});

vi.mock("@/server/services/assistant.service", () => ({
  assistantService: {
    dispatchReadTool: vi.fn(),
    proposeWriteAction: vi.fn(async () => ({ id: "act1", status: "PROPOSED", diffSummary: "Record ₹18,500" })),
    appendMessage: vi.fn(async () => ({})),
  },
}));

function fakeStream(finalMessage: any) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const block of finalMessage.content) {
        if (block.type === "text") {
          yield { type: "content_block_delta", delta: { type: "text_delta", text: block.text } };
        }
      }
    },
    finalMessage: async () => finalMessage,
  };
}

describe("runAssistantTurn", () => {
  beforeEach(() => { streams.length = 0; });

  it("a write tool_use becomes a proposed_action event, not an execution", async () => {
    const { runAssistantTurn } = await import("@/lib/assistant/client");
    streams.push(
      fakeStream({
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "I'll record that." },
          { type: "tool_use", id: "tu1", name: "record_payment", input: { invoiceId: "inv1", amount: 18500, mode: "UPI" } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
    streams.push(
      fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "Done — awaiting your approval." }], usage: { input_tokens: 3, output_tokens: 4 } }),
    );

    const ctx = { organizationId: "org1", userId: "u1", role: "member" as const };
    const events: any[] = [];
    for await (const ev of runAssistantTurn({ ctx, sessionId: "s1", modelTier: "default", priorMessages: [], userText: "record 18500 on inv1" })) {
      events.push(ev);
    }
    const proposed = events.find((e) => e.type === "proposed_action");
    expect(proposed).toBeTruthy();
    expect(proposed.action.status).toBe("PROPOSED");
    const { assistantService } = await import("@/server/services/assistant.service");
    expect(assistantService.proposeWriteAction).toHaveBeenCalled();
    expect(assistantService.dispatchReadTool).not.toHaveBeenCalled();
  });
});
