import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AssistantStreamEvent } from "@/lib/assistant/client";

interface FinalMessageBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface FinalMessage {
  stop_reason: string;
  content: FinalMessageBlock[];
  usage: { input_tokens: number; output_tokens: number };
}

// Mock the SDK: first turn returns a write tool_use, second returns end_turn text.
const streams: ReturnType<typeof fakeStream>[] = [];
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

function fakeStream(finalMessage: FinalMessage) {
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
    const events: AssistantStreamEvent[] = [];
    for await (const ev of runAssistantTurn({ ctx, sessionId: "s1", modelTier: "default", priorMessages: [], userText: "record 18500 on inv1" })) {
      events.push(ev);
    }
    const proposed = events.find((e) => e.type === "proposed_action");
    expect(proposed).toBeTruthy();
    expect(proposed && proposed.type === "proposed_action" && proposed.action.status).toBe("PROPOSED");
    const { assistantService } = await import("@/server/services/assistant.service");
    expect(assistantService.proposeWriteAction).toHaveBeenCalled();
    expect(assistantService.dispatchReadTool).not.toHaveBeenCalled();
  });

  it("a tool that throws still produces a matching tool_result instead of crashing the turn", async () => {
    const { assistantService } = await import("@/server/services/assistant.service");
    vi.mocked(assistantService.dispatchReadTool).mockRejectedValueOnce(new Error("Invoice not found"));

    const { runAssistantTurn } = await import("@/lib/assistant/client");
    streams.push(
      fakeStream({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu1", name: "get_invoice", input: { invoiceId: "bad-id" } }],
        usage: { input_tokens: 5, output_tokens: 2 },
      }),
    );
    streams.push(
      fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "Sorry, I couldn't find that." }], usage: { input_tokens: 2, output_tokens: 3 } }),
    );

    const ctx = { organizationId: "org1", userId: "u1", role: "member" as const };
    const events: AssistantStreamEvent[] = [];
    // Must not throw — a thrown tool must still resolve into a tool_result event and a done event.
    for await (const ev of runAssistantTurn({ ctx, sessionId: "s1", modelTier: "default", priorMessages: [], userText: "mark it paid" })) {
      events.push(ev);
    }

    const toolResultEvent = events.find((e) => e.type === "tool_result");
    expect(toolResultEvent).toMatchObject({ type: "tool_result", toolName: "get_invoice", ok: false });
    expect(events.at(-1)).toMatchObject({ type: "done" });

    // The tool_result appended to conversation history must be an error result
    // tied to the original tool_use_id, so the next turn's history stays valid.
    const appendCalls = vi.mocked(assistantService.appendMessage).mock.calls;
    const toolResultsMessage = appendCalls.find(
      ([, , role, content]) => role === "USER" && Array.isArray(content) && content[0]?.tool_use_id === "tu1",
    );
    expect(toolResultsMessage?.[3]).toMatchObject([{ tool_use_id: "tu1", is_error: true }]);
  });
});
