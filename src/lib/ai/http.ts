import { createLogger } from "@/lib/logger";

const log = createLogger("ai-http");

export interface FetchWithRetryOptions {
  /** Abort the request after this many ms (per attempt). */
  timeoutMs?: number;
  /** Total number of attempts (initial + retries). */
  attempts?: number;
  /** Base delay used for exponential backoff between attempts. */
  baseDelayMs?: number;
  /** Label used in logs. */
  provider: string;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch() wrapper that adds a per-attempt timeout and bounded exponential-backoff
 * retries for transient failures (network errors and 408/429/5xx responses).
 *
 * On a non-retryable error response the body is read and thrown so callers keep
 * the provider's error detail. On exhausting retries the last error is thrown.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions,
): Promise<Response> {
  const { timeoutMs = 30_000, attempts = 3, baseDelayMs = 400, provider } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (response.ok) {
        return response;
      }

      if (isRetryableStatus(response.status) && attempt < attempts) {
        const body = await response.text().catch(() => "");
        lastError = new Error(`${provider} error ${response.status}: ${body}`);
        log.warn("Retryable AI response", {
          provider,
          status: response.status,
          attempt,
        });
        await delay(baseDelayMs * 2 ** (attempt - 1));
        continue;
      }

      // Non-retryable status (or last attempt): surface the body to the caller.
      const body = await response.text().catch(() => "");
      throw new Error(`${provider} error ${response.status}: ${body}`);
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      const isLast = attempt === attempts;
      // A thrown non-retryable HTTP error already carries "error <status>"; only
      // retry genuine transport/timeout failures.
      const isTransport = isAbort || error instanceof TypeError; /* fetch network error */

      if (!isTransport || isLast) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }

      log.warn("Transient AI request failure, retrying", {
        provider,
        attempt,
        reason: isAbort ? "timeout" : "network",
      });
      await delay(baseDelayMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${provider} request failed`);
}
