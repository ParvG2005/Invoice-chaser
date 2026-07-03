import { createLogger } from "@/lib/logger";
import { fetchWithRetry } from "@/lib/ai/http";
import type { AiCompletionRequest, AiCompletionResponse, AiProvider } from "@/lib/ai/types";

const log = createLogger("gemini-provider");
const DEFAULT_TIMEOUT_MS = 30_000;

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "gemini-2.0-flash",
  ) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const start = Date.now();

    // v1beta has broader model support; embed system prompt in user message
    // to avoid systemInstruction field compatibility issues across API versions
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const combinedPrompt = `${request.systemPrompt}\n\n---\n\n${request.userPrompt}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: combinedPrompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: request.maxTokens ?? 800,
            temperature: request.temperature ?? 0.7,
          },
        }),
      },
      { provider: "Gemini", timeoutMs: DEFAULT_TIMEOUT_MS },
    );

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { totalTokenCount?: number };
    };

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!content) {
      throw new Error("Empty Gemini response");
    }

    log.info("Gemini request successful", { model: this.model });

    return {
      content,
      model: this.model,
      tokensUsed: data.usageMetadata?.totalTokenCount,
      latencyMs: Date.now() - start,
    };
  }
}

export function createGeminiProvider(): GeminiProvider | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GeminiProvider(apiKey, process.env.GEMINI_MODEL ?? "gemini-2.0-flash");
}
