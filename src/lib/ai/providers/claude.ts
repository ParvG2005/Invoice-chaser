import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "@/lib/logger";
import type { AiCompletionRequest, AiCompletionResponse, AiProvider } from "@/lib/ai/types";

const log = createLogger("claude-provider");

/**
 * Third fallback tier for reminder email/WhatsApp drafting, behind Groq and
 * Gemini. Sonnet 5 rejects non-default temperature/top_p/top_k, so this
 * provider never forwards request.temperature — tone is steered by the
 * prompt alone, same as the rest of the reminder-drafting pipeline.
 */
export class ClaudeProvider implements AiProvider {
  readonly name = "claude";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-sonnet-5",
  ) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const start = Date.now();
    const client = new Anthropic({ apiKey: this.apiKey });

    try {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 800,
        thinking: { type: "disabled" },
        system: request.systemPrompt,
        messages: [{ role: "user", content: request.userPrompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const content = textBlock?.text?.trim();
      if (!content) {
        throw new Error("Empty Claude response");
      }

      log.info("Claude request successful", { model: this.model });

      return {
        content,
        model: this.model,
        tokensUsed: (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0),
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      log.error("Claude request failed", { error: message });
      throw error;
    }
  }
}

export function createClaudeProvider(): ClaudeProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new ClaudeProvider(apiKey, "claude-sonnet-5");
}
