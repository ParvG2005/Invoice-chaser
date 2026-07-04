import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * Low-level helpers shared by all Tally parsers. Pure functions — safe in
 * browser (wizard preview) and Node (Inngest import job).
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep every value as a string; Tally numbers carry signs/commas/units
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

/** Parse a Tally ENVELOPE and return the TALLYMESSAGE nodes (objects). */
export function parseTallyEnvelope(xml: string): Record<string, unknown>[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    throw new Error(`Invalid Tally XML: ${valid.err.msg} (line ${valid.err.line})`);
  }
  const doc = parser.parse(xml) as Record<string, unknown>;
  const body = (doc.ENVELOPE as Record<string, unknown> | undefined)?.BODY as
    | Record<string, unknown>
    | undefined;
  const data = (body?.IMPORTDATA ?? body?.EXPORTDATA) as Record<string, unknown> | undefined;
  const requestData = data?.REQUESTDATA as Record<string, unknown> | undefined;
  const messages = asArray<Record<string, unknown>>(
    requestData?.TALLYMESSAGE as Record<string, unknown> | Record<string, unknown>[] | undefined,
  );
  if (messages.length === 0) {
    throw new Error(
      "No TALLYMESSAGE nodes found — is this a Tally Prime XML export? Expected ENVELOPE > BODY > IMPORTDATA/EXPORTDATA > REQUESTDATA > TALLYMESSAGE.",
    );
  }
  return messages;
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** fast-xml-parser may yield strings, numbers, or objects with #text. */
export function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") {
    const t = (v as Record<string, unknown>)["#text"];
    return t === undefined || t === null ? "" : String(t).trim();
  }
  return String(v).trim();
}

/** Parse a Tally amount string, stripping Indian-format commas. Junk → 0. */
export function num(v: unknown): number {
  const s = text(v).replace(/,/g, "");
  if (!s) return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Tally dates are YYYYMMDD (sometimes already ISO). Returns YYYY-MM-DD or null. */
export function parseTallyDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const clean = trimmed.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

/** "5 nos" → 5; "-2.500 kg" → -2.5. Leading number, unit suffix ignored. */
export function parseTallyQuantity(raw: string): number {
  const match = raw.trim().match(/^-?[\d,]*\.?\d+/);
  if (!match) return 0;
  const n = Number.parseFloat(match[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** "1,200.00/nos" → 1200. Number before the slash. */
export function parseTallyRate(raw: string): number {
  return parseTallyQuantity(raw.split("/")[0] ?? "");
}
