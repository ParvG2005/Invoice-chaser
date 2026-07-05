import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createGroqProvider } from "@/lib/ai/providers/groq";
import { createClaudeProvider } from "@/lib/ai/providers/claude";
import type { AiProvider, AiCompletionRequest, AiCompletionResponse } from "@/lib/ai/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("fallback-ai-provider");

/** Tries each configured provider in order; only throws if every one fails. */
export class FallbackAiProvider implements AiProvider {
  readonly name = "fallback-provider";

  constructor(private readonly providers: AiProvider[]) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.complete(request);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`AI provider (${provider.name}) failed. Trying next fallback. Error: ${message}`);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("All AI providers failed");
  }
}

let provider: AiProvider | null = null;

// Fallback order: Groq -> Gemini -> claude-sonnet-5. Sonnet 5 is the last
// resort (never the primary) because it's the most expensive of the three.
export function getAiProvider(): AiProvider {
  if (!provider) {
    const providers = [createGroqProvider(), createGeminiProvider(), createClaudeProvider()].filter(
      (p): p is NonNullable<typeof p> => p !== null,
    );

    if (providers.length === 0) {
      throw new Error(
        "None of GROQ_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY is configured in environment variables",
      );
    }

    provider = providers.length === 1 ? providers[0] : new FallbackAiProvider(providers);
  }
  return provider;
}

export function setAiProvider(customProvider: AiProvider) {
  provider = customProvider;
}
