export interface SlashShortcut {
  command: string;
  description: string;
  expand(arg: string): string;
}

export const SLASH_SHORTCUTS: SlashShortcut[] = [
  {
    command: "/remind",
    description: "Draft reminders for a set of invoices, e.g. /remind all overdue > 30d",
    expand: (arg) =>
      `Draft payment reminders for the following selection of invoices and propose sending them: ${arg}. ` +
      `Use search_invoices to find the matching invoices first, then propose one send_reminder per invoice.`,
  },
  {
    command: "/aging",
    description: "Show the receivables aging report",
    expand: () => "Show me the receivables aging report broken down by 0-30, 31-60, 61-90, 90+ buckets.",
  },
  {
    command: "/ledger",
    description: "Show a party's ledger, e.g. /ledger Acme Ltd",
    expand: (arg) => `Show the party ledger statement for "${arg}". Use list_parties to resolve the party first.`,
  },
  {
    command: "/collect",
    description: "What should I chase today",
    expand: () => "Which overdue invoices should I prioritize collecting today, and why?",
  },
];

export function expandSlashShortcut(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("/")) return text;
  for (const s of SLASH_SHORTCUTS) {
    if (trimmed === s.command || trimmed.startsWith(s.command + " ")) {
      const arg = trimmed.slice(s.command.length).trim();
      return s.expand(arg);
    }
  }
  return text;
}
