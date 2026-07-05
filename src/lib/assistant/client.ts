import Anthropic from "@anthropic-ai/sdk";
import { buildRegistry, toAnthropicTools } from "@/lib/assistant/tools/registry";
import { resolveModel, type AssistantModelTier } from "@/lib/assistant/models";
import { buildSystemPrompt } from "@/lib/assistant/system-prompt";
import { assistantService } from "@/server/services/assistant.service";
import type { ToolContext } from "@/lib/assistant/tools/types";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export type AssistantStreamEvent =
  | { type: "text"; delta: string }
  | { type: "proposed_action"; action: { id: string; status: string; diffSummary: string } }
  | { type: "tool_result"; toolName: string; ok: boolean }
  | { type: "done"; usage: { inputTokens: number; outputTokens: number } };

interface TurnParams {
  ctx: ToolContext;
  sessionId: string;
  modelTier: AssistantModelTier;
  priorMessages: Anthropic.MessageParam[];
  userText: string;
  contextChip?: string;
}

const MAX_ITERATIONS = 8;

export async function* runAssistantTurn(params: TurnParams): AsyncGenerator<AssistantStreamEvent> {
  const { ctx, sessionId, modelTier } = params;
  const registry = buildRegistry(ctx);
  // toAnthropicTools returns jsonSchema as Record<string, unknown>; the SDK's
  // Tool.InputSchema type requires a literal `type: "object"` we can't express
  // from the registry's generic schema type without widening ToolDefinition itself.
  const tools = toAnthropicTools(registry) as Anthropic.Tool[];
  const model = resolveModel(modelTier);
  const system = buildSystemPrompt(ctx);

  const userContent = params.contextChip
    ? `${params.contextChip}\n\n${params.userText}`
    : params.userText;

  const messages: Anthropic.MessageParam[] = [
    ...params.priorMessages,
    { role: "user", content: userContent },
  ];
  await assistantService.appendMessage(ctx, sessionId, "USER", messages[messages.length - 1].content);

  let totalIn = 0;
  let totalOut = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const stream = client().messages.stream({
      model,
      max_tokens: 64000,
      system,
      tools,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", delta: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    totalIn += final.usage.input_tokens ?? 0;
    totalOut += final.usage.output_tokens ?? 0;
    messages.push({ role: "assistant", content: final.content });
    await assistantService.appendMessage(ctx, sessionId, "ASSISTANT", final.content);

    if (final.stop_reason !== "tool_use") break;

    const toolUses = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // ALL tool_result blocks must go back in ONE user message.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const tool = registry.get(call.name);
      if (!tool) {
        toolResults.push({ type: "tool_result", tool_use_id: call.id, content: "Tool not available.", is_error: true });
        continue;
      }
      if (tool.kind === "read") {
        const res = await assistantService.dispatchReadTool(ctx, call.name, call.input);
        yield { type: "tool_result", toolName: call.name, ok: res.ok };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(res.ok ? res.data : { error: res.error }),
          is_error: !res.ok,
        });
      } else {
        // WRITE: never execute — persist a PROPOSED action and tell the model.
        const action = await assistantService.proposeWriteAction(ctx, sessionId, call.name, call.input);
        yield { type: "proposed_action", action };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Proposed action ${action.id} created and is awaiting user approval. It has NOT executed. Do not assume it succeeded.`,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
    await assistantService.appendMessage(ctx, sessionId, "USER", toolResults);
  }

  yield { type: "done", usage: { inputTokens: totalIn, outputTokens: totalOut } };
}
