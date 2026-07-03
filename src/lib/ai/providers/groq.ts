import { createLogger } from "@/lib/logger";
import { fetchWithRetry } from "@/lib/ai/http";
import type { AiCompletionRequest, AiCompletionResponse, AiProvider } from "@/lib/ai/types";

const log = createLogger("groq-provider");
const DEFAULT_TIMEOUT_MS = 30_000;

export class GroqProvider implements AiProvider {
  readonly name = "groq";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "llama-3.3-70b-versatile",
  ) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const start = Date.now();
    const url = "https://api.groq.com/openai/v1/chat/completions";

    try {
      const response = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: "system",
                content: request.systemPrompt,
              },
              {
                role: "user",
                content: request.userPrompt,
              },
            ],
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 800,
          }),
        },
        { provider: "Groq", timeoutMs: DEFAULT_TIMEOUT_MS },
      );

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("Empty Groq response");
      }

      log.info("Groq request successful", { model: this.model });

      return {
        content,
        model: this.model,
        tokensUsed: data.usage?.total_tokens,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      log.error("Groq request failed", { error: message });
      throw error;
    }
  }
}

export function createGroqProvider(): GroqProvider | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new GroqProvider(apiKey, process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile");
}
