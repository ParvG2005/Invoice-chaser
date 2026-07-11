import type { ApiResponse } from "@/types";

/**
 * Pull the offending field names out of a Zod `flatten()` payload (what the API
 * handler attaches to a 422) so a validation failure surfaces as e.g.
 * "Invalid request: buyerGstin, lineItems.0.description" instead of a bare
 * "Invalid request" the user (and we) can't act on.
 */
function fieldErrorSummary(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const fieldErrors = (details as { fieldErrors?: Record<string, unknown> }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") return null;
  const fields = Object.keys(fieldErrors);
  return fields.length ? fields.join(", ") : null;
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const json = (await response.json()) as ApiResponse<T>;

  if (!json.success) {
    const summary = fieldErrorSummary(json.error.details);
    throw new Error(summary ? `${json.error.message}: ${summary}` : json.error.message);
  }

  return json.data;
}
