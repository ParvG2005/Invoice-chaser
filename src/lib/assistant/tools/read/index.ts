import type { ToolDefinition } from "@/lib/assistant/tools/types";
import { searchInvoices } from "./search-invoices";
import { getInvoice } from "./get-invoice";
import { getPartyLedger } from "./get-party-ledger";
import { listParties } from "./list-parties";
import { getAnalytics } from "./get-analytics";
import { getAgingReport } from "./get-aging-report";
import { getCashflow } from "./get-cashflow";
import { getPartyAnalytics } from "./get-party-analytics";
import { getStock } from "./get-stock";
import { getItem } from "./get-item";
import { getCommunicationLog } from "./get-communication-log";
import { importStatus } from "./import-status";
import { getReminderSettings } from "./get-reminder-settings";
import { draftEmail } from "./draft-email";
import { draftWhatsapp } from "./draft-whatsapp";

// Note: `import_status` is `disabled: true` (no matching `importService`
// module exists — see import-status.ts) but stays in this array per the
// ToolDefinition contract: `buildRegistry` filters disabled tools out of the
// runtime registry, so it never reaches the model, but it's still visible
// here for tests/tooling that enumerate the full read-tool set.
export const READ_TOOLS: ToolDefinition[] = [
  searchInvoices,
  getInvoice,
  getPartyLedger,
  listParties,
  getAnalytics,
  getAgingReport,
  getCashflow,
  getPartyAnalytics,
  getStock,
  getItem,
  getCommunicationLog,
  importStatus,
  getReminderSettings,
  draftEmail,
  draftWhatsapp,
];
