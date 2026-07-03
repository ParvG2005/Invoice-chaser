import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createGroqProvider } from "@/lib/ai/providers/groq";
import type { AiProvider, AiCompletionRequest, AiCompletionResponse } from "@/lib/ai/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("fallback-ai-provider");

export class FallbackAiProvider implements AiProvider {
  readonly name = "fallback-provider";

  constructor(
    private readonly primary: AiProvider,
    private readonly fallback: AiProvider,
  ) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    try {
      return await this.primary.complete(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`Primary AI provider (${this.primary.name}) failed. Falling back to (${this.fallback.name}). Error: ${message}`);
      return await this.fallback.complete(request);
    }
  }
}

let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (!provider) {
    const groq = createGroqProvider();
    const gemini = createGeminiProvider();

    if (groq && gemini) {
      provider = new FallbackAiProvider(groq, gemini);
    } else if (groq) {
      provider = groq;
    } else if (gemini) {
      provider = gemini;
    } else {
      throw new Error("Neither GROQ_API_KEY nor GEMINI_API_KEY is configured in environment variables");
    }
  }
  return provider;
}

export function setAiProvider(customProvider: AiProvider) {
  provider = customProvider;
}
