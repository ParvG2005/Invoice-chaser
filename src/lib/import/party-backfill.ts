export interface BackfillInvoice {
  id: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
}

export interface PartySeed {
  name: string;
  email: string | null;
  phone: string | null;
  invoiceIds: string[];
}

/**
 * Groups invoices by normalized client name (trimmed, case-insensitive) into
 * Party seeds. First-seen display name wins; first non-empty email/phone win.
 */
export function groupInvoicesForBackfill(invoices: BackfillInvoice[]): PartySeed[] {
  const groups = new Map<string, PartySeed>();

  for (const invoice of invoices) {
    const displayName = invoice.clientName.trim();
    if (!displayName) continue;
    const key = displayName.toLowerCase();

    let group = groups.get(key);
    if (!group) {
      group = { name: displayName, email: null, phone: null, invoiceIds: [] };
      groups.set(key, group);
    }

    if (!group.email && invoice.clientEmail?.trim()) group.email = invoice.clientEmail.trim();
    if (!group.phone && invoice.clientPhone?.trim()) group.phone = invoice.clientPhone.trim();
    group.invoiceIds.push(invoice.id);
  }

  return Array.from(groups.values());
}
