/**
 * Wrap any database-sourced free text (invoice notes, party names, email or
 * WhatsApp reply bodies) so the model treats it strictly as data. Injection
 * defense is defense-in-depth: this fencing plus the system-prompt policy, and
 * — the real boundary — the fact that tools are the only capability surface.
 */
export function wrapUntrusted(source: string, text: string): string {
  // Strip any attempt to forge our own closing fence.
  const safe = String(text ?? "").replaceAll("</untrusted-data>", "");
  return `<untrusted-data source="${source}">\n${safe}\n</untrusted-data>`;
}
