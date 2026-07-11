import type { ApiResponse } from "@/types";

/**
 * Pull the offending field names out of a Zod `flatten()` payload (what the API
 * handler attaches to a 422) so a validation failure surfaces as e.g.
 * "Invalid request: buyerGstin, lineItems.0.description" instead of a bare
 * "Invalid request" the user (and we) can't act on.
 */
function fieldErrorSummary(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const d = details as {
    issues?: { path: string; message: string }[];
    fieldErrors?: Record<string, unknown>;
  };

  // Prefer the full issue paths (e.g. "invoices.0.lineItems.2.qty") over the
  // flattened top-level keys, which collapse every nested array error under a
  // single field name.
  if (Array.isArray(d.issues) && d.issues.length > 0) {
    return d.issues
      .slice(0, 5)
      .map((i) => (i.path ? `${i.path} (${i.message})` : i.message))
      .join("; ");
  }

  if (d.fieldErrors && typeof d.fieldErrors === "object") {
    const withMessages = Object.entries(d.fieldErrors).flatMap(([key, msgs]) =>
      Array.isArray(msgs) ? msgs.map((m) => `${key}: ${m}`) : [],
    );
    if (withMessages.length > 0) return withMessages.slice(0, 5).join("; ");
    const fields = Object.keys(d.fieldErrors);
    return fields.length ? fields.join(", ") : null;
  }

  return null;
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
