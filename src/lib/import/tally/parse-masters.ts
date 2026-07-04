import { parseTallyEnvelope, asArray, text, num } from "@/lib/import/tally/xml";
import type { ParseResult, ParseWarning, TallyLedger } from "@/lib/import/tally/types";

/** Extract "30" from "30 Days"; Tally may also export plain "30". */
function parseCreditPeriodDays(raw: string): number | undefined {
  const match = raw.trim().match(/^\d+/);
  return match ? Number.parseInt(match[0], 10) : undefined;
}

export function parseLedgers(xml: string): ParseResult<TallyLedger> {
  const messages = parseTallyEnvelope(xml);
  const records: TallyLedger[] = [];
  const warnings: ParseWarning[] = [];

  let index = -1;
  for (const message of messages) {
    for (const node of asArray<Record<string, unknown>>(
      message.LEDGER as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )) {
      index += 1;
      const name = text(node["@_NAME"]) || text(node.NAME);
      const guid = text(node.GUID);
      const path = `LEDGER[${index}] ${name || "(unnamed)"}`;

      if (!guid) {
        warnings.push({ path, message: "Skipped: no GUID (re-export with default XML settings)" });
        continue;
      }
      if (!name) {
        warnings.push({ path, message: "Skipped: no NAME attribute" });
        continue;
      }

      const addressList = node["ADDRESS.LIST"] as Record<string, unknown> | undefined;
      const addressLines = asArray(addressList?.ADDRESS).map(text).filter(Boolean);

      records.push({
        guid,
        alterId: num(node.ALTERID),
        name,
        parent: text(node.PARENT),
        email: text(node.EMAIL) || undefined,
        phone: text(node.LEDGERPHONE) || text(node.LEDGERMOBILE) || undefined,
        gstin: text(node.PARTYGSTIN) || text(node.GSTIN) || undefined,
        address: addressLines.length > 0 ? addressLines.join(", ") : undefined,
        creditPeriodDays: parseCreditPeriodDays(text(node.BILLCREDITPERIOD) || text(node.CREDITPERIOD)),
        openingBalance: num(node.OPENINGBALANCE),
        isBillWiseOn: text(node.ISBILLWISEON).toLowerCase() === "yes",
      });
    }
  }

  return { records, warnings };
}
